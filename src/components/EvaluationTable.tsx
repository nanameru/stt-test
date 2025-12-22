'use client';

import React, { useState } from 'react';
import { EvaluationResult, STTProvider } from '@/lib/types';

interface EvaluationTableProps {
  results: EvaluationResult[];
}

const providerNames: Record<STTProvider, string> = {
  'openai-realtime': 'OpenAI Realtime API',
  'gemini-live': 'Gemini Live API',
  'gpt-4o-transcribe-diarize': 'GPT-4o Transcribe Diarize',
  'runpod-whisper': 'Whisper Turbo',
  'runpod-whisper-large-v3': 'Whisper Large V3',
  'runpod-whisper-distil-large-v3': 'Whisper Medium',
  'kotoba-whisper': 'Kotoba Whisper v2.2',
};

const statusIcons: Record<string, string> = {
  'supported': '✓',
  'partial': '△',
  'not-supported': '✗',
};

const statusColors: Record<string, string> = {
  'supported': 'text-green-500',
  'partial': 'text-yellow-500',
  'not-supported': 'text-red-500',
};

const statusLabels: Record<string, string> = {
  'supported': '対応',
  'partial': '一部対応',
  'not-supported': '非対応',
};

const gradeDescriptions: Record<string, string> = {
  'S': '最優秀 - 非常に高い精度',
  'A': '優秀 - 高い精度',
  'B': '良好 - 十分な精度',
  'C': '普通 - 改善の余地あり',
  'D': '不十分 - 精度に問題あり',
  'F': '失敗 - 大幅な改善が必要',
};

export function EvaluationTable({ results }: EvaluationTableProps) {
  const [selectedResult, setSelectedResult] = useState<EvaluationResult | null>(null);

  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-semibold mb-4">評価結果</h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          評価結果がありません。録音を開始して結果を生成してください。
        </p>
      </div>
    );
  }

  // Sort by similarity descending
  const sortedResults = [...results].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-semibold mb-4">📊 AI評価結果</h2>
        <p className="text-xs text-zinc-500 mb-4">行をクリックして詳細を表示</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="text-left py-3 px-4 font-medium">順位</th>
                <th className="text-left py-3 px-4 font-medium">API</th>
                <th className="text-center py-3 px-4 font-medium">評価</th>
                <th className="text-left py-3 px-4 font-medium">類似度</th>
                <th className="text-left py-3 px-4 font-medium" title="Character Error Rate - 文字誤り率">CER<span className="text-xs text-zinc-400 ml-1">(文字誤り率)</span></th>
                <th className="text-left py-3 px-4 font-medium" title="Word Error Rate - 単語誤り率">WER<span className="text-xs text-zinc-400 ml-1">(単語誤り率)</span></th>
                <th className="text-left py-3 px-4 font-medium">遅延</th>
                <th className="text-center py-3 px-4 font-medium">話者分離</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, index) => (
                <tr
                  key={result.provider}
                  className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors ${index === 0 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                  onClick={() => setSelectedResult(result)}
                >
                  <td className="py-3 px-4">
                    <span className={`text-lg font-bold ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-zinc-400' : index === 2 ? 'text-amber-600' : 'text-zinc-500'}`}>
                      #{index + 1}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">{providerNames[result.provider]}</td>
                  <td className="py-3 px-4 text-center">
                    {result.grade && (
                      <span
                        className="px-3 py-1 rounded-full text-sm font-bold"
                        style={{ backgroundColor: result.gradeColor ? `${result.gradeColor}20` : '#88888820', color: result.gradeColor || '#888' }}
                      >
                        {result.grade}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${result.similarity ?? 0}%`,
                            backgroundColor: result.gradeColor ?? '#888'
                          }}
                        />
                      </div>
                      <span className="text-xs">{result.accuracy}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={result.cer !== undefined && result.cer < 10 ? 'text-green-600' : result.cer !== undefined && result.cer > 30 ? 'text-red-600' : ''}>
                      {result.cer !== undefined ? `${result.cer.toFixed(1)}%` : '-'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={result.wer !== undefined && result.wer < 10 ? 'text-green-600' : result.wer !== undefined && result.wer > 30 ? 'text-red-600' : ''}>
                      {result.wer !== undefined ? `${result.wer.toFixed(1)}%` : '-'}
                    </span>
                  </td>
                  <td className="py-3 px-4">{result.latency}</td>
                  <td className={`py-3 px-4 text-center ${statusColors[result.diarization]}`}>
                    <span title={statusLabels[result.diarization]}>
                      {statusIcons[result.diarization]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Grade scale legend */}
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 mb-2">グレード目安:</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-yellow-500">S: 95%+</span>
            <span className="text-green-500">A: 85-94%</span>
            <span className="text-blue-500">B: 75-84%</span>
            <span className="text-orange-500">C: 65-74%</span>
            <span className="text-red-400">D: 50-64%</span>
            <span className="text-red-600">F: 50%未満</span>
          </div>
        </div>
      </div>

      {/* Modal for evaluation details */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedResult(null)}>
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {providerNames[selectedResult.provider]}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    AI評価詳細レポート
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="px-4 py-2 rounded-full text-2xl font-bold"
                    style={{ backgroundColor: selectedResult.gradeColor ? `${selectedResult.gradeColor}20` : '#88888820', color: selectedResult.gradeColor || '#888' }}
                  >
                    {selectedResult.grade}
                  </span>
                  <button
                    onClick={() => setSelectedResult(null)}
                    className="text-zinc-400 hover:text-zinc-600 text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold" style={{ color: selectedResult.gradeColor }}>
                    {selectedResult.similarity?.toFixed(1) || '-'}%
                  </div>
                  <div className="text-xs text-zinc-500">類似度</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg text-center">
                  <div className={`text-2xl font-bold ${selectedResult.cer !== undefined && selectedResult.cer < 10 ? 'text-green-600' : selectedResult.cer !== undefined && selectedResult.cer > 30 ? 'text-red-600' : ''}`}>
                    {selectedResult.cer !== undefined ? `${selectedResult.cer.toFixed(1)}%` : '-'}
                  </div>
                  <div className="text-xs text-zinc-500">CER</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg text-center">
                  <div className={`text-2xl font-bold ${selectedResult.wer !== undefined && selectedResult.wer < 10 ? 'text-green-600' : selectedResult.wer !== undefined && selectedResult.wer > 30 ? 'text-red-600' : ''}`}>
                    {selectedResult.wer !== undefined ? `${selectedResult.wer.toFixed(1)}%` : '-'}
                  </div>
                  <div className="text-xs text-zinc-500">WER</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">
                    {selectedResult.latency}
                  </div>
                  <div className="text-xs text-zinc-500">遅延</div>
                </div>
              </div>

              {/* Grade Description */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-4 rounded-lg mb-6 border border-purple-200 dark:border-purple-800">
                <div className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                  グレード {selectedResult.grade}: {selectedResult.grade ? (gradeDescriptions[selectedResult.grade] || '') : ''}
                </div>
              </div>

              {/* AI Comment */}
              {selectedResult.comment && (
                <div className="mb-6">
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">💬 AIコメント</h4>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg">
                    {selectedResult.comment}
                  </p>
                </div>
              )}

              {/* Strengths */}
              {selectedResult.strengths && selectedResult.strengths.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">✅ 強み</h4>
                  <ul className="space-y-2">
                    {selectedResult.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                        <span className="text-green-500">•</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {selectedResult.weaknesses && selectedResult.weaknesses.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">⚠️ 弱み</h4>
                  <ul className="space-y-2">
                    {selectedResult.weaknesses.map((weakness, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                        <span className="text-red-500">•</span>
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Features */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">📋 機能対応</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg">
                    <span>話者分離</span>
                    <span className={statusColors[selectedResult.diarization]}>
                      {statusLabels[selectedResult.diarization]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg">
                    <span>話者識別</span>
                    <span className={statusColors[selectedResult.speakerAssignment]}>
                      {statusLabels[selectedResult.speakerAssignment]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Close button */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => setSelectedResult(null)}
                  className="px-6 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
