# Gemini/Antigravity Project Rules

このファイルはGemini/Antigravityがこのプロジェクトで作業する際に従うべきルールを定義しています。

---

## 🔒 必須ルール（絶対に従うこと）

### 1. Git コミット・プッシュルール

**編集完了時は必ずコミット＆プッシュを行うこと：**

1. 編集作業が完了したら、変更を**必ずブランチにコミット**すること
2. コミット後は**必ずリモートにプッシュ**すること
3. コミットメッセージは意味のある内容で記述すること

```bash
# 例：編集完了時のフロー
git add .
git commit -m "feat: 説明的なコミットメッセージ"
git push origin <branch-name>
```

---

### 2. Git WorkTree ルール

**WorkTree を使用する場合のブランチ作成ルール：**

> [!CAUTION]
> **絶対に `main` ブランチからブランチを切らないこと！**

1. 新しいブランチは**必ず `development` ブランチから作成**すること
2. WorkTree を作成する際は、`development` ブランチをベースにすること
3. ブランチ設定がない場合でも、`main` からではなく `development` から作成すること

```bash
# 正しいワークフロー
git checkout development
git pull origin development
git worktree add ../worktree-folder -b feature/new-feature

# または、ブランチ作成のみの場合
git checkout development
git checkout -b feature/new-feature
```

---

### 3. 会話タイトルルール

**Antigravity Agent Manager のチャットタイトルは日本語で設定すること：**

- 各チャット（会話）のタイトルは**必ず日本語**で記述すること
- タイトルは作業内容を簡潔に表現すること

```
# 例：良いタイトル
✅ 「VAD機能の実装」
✅ 「認証機能のバグ修正」
✅ 「データベーススキーマの更新」

# 例：避けるべきタイトル
❌ "Implementing VAD feature"
❌ "Fix auth bug"
```

---

## 📋 ワークフロー手順

### 新機能開発時

1. `development` ブランチに移動
2. 最新の変更を pull
3. 新しいブランチを作成（`development` から）
4. 作業を実施
5. 変更をコミット
6. リモートにプッシュ

### WorkTree 作成時

1. `development` ブランチが最新であることを確認
2. `git worktree add <path> -b <branch-name>` で WorkTree とブランチを同時作成
3. 作成した WorkTree ディレクトリで作業
4. 作業完了後、コミット＆プッシュ

---

## ⚠️ 禁止事項

- ❌ `main` ブランチから直接ブランチを切ること
- ❌ 編集完了後にコミットせずに作業を終えること
- ❌ コミット後にプッシュせずに作業を終えること

---

## ✅ 推奨事項

- コミットは小さく、意味のある単位で行う
- コミットメッセージは Conventional Commits 形式を推奨
  - `feat:` 新機能
  - `fix:` バグ修正
  - `docs:` ドキュメント
  - `refactor:` リファクタリング
  - `chore:` 雑務
