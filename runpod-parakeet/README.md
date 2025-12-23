# NVIDIA Parakeet-TDT 0.6B (Japanese) RunPod Worker

NVIDIAが開発した高速・高精度な日本語音声認識モデルをRunPodで実行するためのカスタムワーカーです。

## 🏆 特徴

- **高速推論** - FastConformer TDT-CTCアーキテクチャ
- **句読点自動付与** - 自然な文章出力
- **0.6Bパラメータ** - 軽量で効率的
- **NVIDIA製** - 最適化された推論

## 📦 ビルド & デプロイ

```bash
# Dockerイメージをビルド
docker build -t your-username/parakeet-ja-runpod:latest .

# Docker Hubにプッシュ
docker push your-username/parakeet-ja-runpod:latest
```

## 🚀 RunPod設定

1. RunPodで新しいServerlessエンドポイントを作成
2. Docker Image: `your-username/parakeet-ja-runpod:latest`
3. GPU: RTX 3080 / L4 推奨
4. VRAM: 3GB以上

## 📡 API

### リクエスト

```json
{
  "input": {
    "audio_base64": "BASE64_ENCODED_AUDIO"
  }
}
```

### レスポンス

```json
{
  "transcription": "認識されたテキスト。",
  "language": "ja",
  "model": "parakeet-tdt-0.6b-ja"
}
```
