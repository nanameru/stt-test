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
      "task": "transcribe"
    }
  }'
```

## 💰 コスト

- **Active Workers**: 約$0.34/時間（RTX 4090）
- **GPU**: RTX 4090推奨（高速＋コスト効率）
- **A100**: より高速だが高コスト（約$1.00/時間）

## 📝 注意事項

- 初回リクエストでモデルがロードされるため、cold startに時間がかかる場合があります
- Active Workersを使用することで、常にモデルがメモリにロードされ、低レイテンシーを実現できます
- モデルサイズは約3GBなので、Container Diskは10GB以上を推奨
