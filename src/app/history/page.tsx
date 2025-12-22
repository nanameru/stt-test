'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

const providerLabels: Record<string, string> = {
    'openai-realtime': 'OpenAI Realtime',
    'gemini-live': 'Gemini Live',
    'gpt-4o-transcribe-diarize': 'GPT-4o Diarize',
    'faster-whisper-large-v3': 'Faster Whisper',
    'whisper-large-v3-turbo': 'Whisper Turbo',
};

interface SessionData {
    _id: Id<'sessions'>;
    startTime: number;
    endTime?: number;
    providersUsed: string[];
    status: 'recording' | 'completed';
}

export default function HistoryPage() {
    const router = useRouter();
    const sessions = useQuery(api.sessions.list, { limit: 100 });
    const deleteSession = useMutation(api.sessions.remove);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDuration = (start: number, end?: number) => {
        if (!end) return '進行中';
        const duration = Math.round((end - start) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}分${seconds}秒`;
    };

    const handleDelete = async (e: React.MouseEvent, sessionId: Id<'sessions'>) => {
        e.stopPropagation();
        if (confirm('このセッションを削除してもよろしいですか？')) {
            await deleteSession({ sessionId });
        }
    };

    const handleSessionClick = (sessionId: Id<'sessions'>) => {
        // Navigate to main page with session ID
        router.push(`/?session=${sessionId}`);
    };

    // Download all sessions as CSV
    const downloadAllCSV = useCallback(() => {
        if (!sessions || sessions.length === 0) return;

        const rows: string[][] = [];
        rows.push(['セッションID', 'セッション開始', 'セッション終了', '録音時間', 'ステータス', '使用プロバイダー']);

        for (const session of sessions) {
            rows.push([
                session._id,
                formatDate(session.startTime),
                session.endTime ? formatDate(session.endTime) : '進行中',
                formatDuration(session.startTime, session.endTime),
                session.status === 'recording' ? '録音中' : '完了',
                session.providersUsed.map(p => providerLabels[p] || p).join(', '),
            ]);
        }

        const csv = rows.map(row => row.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stt-all-sessions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [sessions]);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black p-6">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                            📋 履歴一覧
                        </h1>
                        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
                            セッションをクリックして詳細を表示
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={downloadAllCSV}
                            disabled={!sessions || sessions.length === 0}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                            📥 全履歴CSV
                        </button>
                        <Link
                            href="/"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            ← 録音に戻る
                        </Link>
                    </div>
                </header>

                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                            セッション一覧
                        </h2>
                        <span className="text-sm text-zinc-500">
                            {sessions?.length || 0} 件
                        </span>
                    </div>

                    {!sessions ? (
                        <div className="text-center py-8 text-zinc-500">読み込み中...</div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            まだセッションがありません
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(sessions as SessionData[]).map((session) => (
                                <div
                                    key={session._id}
                                    className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-all"
                                    onClick={() => handleSessionClick(session._id)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                                📅 {formatDate(session.startTime)}
                                            </div>
                                            <div className="text-sm text-zinc-500 mt-1">
                                                ⏱️ {formatDuration(session.startTime, session.endTime)}
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {session.providersUsed.map((provider) => (
                                                    <span
                                                        key={provider}
                                                        className="px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded"
                                                    >
                                                        {providerLabels[provider] || provider}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2 py-1 text-xs rounded ${session.status === 'recording'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-green-100 text-green-700'
                                                    }`}
                                            >
                                                {session.status === 'recording' ? '🔴 録音中' : '✅ 完了'}
                                            </span>
                                            <button
                                                onClick={(e) => handleDelete(e, session._id)}
                                                className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                                title="削除"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
