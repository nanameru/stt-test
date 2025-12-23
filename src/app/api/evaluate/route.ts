import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { checkRateLimit, getClientIP, RATE_LIMITS, createRateLimitHeaders } from '@/lib/rate-limit';

interface TranscriptionData {
    provider: string;
    texts: string[];
    averageLatency: number;
}

interface EvaluationRequest {
    transcriptions: TranscriptionData[];
}

const providerNames: Record<string, string> = {
    'openai-realtime': 'OpenAI Realtime API',
    'gemini-live': 'Gemini Live API',
    'gpt-4o-transcribe-diarize': 'GPT-4o Transcribe Diarize',
    'faster-whisper-large-v3': 'Faster Whisper Large V3',
    'whisper-large-v3-turbo': 'Whisper Large V3 Turbo',
};

export async function POST(request: NextRequest) {
    try {
        // Rate limiting check
        const clientIP = getClientIP(request);
        const rateLimitResult = checkRateLimit(`evaluate:${clientIP}`, RATE_LIMITS.evaluate);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: createRateLimitHeaders(rateLimitResult),
                }
            );
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google API key not configured' },
                { status: 500 }
            );
        }

        const body: EvaluationRequest = await request.json();
        const { transcriptions } = body;

        if (!transcriptions || transcriptions.length === 0) {
            return NextResponse.json(
                { error: 'No transcriptions provided' },
                { status: 400 }
            );
        }

        // Load ground-truth.json
        const groundTruthPath = path.join(process.cwd(), 'src/data/ground-truth.json');
        const groundTruthRaw = fs.readFileSync(groundTruthPath, 'utf-8');
        const groundTruth = JSON.parse(groundTruthRaw);

        // Extract full text from ground truth
        const groundTruthText = groundTruth.segments
            .map((seg: { text: string }) => seg.text)
            .join('');

        // Filter out providers with no results
        const validTranscriptions = transcriptions.filter(t => t.texts.length > 0);

        if (validTranscriptions.length === 0) {
            return NextResponse.json(
                { error: 'No valid transcriptions to evaluate' },
                { status: 400 }
            );
        }

        const genai = new GoogleGenAI({ apiKey });

        // Run evaluations in parallel for each provider
        const evaluationPromises = validTranscriptions.map(async (transcription) => {
            const transcribedText = transcription.texts.join('');
            const prompt = buildEvaluationPrompt(transcription, transcribedText, groundTruthText);

            try {
                const response = await genai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                    },
                });

                const resultText = response.text || '';
                const parsed = JSON.parse(resultText);
                return {
                    ...parsed,
                    provider: transcription.provider,
                    success: true,
                };
            } catch (error) {
                console.error(`Evaluation failed for ${transcription.provider}:`, error);
                return {
                    provider: transcription.provider,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    grade: 'F',
                    similarity: 0,
                    cer: 100,
                    wer: 100,
                    comment: '評価に失敗しました',
                };
            }
        });

        // Wait for all evaluations to complete
        const evaluations = await Promise.all(evaluationPromises);

        // Find best provider based on similarity
        const successfulEvals = evaluations.filter(e => e.success);
        const bestProvider = successfulEvals.length > 0
            ? successfulEvals.reduce((best, current) =>
                (current.similarity > best.similarity) ? current : best
            ).provider
            : null;

        // Generate overall summary
        const summaryPrompt = buildSummaryPrompt(validTranscriptions, evaluations, groundTruthText);
        let summary = '';

        try {
            const summaryResponse = await genai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: summaryPrompt,
                config: {
                    responseMimeType: 'application/json',
                },
            });
            const summaryResult = JSON.parse(summaryResponse.text || '{}');
            summary = summaryResult.summary || '';
        } catch (error) {
            console.error('Summary generation failed:', error);
            summary = '複数のSTT APIの評価が完了しました。';
        }

        return NextResponse.json({
            summary,
            bestProvider,
            groundTruthText: groundTruthText.slice(0, 200) + '...',
            evaluations: evaluations.map(e => ({
                provider: e.provider,
                grade: e.grade,
                similarity: e.similarity,
                cer: e.cer,
                wer: e.wer,
                accuracyScore: e.accuracyScore,
                completenessScore: e.completenessScore,
                naturalnessScore: e.naturalnessScore,
                strengths: e.strengths || [],
                weaknesses: e.weaknesses || [],
                comment: e.comment,
            })),
        });

    } catch (error) {
        console.error('Evaluation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Evaluation failed' },
            { status: 500 }
        );
    }
}

function buildEvaluationPrompt(transcription: TranscriptionData, transcribedText: string, groundTruthText: string): string {
    const providerName = providerNames[transcription.provider] || transcription.provider;

    return `あなたは音声認識（STT: Speech-to-Text）の専門家です。
正解データと文字起こし結果を比較して、評価してください。

# 正解データ（Ground Truth）
"""
${groundTruthText}
"""

# 評価対象の文字起こし結果

**API名**: ${providerName}
**プロバイダーID**: ${transcription.provider}
**平均遅延**: ${transcription.averageLatency}ms
**文字起こし結果**:
"""
${transcribedText}
"""

# 評価基準

正解データと比較して、以下を評価してください：

1. **類似度（Similarity）**: 正解データとの一致率（0-100%）
   - 文字単位で比較してどれくらい一致しているか

2. **文字誤り率（CER: Character Error Rate）**: 文字単位の誤り率（0-100%、低いほど良い）
   - 正解に対する挿入・削除・置換の割合

3. **単語誤り率（WER: Word Error Rate）**: 単語単位の誤り率（0-100%、低いほど良い）
   - 正解に対する単語レベルの誤り

4. **正確性（Accuracy）**: 発話内容が正しく文字起こしされているか
5. **完全性（Completeness）**: 発話内容が欠けていないか
6. **自然さ（Naturalness）**: 自然な日本語として読めるか

# 出力フォーマット

{
  "grade": "S/A/B/C/D/Fのいずれか",
  "similarity": 0-100の数値（正解データとの一致率）,
  "cer": 0-100の数値（文字誤り率、低いほど良い）,
  "wer": 0-100の数値（単語誤り率、低いほど良い）,
  "accuracyScore": 0-100,
  "completenessScore": 0-100,
  "naturalnessScore": 0-100,
  "strengths": ["強み1", "強み2"],
  "weaknesses": ["弱み1", "弱み2"],
  "comment": "正解データとの比較に基づくコメント（日本語、1-2文）"
}

評価グレードの基準（類似度ベース）：
- S: 95%以上（優秀）
- A: 90%以上（優良）
- B: 80%以上（良好）
- C: 70%以上（普通）
- D: 60%以上（要改善）
- F: 60%未満（不合格）

JSONのみを出力してください。`;
}

function buildSummaryPrompt(transcriptions: TranscriptionData[], evaluations: { provider: string; grade: string; similarity: number; cer?: number; wer?: number }[], groundTruthText: string): string {
    const evalSummaries = evaluations.map(e => {
        return `- ${providerNames[e.provider] || e.provider}: 評価${e.grade}（類似度${e.similarity}%、CER${e.cer ?? '-'}%、WER${e.wer ?? '-'}%）`;
    }).join('\n');

    return `以下の複数のSTT APIの評価結果を見て、正解データとの比較に基づくサマリーを生成してください。

# 正解データ（先頭200文字）
"""
${groundTruthText.slice(0, 200)}...
"""

# 評価結果

${evalSummaries}

# 出力フォーマット

{
  "summary": "正解データとの比較に基づく全体的な評価の要約（日本語で2-3文）。どのAPIが最も正確か、特徴的な違いなど。"
}

JSONのみを出力してください。`;
}
