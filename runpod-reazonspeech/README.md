# ReazonSpeech NeMo v2 RunPod Worker

日本語音声認識で最高精度を誇るReazonSpeech NeMo v2モデルをRunPodで実行するためのカスタムワーカーです。

## 🏆 特徴

- **WER 6.36%** - Whisper large-v3 (6.64%) より高精度
- **35,000時間**の日本語データで学習
- **Fast Conformer + RNN-T** アーキテクチャ
- **Apache 2.0ライセンス** - 商用利用可能

## 📦 ビルド & デプロイ

```bash
# Dockerイメージをビルド
docker build -t your-username/reazonspeech-runpod:latest .

# Docker Hubにプッシュ
docker push your-username/reazonspeech-runpod:latest
```

## 🚀 RunPod設定

1. RunPodで新しいServerlessエンドポイントを作成
2. Docker Image: `your-username/reazonspeech-runpod:latest`
3. GPU: RTX 3090 / A10 / L4 推奨
4. VRAM: 4GB以上

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
  "transcription": "認識されたテキスト",
  "language": "ja",
  "model": "reazonspeech-nemo-v2"
}
```

## 📊 ベンチマーク

| データセット | CER |
|-------------|-----|
| JSUT-BASIC5000 | 7.31% |
| Common Voice v8.0 | 8.81% |
| TEDxJP-10K | 10.42% |
