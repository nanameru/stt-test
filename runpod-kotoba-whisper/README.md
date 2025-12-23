# RunPod Custom Worker - Kotoba Whisper v2.2

このディレクトリには、Kotoba Whisper v2.2をRunPodで動かすためのカスタムWorkerが含まれています。

## 🚀 デプロイ手順

### 1. Docker Hubアカウントを作成

https://hub.docker.com/ でアカウントを作成してください。

### 2. Dockerイメージをビルド

```bash
cd runpod-kotoba-whisper

# あなたのDocker Hubユーザー名に置き換えてください
docker build -t YOUR_DOCKERHUB_USERNAME/kotoba-whisper-runpod:latest .
```

### 3. Docker Hubにプッシュ

```bash
docker login
docker push YOUR_DOCKERHUB_USERNAME/kotoba-whisper-runpod:latest
```

### 4. RunPodでカスタムテンプレートを作成

1. https://www.runpod.io/console/serverless/user/templates にアクセス
2. 「New Template」をクリック
3. 以下を入力：
   - **Template Name**: `Kotoba Whisper v2.2`
   - **Container Image**: `YOUR_DOCKERHUB_USERNAME/kotoba-whisper-runpod:latest`
   - **Container Disk**: `10 GB`
   - **Docker Command**: そのまま（空白）
4. 「Save Template」をクリック

### 5. Endpointを作成

1. https://www.runpod.io/console/serverless にアクセス
2. 「+ New Endpoint」をクリック
3. 作成したテンプレート「Kotoba Whisper v2.2」を選択
4. 設定：
   - **Active Workers**: 1（低レイテンシー用）
   - **Max Workers**: 1
   - **GPU**: RTX 4090 または A100
   - **Idle Timeout**: 5 seconds
5. 「Deploy」をクリック
6. **Endpoint ID**をコピー

### 6. .env.localに追加

```bash
# Kotoba Whisper on RunPod
RUNPOD_KOTOBA_ENDPOINT_ID=your-endpoint-id-here
```

## 📊 モデル情報

- **モデル**: kotoba-tech/kotoba-whisper-v2.2
- **特徴**: 日本語音声認識に特化
- **精度**: 日本語において汎用Whisperより高精度
- **Hugging Face**: https://huggingface.co/kotoba-tech/kotoba-whisper-v2.2

## 🧪 テスト

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -d '{
    "input": {
      "audio_base64": "BASE64_ENCODED_AUDIO",
      "language": "ja",
      "task": "transcribe",
      "enable_denoise": true,
      "enable_vad": true
    }
  }'
```

## ✨ 新機能: DeepFilterNet3 + Silero VAD

このワーカーには**DeepFilterNet3 (ノイズ除去)** と **Silero VAD (Voice Activity Detection)** が統合されています。

### 処理パイプライン
```
音声入力 → DeepFilterNet3 → Silero VAD → Kotoba Whisper → 文字起こし結果
```

### DeepFilterNet3の効果
- 🔊 **高品質ノイズ除去**: 背景ノイズを除去して音声をクリアに
- 🎯 **認識精度向上**: ノイズによる誤認識を大幅に削減
- ⚡ **低レイテンシ**: 5msで処理可能なリアルタイム対応

### Silero VADの効果
- 🔇 **無音フィルタリング**: 音声のない部分を自動的にスキップ
- ⚡ **処理速度向上**: 無音部分をスキップすることで処理時間を短縮

### パラメータ
| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `enable_denoise` | `true` | DeepFilterNet3を有効にする |
| `enable_vad` | `true` | Silero VADを有効にする |
| `language` | `"ja"` | 言語設定 |
| `task` | `"transcribe"` | タスク種別 |

### レスポンス
```json
{
  "transcription": "認識されたテキスト",
  "language": "ja",
  "model": "kotoba-whisper-v2.2",
  "denoise_applied": true,
  "vad_applied": true,
  "chunks": [
    {"text": "認識", "start": 0.0, "end": 0.5},
    {"text": "された", "start": 0.5, "end": 1.0}
  ]
}
```

## 💰 コスト

- **Active Workers**: 約$0.34/時間（RTX 4090）
- **GPU**: RTX 4090推奨（高速＋コスト効率）
- **A100**: より高速だが高コスト（約$1.00/時間）

## 📝 注意事項

- 初回リクエストでモデルがロードされるため、cold startに時間がかかる場合があります
- Active Workersを使用することで、常にモデルがメモリにロードされ、低レイテンシーを実現できます
- モデルサイズは約3GBなので、Container Diskは10GB以上を推奨
