# Whisperモデル比較分析

## 今回の要件

| 項目 | 要件 |
|-----|------|
| リアルタイム性 | 1〜2秒以内の遅延 |
| 言語 | 日本語（会議音声） |
| 話者分離 | 検証対象（Optional） |
| 実行環境 | デスクトップアプリ（ローカル実行） |

---

## モデル比較表

| モデル | 精度 | 速度 | 日本語特化 | 話者分離 | リアルタイム向き |
|-------|------|------|-----------|---------|----------------|
| Whisper large v3 | ◎ | × | × | × | × |
| Whisper medium | ○ | ○ | × | × | △ |
| WhisperX | ◎ | ○ | × | **◎** | ○ |
| whisper-small | △ | ◎ | × | × | ◎ |
| faster-whisper-large-v3 | ◎ | ◎ | × | ○ | ◎ |
| kotoba-whisper-v2.0-faster | ◎ | ◎ | **◎** | ○ | ◎ |
| kotoba-whisper-v2.2-faster | ◎+ | ◎ | **◎** | **◎** | ◎ |

---

## 各モデル詳細

### 1. Whisper large v3
- **精度**: 最高レベルの多言語対応精度
- **速度**: 遅い（リアルタイム処理に不向き）
- **日本語**: 対応しているが特化していない
- **話者分離**: なし
- **評価**: ❌ リアルタイム要件を満たさない

### 2. Whisper medium
- **精度**: large v3より若干低いが実用的
- **速度**: large v3より高速
- **日本語**: 対応しているが特化していない
- **話者分離**: なし
- **評価**: △ 速度・精度のバランスは取れているが、日本語特化モデルに劣る

### 3. WhisperX
- **精度**: Whisperと同等の高精度
- **速度**: VAD（Voice Activity Detection）で高速化
- **日本語**: 対応しているが特化していない
- **話者分離**: **◎ pyannote連携で話者分離可能**
- **特徴**: 
  - 長時間音声の処理に強い
  - 単語レベルのタイムスタンプ取得可能
  - 強制アライメント機能
- **評価**: ⭐ **話者分離が必要な場合の第一候補**

### 4. whisper-small
- **精度**: 他モデルと比較して低い
- **速度**: 最も高速
- **日本語**: 対応しているが特化していない
- **話者分離**: なし
- **評価**: ❌ 精度が要件を満たさない可能性

### 5. faster-whisper-large-v3
- **精度**: Whisper large v3と同等
- **速度**: **約4〜6倍高速化**
- **日本語**: 対応しているが特化していない
- **話者分離**: なし
- **特徴**:
  - CTranslate2による最適化
  - メモリ効率が良い
- **評価**: ○ 汎用的に高速・高精度だが、日本語特化モデルに劣る

### 6. kotoba-whisper-v2.0-faster
- **精度**: Whisper large v3と同等
- **速度**: **約6.3倍高速化**
- **日本語**: **◎ ReazonSpeechで訓練された日本語特化モデル**
- **話者分離**: なし
- **特徴**:
  - 日本語音声認識に最適化
  - faster-whisper APIを完全サポート
- **評価**: ⭐ 日本語リアルタイム処理に最適

### 7. kotoba-whisper-v2.2-faster ⭐ 最推奨
- **精度**: v2.0の改良版でさらに高精度
- **速度**: **約6.3倍高速化**
- **日本語**: **◎ 日本語特化モデル**
- **話者分離**: **◎ pyannote.audio連携で話者分離可能**
- **特徴**:
  - kotoba-whisper-v2.0の改良版
  - 日本語音声認識で最高クラスの性能
  - **pyannote.audioと統合済み**（話者分離対応）
  - 句読点自動追加機能
  - CTranslate2形式で推論効率向上
- **評価**: ⭐⭐⭐ **日本語精度・速度・話者分離すべてを満たす最強の選択肢**

---

## 推奨モデル（今回の要件ベース）

### 🥇 第1位: kotoba-whisper-v2.2-faster

**推奨理由:**
1. **日本語特化**: ReazonSpeechで訓練され、日本語音声認識に最適化
2. **高速処理**: Whisper large v3比で約6.3倍高速→リアルタイム要件を満たす
3. **高精度**: large v3と同等以上の精度を維持
4. **話者分離**: **pyannote.audio連携で話者分離が可能**
5. **句読点追加**: 自動で句読点を追加
6. **コスト**: オープンソースで無料

**適用シーン**: 日本語会議の高精度・リアルタイム文字起こし + 話者分離

> 💡 **これ一つで今回の全要件をカバー可能！**

---

### 🥈 第2位: WhisperX

**推奨理由:**
1. **話者分離対応**: pyannote連携で話者分離が可能（今回の検証項目3, 4に必須）
2. **長時間音声対応**: VADと強制アライメントで長時間音声も安定処理
3. **タイムスタンプ**: 単語レベルの正確なタイムスタンプ取得

**適用シーン**: 話者分離が必要な会議文字起こし

---

### 🥉 第3位: faster-whisper-large-v3

**推奨理由:**
1. **汎用高精度**: 多言語対応で幅広い用途
2. **高速処理**: 4〜6倍高速化でリアルタイム処理可能
3. **安定性**: 広く使われており、ドキュメント・サンプルが豊富

**適用シーン**: 日本語以外も含む多言語対応が必要な場合

---

## 推奨検証構成

今回の要件を最大限満たすための構成:

```
┌─────────────────────────────────────────────────────────┐
│  kotoba-whisper-v2.2-faster + pyannote.audio           │
│  ├─ 日本語精度: 最高（日本語特化）                     │
│  ├─ リアルタイム性: 約6.3倍高速                        │
│  ├─ 話者分離: pyannote連携で対応可能                   │
│  └─ 句読点: 自動追加                                   │
└─────────────────────────────────────────────────────────┘
         ↓ これ一つで全要件カバー可能！
```

### 検証優先順位

| 優先度 | モデル | 検証目的 |
|-------|-------|---------|
| 1 | **kotoba-whisper-v2.2-faster + pyannote** | 日本語リアルタイム文字起こし + 話者分離 |
| 2 | WhisperX | 比較用（話者分離の別アプローチ） |
| 3 | faster-whisper-large-v3 | 比較用ベースライン |
| 4 | Groq Whisper (API) | クラウドAPI比較用 |

---

## 参考リンク

- [kotoba-whisper-v2.2 - Hugging Face](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.2) ⭐ 最推奨
- [kotoba-whisper-v2.0 - Hugging Face](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0)
- [faster-whisper-large-v3 - Hugging Face](https://huggingface.co/Systran/faster-whisper-large-v3)
- [whisper-small - Hugging Face](https://huggingface.co/openai/whisper-small)
- [WhisperX - GitHub](https://github.com/m-bain/whisperX)
- [pyannote.audio - GitHub](https://github.com/pyannote/pyannote-audio)
- [Groq Whisper Playground](https://console.groq.com/playground?model=whisper-large-v3)
- [Whisper + pyannote 話者分離ガイド](https://book.st-hakky.com/docs/whisper-pyannote-diarization)

---

## 結論

**今回の要件（日本語会議・リアルタイム・話者分離検証）に最適なのは:**

### 🏆 kotoba-whisper-v2.2-faster + pyannote.audio

**これ一つで全要件をカバー可能！**

| 要件 | 対応状況 |
|-----|---------|
| 日本語精度 | ✅ 日本語特化で最高精度 |
| リアルタイム性 | ✅ 約6.3倍高速 |
| 話者分離 | ✅ pyannote連携で対応 |
| 句読点 | ✅ 自動追加 |
| コスト | ✅ 無料（オープンソース） |

参考: [kotoba-whisper-v2.2 - Hugging Face](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.2)

