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
      "enable_dereverberation": true,
      "enable_vad": true,
      "enable_diarization": false
    }
  }'
```

## ✨ 音声前処理パイプライン

このワーカーには以下の音声前処理機能が統合されています：

### 処理パイプライン
```
音声入力 → DeepFilterNet3 → nara_wpe → Silero VAD → Kotoba Whisper → pyannote
          (ノイズ除去)    (残響除去)   (無音除去)     (認識)       (話者識別)
```

### 1. DeepFilterNet3 (ノイズ除去)
- 🔊 **高品質ノイズ除去**: 背景ノイズを除去して音声をクリアに
- ⚡ **低レイテンシ**: 5msで処理可能なリアルタイム対応

### 2. nara_wpe (残響除去) 🔥 NEW
- 🏠 **残響除去**: 部屋の反響を除去してクリアな音声に
- 🎯 **認識精度向上**: 残響による誤認識を削減

### 3. Silero VAD (無音除去)
- 🔇 **無音フィルタリング**: 音声のない部分を自動的にスキップ
- ⚡ **処理速度向上**: 無音部分をスキップすることで処理時間を短縮

### 4. pyannote (話者識別) 🔥 NEW
- 👥 **話者ダイアライゼーション**: 誰がいつ話したかを識別
- 📊 **複数話者対応**: 会議や対話の書き起こしに最適

> **注意**: pyannoteを使用するには `HF_TOKEN` 環境変数が必要です。

### パラメータ
| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `enable_denoise` | `true` | DeepFilterNet3 ノイズ除去 |
| `enable_dereverberation` | `true` | nara_wpe 残響除去 |
| `enable_vad` | `true` | Silero VAD 無音除去 |
| `enable_diarization` | `false` | pyannote 話者識別 |

### レスポンス
```json
{
  "transcription": "認識されたテキスト",
  "language": "ja",
  "model": "kotoba-whisper-v2.2",
  "denoise_applied": true,
  "dereverb_applied": true,
  "vad_applied": true,
  "chunks": [...],
  "diarization": [
    {"speaker": "SPEAKER_00", "start": 0.0, "end": 2.5},
    {"speaker": "SPEAKER_01", "start": 2.6, "end": 5.0}
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
