#!/usr/bin/env python3
"""
ElevenLabs Realtime Speech to Text - マイク入力版
PCのマイクからリアルタイムで文字起こし
"""

import os
import sys
import json
import asyncio
import base64
import signal
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.realtime.scribe import RealtimeAudioOptions, AudioFormat, CommitStrategy
from elevenlabs.realtime.connection import RealtimeEvents
import pyaudio

load_dotenv()

# 設定
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 100  # 100msごとに送信
CHUNK_SIZE = int(SAMPLE_RATE * 2 * CHUNK_DURATION_MS / 1000)  # 16bit = 2 bytes

# 出力ディレクトリ
OUTPUT_DIR = Path(__file__).parent / "results"

# グローバル変数
running = True
all_transcripts = []
final_texts = []


def signal_handler(sig, frame):
    """Ctrl+C ハンドラ"""
    global running
    print("\n\n停止中...")
    running = False


def clear_line():
    """現在行をクリア"""
    sys.stdout.write('\r' + ' ' * 80 + '\r')
    sys.stdout.flush()


async def main():
    global running, all_transcripts, final_texts

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("Error: ELEVENLABS_API_KEY not found")
        sys.exit(1)

    # シグナルハンドラ設定
    signal.signal(signal.SIGINT, signal_handler)

    print("=" * 60)
    print("ElevenLabs Realtime Speech to Text - マイク入力")
    print("=" * 60)
    print()

    # PyAudio初期化
    p = pyaudio.PyAudio()

    # 利用可能なマイクを表示
    print("利用可能なオーディオデバイス:")
    default_input = p.get_default_input_device_info()
    for i in range(p.get_device_count()):
        dev = p.get_device_info_by_index(i)
        if dev['maxInputChannels'] > 0:
            marker = " ← デフォルト" if i == default_input['index'] else ""
            print(f"  [{i}] {dev['name']}{marker}")
    print()

    # ElevenLabs クライアント
    client = ElevenLabs(api_key=api_key)

    # 現在の部分テキスト
    current_partial = ""

    def on_partial(data):
        nonlocal current_partial
        text = data.get('text', '') if isinstance(data, dict) else getattr(data, 'text', '')
        if text:
            current_partial = text
            # 部分結果を表示（同じ行で更新）
            display = text[-60:] if len(text) > 60 else text
            clear_line()
            sys.stdout.write(f"📝 {display}")
            sys.stdout.flush()

    def on_committed(data):
        nonlocal current_partial
        text = data.get('text', '') if isinstance(data, dict) else getattr(data, 'text', '')
        if text:
            final_texts.append(text)
            all_transcripts.append({
                'text': text,
                'timestamp': datetime.now().isoformat(),
                'is_final': True,
            })
            # 確定結果を表示
            clear_line()
            print(f"✅ {text}")
            current_partial = ""

    def on_error(data):
        clear_line()
        print(f"❌ Error: {data}")

    # 接続オプション
    options: RealtimeAudioOptions = {
        'model_id': 'scribe_v2_realtime',
        'audio_format': AudioFormat.PCM_16000,
        'sample_rate': SAMPLE_RATE,
        'language_code': 'jpn',
        'include_timestamps': True,
        'commit_strategy': CommitStrategy.VAD,  # 音声検出で自動コミット
    }

    print("ElevenLabsに接続中...")
    connection = await client.speech_to_text.realtime.connect(options)
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, on_partial)
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, on_committed)
    connection.on(RealtimeEvents.ERROR, on_error)

    print("接続完了!")
    print()
    print("-" * 60)
    print("🎤 マイクを起動しました。話し始めてください...")
    print("   (Ctrl+C で終了)")
    print("-" * 60)
    print()

    # マイクストリームを開く
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK_SIZE,
    )

    try:
        while running:
            # マイクからデータを読み取り
            try:
                data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            except Exception as e:
                print(f"\nマイク読み取りエラー: {e}")
                continue

            # Base64エンコードして送信
            audio_base64 = base64.b64encode(data).decode('utf-8')
            try:
                await connection.send({
                    "audio_base_64": audio_base64
                })
            except Exception as e:
                if running:
                    print(f"\n送信エラー: {e}")
                break

            # 少し待つ（リアルタイム相当）
            await asyncio.sleep(0.01)

    except Exception as e:
        print(f"\nエラー: {e}")

    finally:
        # クリーンアップ
        print("\n\nクリーンアップ中...")

        stream.stop_stream()
        stream.close()
        p.terminate()

        try:
            await connection.commit()
            await asyncio.sleep(1)
            await connection.close()
        except:
            pass

        # 結果を保存
        if final_texts:
            save_results()

        print("\n" + "=" * 60)
        print("セッション終了")
        print("=" * 60)


def save_results():
    """結果をファイルに保存"""
    OUTPUT_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"{timestamp}_mic_realtime"

    # 全文を結合
    full_text = ' '.join(final_texts)

    # JSONファイルに保存
    json_path = OUTPUT_DIR / f"{base_name}.json"
    json_data = {
        'metadata': {
            'timestamp': timestamp,
            'api_type': 'realtime_mic',
            'sample_rate': SAMPLE_RATE,
        },
        'full_text': full_text,
        'transcripts': all_transcripts,
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    # テキストファイルに保存
    txt_path = OUTPUT_DIR / f"{base_name}.txt"
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n")
        f.write("ElevenLabs Realtime STT - マイク入力結果\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"確定文数: {len(final_texts)}\n\n")
        f.write("-" * 60 + "\n")
        f.write("トランスクリプト\n")
        f.write("-" * 60 + "\n\n")
        for t in all_transcripts:
            f.write(f"[{t.get('timestamp', '')}]\n")
            f.write(f"{t.get('text', '')}\n\n")
        f.write("=" * 60 + "\n")
        f.write("全文\n")
        f.write("=" * 60 + "\n\n")
        f.write(full_text + "\n")

    print(f"\n結果を保存しました:")
    print(f"  テキスト: {txt_path}")
    print(f"  JSON: {json_path}")


if __name__ == "__main__":
    asyncio.run(main())
