/**
 * Commitlint configuration for Japanese commit messages
 * 日本語コミットメッセージを強制する設定
 */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    plugins: [
        {
            rules: {
                'japanese-subject': (parsed) => {
                    const { subject } = parsed;
                    if (!subject) {
                        return [false, 'subject is empty'];
                    }
                    // 日本語文字（ひらがな、カタカナ、漢字）を含むかチェック
                    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(subject);
                    if (!hasJapanese) {
                        return [
                            false,
                            'コミットメッセージは日本語で記述してください（例: feat: 新機能を追加）',
                        ];
                    }
                    return [true];
                },
            },
        },
    ],
    rules: {
        // 日本語サブジェクトを必須にする
        'japanese-subject': [2, 'always'],
        // 日本語は大文字小文字の概念がないため無効化
        'subject-case': [0],
        // 日本語は文字数換算が異なるため無効化
        'body-max-line-length': [0],
        'header-max-length': [0],
    },
};
