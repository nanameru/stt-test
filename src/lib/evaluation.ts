/**
 * Text similarity evaluation utilities for STT transcription comparison
 */

// Calculate Levenshtein distance between two strings
export function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Create a matrix of distances
    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));

    // Initialize first column
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }

    // Initialize first row
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }

    return dp[m][n];
}

// Calculate Character Error Rate (CER)
export function calculateCER(reference: string, hypothesis: string): number {
    if (reference.length === 0) {
        return hypothesis.length === 0 ? 0 : 1;
    }
    const distance = levenshteinDistance(reference, hypothesis);
    return distance / reference.length;
}

// Calculate Word Error Rate (WER)
export function calculateWER(reference: string, hypothesis: string): number {
    const refWords = reference.split(/\s+/).filter((w) => w.length > 0);
    const hypWords = hypothesis.split(/\s+/).filter((w) => w.length > 0);

    if (refWords.length === 0) {
        return hypWords.length === 0 ? 0 : 1;
    }

    const m = refWords.length;
    const n = hypWords.length;

    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }

    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (refWords[i - 1] === hypWords[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }

    return dp[m][n] / refWords.length;
}

// Normalize Japanese text for comparison
export function normalizeJapaneseText(text: string): string {
    return (
        text
            // Remove speaker labels
            .replace(/\[Speaker [A-Z]\]/gi, '')
            .replace(/Speaker [A-Z][\s（(][^）)]*[）)]/gi, '')
            // Remove punctuation
            .replace(/[、。！？「」『』（）()[\]【】・…，．,\.!?]/g, '')
            // Normalize whitespace
            .replace(/\s+/g, '')
            // Convert to lowercase (for romaji)
            .toLowerCase()
            // Normalize full-width to half-width
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248))
    );
}

// Calculate similarity score (0-100%)
export function calculateSimilarity(reference: string, hypothesis: string): number {
    const normalizedRef = normalizeJapaneseText(reference);
    const normalizedHyp = normalizeJapaneseText(hypothesis);

    if (normalizedRef.length === 0 && normalizedHyp.length === 0) {
        return 100;
    }

    const cer = calculateCER(normalizedRef, normalizedHyp);
    return Math.max(0, (1 - cer) * 100);
}

export interface EvaluationResult {
    provider: string;
    similarity: number;
    cer: number;
    wer: number;
    transcribedText: string;
    referenceLength: number;
    hypothesisLength: number;
}

// Ground truth segment interface
export interface GroundTruthSegment {
    speaker: string;
    text: string;
    start: number;
    end: number;
}

export interface GroundTruth {
    segments: GroundTruthSegment[];
    metadata?: {
        duration: number;
        speakers: string[];
        language: string;
    };
}

// Evaluate a single provider's transcription against ground truth
export function evaluateTranscription(
    provider: string,
    transcribedTexts: string[],
    groundTruth: GroundTruth
): EvaluationResult {
    // Combine all transcribed texts
    const hypothesis = transcribedTexts.join('');

    // Combine all ground truth texts
    const reference = groundTruth.segments.map((s) => s.text).join('');

    const normalizedRef = normalizeJapaneseText(reference);
    const normalizedHyp = normalizeJapaneseText(hypothesis);

    const cer = calculateCER(normalizedRef, normalizedHyp);
    const wer = calculateWER(reference, hypothesis);
    const similarity = Math.max(0, (1 - cer) * 100);

    return {
        provider,
        similarity,
        cer: cer * 100, // Convert to percentage
        wer: wer * 100, // Convert to percentage
        transcribedText: hypothesis,
        referenceLength: normalizedRef.length,
        hypothesisLength: normalizedHyp.length,
    };
}

// Grade based on similarity score
export function getGrade(similarity: number): {
    grade: string;
    color: string;
    label: string;
} {
    if (similarity >= 95) {
        return { grade: 'S', color: '#FFD700', label: '優秀' };
    } else if (similarity >= 90) {
        return { grade: 'A', color: '#00C853', label: '優良' };
    } else if (similarity >= 80) {
        return { grade: 'B', color: '#2196F3', label: '良好' };
    } else if (similarity >= 70) {
        return { grade: 'C', color: '#FF9800', label: '普通' };
    } else if (similarity >= 60) {
        return { grade: 'D', color: '#FF5722', label: '要改善' };
    } else {
        return { grade: 'F', color: '#F44336', label: '不合格' };
    }
}
