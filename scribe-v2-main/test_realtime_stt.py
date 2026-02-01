#!/usr/bin/env python3
"""
ElevenLabs Realtime Speech to Text テストスクリプト
音声ファイルをストリーミングでリアルタイムAPIに送信してテスト
"""

import os
import sys
import json
import asyncio
import tempfile
import base64
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.realtime.scribe import RealtimeAudioOptions, AudioFormat, CommitStrategy
from elevenlabs.realtime.connection import RealtimeEvents
import yt_dlp
import subprocess

load_dotenv()

OUTPUT_DIR = Path(__file__).parent / "results"


def download_audio_from_youtube(url: str, output_dir: str) -> tuple[str, str]:
    """YouTubeから音声をダウンロード（PCM形式）"""
    print(f"Downloading audio from: {url}")

    output_template = os.path.join(output_dir, "audio.%(ext)s")
    video_title = "unknown"

    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'outtmpl': output_template,
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'retries': 5,
        'fragment_retries': 5,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web'],
            }
        },
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_title = info.get('title', 'unknown')

    wav_path = os.path.join(output_dir, "audio.wav")

    # WAVを16kHz mono PCMに変換
    pcm_path = os.path.join(output_dir, "audio_16k.wav")
    subprocess.run([
        'ffmpeg', '-y', '-i', wav_path,
        '-ar', '16000', '-ac', '1', '-f', 'wav',
        pcm_path
    ], capture_output=True)

    print("Download complete!")
    return pcm_path, video_title


def format_timestamp(seconds: float) -> str:
    """秒数をMM:SS.ms形式に変換"""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:05.2f}"


async def transcribe_realtime(file_path: str) -> dict:
    """リアルタイムAPIで音声を文字起こし"""
    api_key = os.getenv("ELEVENLABS_API_KEY")

    if not api_key:
        print("Error: ELEVENLABS_API_KEY not found")
        sys.exit(1)

    print(f"Transcribing (Realtime): {file_path}")

    client = ElevenLabs(api_key=api_key)

    # 結果を保存するリスト
    all_transcripts = []
    all_words = []

    # コールバック関数
    def on_partial(data):
        text = data.get('text', '') if isinstance(data, dict) else getattr(data, 'text', '')
        if text:
            all_transcripts.append({
                'text': text,
                'is_final': False,
                'speaker_id': data.get('speaker_id') if isinstance(data, dict) else getattr(data, 'speaker_id', None),
            })
            display_text = text[:50] if len(text) > 50 else text
            print(f"  [partial] {display_text}...")

    def on_committed(data):
        text = data.get('text', '') if isinstance(data, dict) else getattr(data, 'text', '')
        if text:
            all_transcripts.append({
                'text': text,
                'is_final': True,
                'speaker_id': data.get('speaker_id') if isinstance(data, dict) else getattr(data, 'speaker_id', None),
            })
            display_text = text[:50] if len(text) > 50 else text
            print(f"  [FINAL] {display_text}...")

    def on_error(data):
        print(f"  [ERROR] {data}")

    # リアルタイム接続オプション
    options: RealtimeAudioOptions = {
        'model_id': 'scribe_v2_realtime',
        'audio_format': AudioFormat.PCM_16000,
        'sample_rate': 16000,
        'language_code': 'jpn',
        'include_timestamps': True,
        'commit_strategy': CommitStrategy.MANUAL,
    }

    # 接続
    connection = await client.speech_to_text.realtime.connect(options)
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, on_partial)
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, on_committed)
    connection.on(RealtimeEvents.ERROR, on_error)

    print("Starting realtime transcription...")

    # 音声ファイルを読み込んでチャンクで送信
    # 16kHz, 16bit mono = 32000 bytes/sec
    # リアルタイム相当の速度で送信
    sample_rate = 16000
    bytes_per_sample = 2  # 16bit
    chunk_duration_ms = 100  # 100msごとに送信
    chunk_size = int(sample_rate * bytes_per_sample * chunk_duration_ms / 1000)  # 3200 bytes

    try:

        with open(file_path, 'rb') as f:
            # WAVヘッダーをスキップ（44バイト）
            f.seek(44)

            chunk_count = 0
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                # Base64エンコードして送信
                audio_base64 = base64.b64encode(chunk).decode('utf-8')
                await connection.send({
                    "audio_base_64": audio_base64
                })
                chunk_count += 1

                # 進捗表示
                if chunk_count % 50 == 0:
                    elapsed = chunk_count * chunk_duration_ms / 1000
                    print(f"  Sent {chunk_count} chunks ({elapsed:.1f}s of audio)...")

                # リアルタイム相当の速度で送信（少し速め: 2倍速）
                await asyncio.sleep(chunk_duration_ms / 1000 / 2)

        print(f"  Total chunks sent: {chunk_count}")

        # 最終トランスクリプトをコミット
        await connection.commit()

        # 少し待って最終結果を受信
        await asyncio.sleep(3)

    finally:
        await connection.close()

    return {
        'transcripts': all_transcripts,
        'words': all_words,
    }


def analyze_realtime_results(results: dict) -> dict:
    """リアルタイム結果を分析"""
    transcripts = results.get('transcripts', [])

    # 最終的なテキストを結合
    final_texts = [t['text'] for t in transcripts if t.get('is_final', False)]
    full_text = ' '.join(final_texts) if final_texts else ' '.join([t['text'] for t in transcripts])

    # 話者分析（リアルタイムAPIで話者情報がある場合）
    speakers = {}
    for t in transcripts:
        speaker_id = t.get('speaker_id')
        if speaker_id:
            if speaker_id not in speakers:
                speakers[speaker_id] = {'count': 0, 'texts': []}
            speakers[speaker_id]['count'] += 1
            speakers[speaker_id]['texts'].append(t['text'])

    return {
        'full_text': full_text,
        'transcript_count': len(transcripts),
        'final_count': len(final_texts),
        'speakers': speakers,
        'has_speaker_info': len(speakers) > 0,
    }


def save_realtime_results(results: dict, analysis: dict, video_title: str, youtube_url: str) -> Path:
    """リアルタイム結果を保存"""
    OUTPUT_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_title = "".join(c for c in video_title[:30] if c.isalnum() or c in (' ', '-', '_')).strip()
    base_name = f"{timestamp}_realtime_{safe_title}"

    # JSONファイルに保存
    json_path = OUTPUT_DIR / f"{base_name}.json"
    json_data = {
        'metadata': {
            'video_title': video_title,
            'youtube_url': youtube_url,
            'timestamp': timestamp,
            'api_type': 'realtime',
        },
        'analysis': analysis,
        'raw_results': results,
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    # テキストファイルに保存
    txt_path = OUTPUT_DIR / f"{base_name}.txt"
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("ElevenLabs Realtime Speech to Text - 文字起こし結果\n")
        f.write("=" * 70 + "\n\n")

        f.write(f"動画タイトル: {video_title}\n")
        f.write(f"YouTube URL: {youtube_url}\n")
        f.write(f"処理日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"API種別: Realtime\n")
        f.write(f"トランスクリプト数: {analysis['transcript_count']}\n")
        f.write(f"確定トランスクリプト数: {analysis['final_count']}\n")
        f.write(f"話者分離: {'あり' if analysis['has_speaker_info'] else 'なし'}\n")
        f.write("\n")

        if analysis['has_speaker_info']:
            f.write("-" * 70 + "\n")
            f.write("話者統計\n")
            f.write("-" * 70 + "\n")
            for speaker_id, stats in analysis['speakers'].items():
                f.write(f"\n【{speaker_id}】\n")
                f.write(f"  発話回数: {stats['count']}回\n")
            f.write("\n")

        f.write("=" * 70 + "\n")
        f.write("全文\n")
        f.write("=" * 70 + "\n\n")
        f.write(analysis['full_text'] + "\n")

    return txt_path


async def main():
    # デフォルトのテスト用YouTube URL（短い動画を使用）
    default_url = "https://youtu.be/GhjHDihkquE"

    youtube_url = sys.argv[1] if len(sys.argv) > 1 else default_url

    print("=" * 70)
    print("ElevenLabs Realtime Speech to Text Test")
    print("=" * 70)

    with tempfile.TemporaryDirectory() as tmpdir:
        # YouTubeから音声をダウンロード
        audio_path, video_title = download_audio_from_youtube(youtube_url, tmpdir)

        if not os.path.exists(audio_path):
            print(f"Error: Audio file not found at {audio_path}")
            sys.exit(1)

        file_size = os.path.getsize(audio_path)
        print(f"\n動画タイトル: {video_title}")
        print(f"音声ファイルサイズ: {file_size / 1024:.2f} KB")

        # リアルタイム文字起こし実行
        print("\n" + "-" * 70)
        print("リアルタイム文字起こし中...")
        print("-" * 70 + "\n")

        results = await transcribe_realtime(audio_path)

        # 結果を分析
        print("\n結果を分析中...")
        analysis = analyze_realtime_results(results)

        # 結果を表示
        print("\n" + "=" * 70)
        print("REALTIME TRANSCRIPTION RESULT")
        print("=" * 70)
        print(f"\nトランスクリプト数: {analysis['transcript_count']}")
        print(f"確定トランスクリプト数: {analysis['final_count']}")
        print(f"話者分離: {'あり' if analysis['has_speaker_info'] else 'なし'}")

        if analysis['has_speaker_info']:
            print("\n話者統計:")
            for speaker_id, stats in analysis['speakers'].items():
                print(f"  【{speaker_id}】: {stats['count']}回")

        print(f"\n全文（先頭500文字）:\n{analysis['full_text'][:500]}...")

        # 結果を保存
        saved_path = save_realtime_results(results, analysis, video_title, youtube_url)
        print(f"\n結果を保存しました:")
        print(f"  テキスト: {saved_path}")
        print(f"  JSON: {saved_path.with_suffix('.json')}")


if __name__ == "__main__":
    asyncio.run(main())
