#!/usr/bin/env python3
"""
ElevenLabs Speech to Text テストスクリプト
YouTubeから音声をダウンロードしてSpeech to Text APIをテスト
話者分離機能の精度確認対応
"""

import os
import sys
import json
import tempfile
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import yt_dlp

load_dotenv()

# 出力ディレクトリ
OUTPUT_DIR = Path(__file__).parent / "results"


def download_audio_from_youtube(url: str, output_dir: str) -> tuple[str, str]:
    """YouTubeから音声をダウンロード"""
    print(f"Downloading audio from: {url}")

    output_template = os.path.join(output_dir, "audio.%(ext)s")
    video_title = "unknown"

    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_template,
        'noplaylist': True,
        'quiet': False,
        'no_warnings': False,
        'retries': 5,
        'fragment_retries': 5,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

    print("Download complete!")
    return os.path.join(output_dir, "audio.mp3"), video_title


def format_timestamp(seconds: float) -> str:
    """秒数をMM:SS.ms形式に変換"""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:05.2f}"


def transcribe_audio(file_path: str) -> dict:
    """ElevenLabs APIで音声を文字起こし"""
    api_key = os.getenv("ELEVENLABS_API_KEY")

    if not api_key:
        print("Error: ELEVENLABS_API_KEY not found in environment variables")
        print("Please create a .env file with your API key:")
        print("  ELEVENLABS_API_KEY=your_api_key_here")
        sys.exit(1)

    print(f"Transcribing: {file_path}")

    elevenlabs = ElevenLabs(api_key=api_key)

    with open(file_path, "rb") as audio_file:
        transcription = elevenlabs.speech_to_text.convert(
            file=audio_file,
            model_id="scribe_v2",
            tag_audio_events=True,
            language_code="jpn",  # 日本語
            diarize=True,
        )

    return transcription


def analyze_speakers(result) -> dict:
    """話者分析を行う"""
    if not hasattr(result, 'words') or not result.words:
        return {}

    speakers = {}
    segments = []
    current_speaker = None
    current_segment_words = []
    segment_start = 0

    for word in result.words:
        speaker_id = getattr(word, 'speaker_id', None)

        if speaker_id != current_speaker:
            # 話者が変わった場合、前のセグメントを保存
            if current_speaker is not None and current_segment_words:
                segment_text = ''.join([w.text for w in current_segment_words])
                segment_end = current_segment_words[-1].end
                segments.append({
                    'speaker': current_speaker,
                    'start': segment_start,
                    'end': segment_end,
                    'text': segment_text,
                    'word_count': len(current_segment_words)
                })

            # 新しいセグメント開始
            current_speaker = speaker_id
            current_segment_words = [word]
            segment_start = word.start
        else:
            current_segment_words.append(word)

        # 話者ごとの統計を更新
        if speaker_id not in speakers:
            speakers[speaker_id] = {
                'total_words': 0,
                'total_duration': 0,
                'segment_count': 0
            }
        speakers[speaker_id]['total_words'] += 1

    # 最後のセグメントを保存
    if current_speaker is not None and current_segment_words:
        segment_text = ''.join([w.text for w in current_segment_words])
        segment_end = current_segment_words[-1].end
        segments.append({
            'speaker': current_speaker,
            'start': segment_start,
            'end': segment_end,
            'text': segment_text,
            'word_count': len(current_segment_words)
        })

    # セグメントから話者ごとの発話時間を計算
    for seg in segments:
        speaker = seg['speaker']
        if speaker in speakers:
            speakers[speaker]['total_duration'] += (seg['end'] - seg['start'])
            speakers[speaker]['segment_count'] += 1

    return {
        'speakers': speakers,
        'segments': segments
    }


def save_results(result, analysis: dict, video_title: str, youtube_url: str) -> Path:
    """結果をファイルに保存"""
    OUTPUT_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_title = "".join(c for c in video_title[:30] if c.isalnum() or c in (' ', '-', '_')).strip()
    base_name = f"{timestamp}_{safe_title}"

    # JSONファイルに完全な結果を保存
    json_path = OUTPUT_DIR / f"{base_name}.json"
    json_data = {
        'metadata': {
            'video_title': video_title,
            'youtube_url': youtube_url,
            'timestamp': timestamp,
            'language_code': getattr(result, 'language_code', None),
            'language_probability': getattr(result, 'language_probability', None),
        },
        'full_text': getattr(result, 'text', ''),
        'speaker_analysis': {
            'speakers': analysis.get('speakers', {}),
            'segment_count': len(analysis.get('segments', []))
        },
        'segments': analysis.get('segments', []),
        'words': [
            {
                'text': w.text,
                'start': w.start,
                'end': w.end,
                'speaker_id': getattr(w, 'speaker_id', None),
                'type': getattr(w, 'type', None)
            }
            for w in (result.words if hasattr(result, 'words') and result.words else [])
        ]
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    # テキストファイルに読みやすい形式で保存
    txt_path = OUTPUT_DIR / f"{base_name}.txt"
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("ElevenLabs Speech to Text - 文字起こし結果\n")
        f.write("=" * 70 + "\n\n")

        f.write(f"動画タイトル: {video_title}\n")
        f.write(f"YouTube URL: {youtube_url}\n")
        f.write(f"処理日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"検出言語: {getattr(result, 'language_code', 'N/A')} ")
        f.write(f"(確信度: {getattr(result, 'language_probability', 'N/A'):.1%})\n")
        f.write("\n")

        # 話者統計
        speakers = analysis.get('speakers', {})
        if speakers:
            f.write("-" * 70 + "\n")
            f.write("話者統計\n")
            f.write("-" * 70 + "\n")
            for speaker_id, stats in sorted(speakers.items()):
                f.write(f"\n【{speaker_id}】\n")
                f.write(f"  発話回数: {stats['segment_count']}回\n")
                f.write(f"  総単語数: {stats['total_words']}語\n")
                f.write(f"  総発話時間: {stats['total_duration']:.2f}秒\n")
            f.write("\n")

        # 話者分離付きトランスクリプト
        segments = analysis.get('segments', [])
        if segments:
            f.write("=" * 70 + "\n")
            f.write("話者分離トランスクリプト\n")
            f.write("=" * 70 + "\n\n")

            for seg in segments:
                time_str = f"[{format_timestamp(seg['start'])} - {format_timestamp(seg['end'])}]"
                f.write(f"{time_str} 【{seg['speaker']}】\n")
                f.write(f"{seg['text']}\n\n")

        # フルテキスト
        f.write("=" * 70 + "\n")
        f.write("全文（話者分離なし）\n")
        f.write("=" * 70 + "\n\n")
        f.write(getattr(result, 'text', '') + "\n")

    return txt_path


def print_results(result, analysis: dict):
    """結果をターミナルに表示"""
    print("\n" + "=" * 70)
    print("話者統計")
    print("=" * 70)

    speakers = analysis.get('speakers', {})
    if speakers:
        for speaker_id, stats in sorted(speakers.items()):
            print(f"\n【{speaker_id}】")
            print(f"  発話回数: {stats['segment_count']}回")
            print(f"  総単語数: {stats['total_words']}語")
            print(f"  総発話時間: {stats['total_duration']:.2f}秒")
    else:
        print("話者情報がありません")

    print("\n" + "=" * 70)
    print("話者分離トランスクリプト")
    print("=" * 70 + "\n")

    segments = analysis.get('segments', [])
    if segments:
        for seg in segments:
            time_str = f"[{format_timestamp(seg['start'])} - {format_timestamp(seg['end'])}]"
            print(f"{time_str} 【{seg['speaker']}】")
            print(f"{seg['text']}\n")
    else:
        print("セグメント情報がありません")
        if hasattr(result, 'text'):
            print(f"\n全文:\n{result.text}")

    print("=" * 70)
    print(f"検出言語: {getattr(result, 'language_code', 'N/A')} ", end="")
    print(f"(確信度: {getattr(result, 'language_probability', 0):.1%})")
    if hasattr(result, 'words') and result.words:
        print(f"総単語数: {len(result.words)}")
    print("=" * 70)


def main():
    # デフォルトのテスト用YouTube URL
    default_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"

    # コマンドライン引数からURLを取得、なければデフォルト
    youtube_url = sys.argv[1] if len(sys.argv) > 1 else default_url

    print("=" * 70)
    print("ElevenLabs Speech to Text Test - 話者分離精度テスト")
    print("=" * 70)

    # 一時ファイルで音声をダウンロード
    with tempfile.TemporaryDirectory() as tmpdir:
        # YouTubeから音声をダウンロード
        audio_path, video_title = download_audio_from_youtube(youtube_url, tmpdir)

        # ファイルが存在するか確認
        actual_path = audio_path
        if not os.path.exists(actual_path):
            for ext in [".mp3", ".m4a", ".webm", ".opus"]:
                check_path = audio_path.replace(".mp3", "") + ext
                if os.path.exists(check_path):
                    actual_path = check_path
                    break

        if not os.path.exists(actual_path):
            print(f"Error: Audio file not found at {audio_path}")
            print(f"Files in {tmpdir}:")
            for f in os.listdir(tmpdir):
                print(f"  - {f}")
            sys.exit(1)

        file_size = os.path.getsize(actual_path)
        print(f"\n動画タイトル: {video_title}")
        print(f"音声ファイルサイズ: {file_size / 1024:.2f} KB")

        # 文字起こし実行
        print("\n" + "-" * 70)
        print("文字起こし中...")
        print("-" * 70)

        result = transcribe_audio(actual_path)

        # 話者分析
        print("話者分析中...")
        analysis = analyze_speakers(result)

        # 結果を表示
        print_results(result, analysis)

        # 結果をファイルに保存
        saved_path = save_results(result, analysis, video_title, youtube_url)
        print(f"\n結果を保存しました:")
        print(f"  テキスト: {saved_path}")
        print(f"  JSON: {saved_path.with_suffix('.json')}")


if __name__ == "__main__":
    main()
