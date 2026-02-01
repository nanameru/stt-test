'use client';

import React, { useRef, useCallback } from 'react';

type AudioSourceType = 'microphone' | 'file';

interface AudioSourceSelectorProps {
    audioSource: AudioSourceType;
    onAudioSourceChange: (source: AudioSourceType) => void;
    onFileSelect: (file: File) => void;
    isPlaying: boolean;
    isLoaded: boolean;
    duration: number;
    currentTime: number;
    fileName: string | null;
    onStartPlayback: () => void;
    onStopPlayback: () => void;
    onSeek: (time: number) => void;
    disabled?: boolean;
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function AudioSourceSelector({
    audioSource,
    onAudioSourceChange,
    onFileSelect,
    isPlaying,
    isLoaded,
    duration,
    currentTime,
    fileName,
    onStartPlayback,
    onStopPlayback,
    onSeek,
    disabled = false,
}: AudioSourceSelectorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
    }, [onFileSelect]);

    const handleSelectFileClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        onSeek(time);
    }, [onSeek]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                📻 音声入力ソース
            </h3>

            {/* Source selection */}
            <div className="flex gap-4">
                <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                        type="radio"
                        name="audioSource"
                        value="microphone"
                        checked={audioSource === 'microphone'}
                        onChange={() => onAudioSourceChange('microphone')}
                        disabled={disabled}
                        className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">🎤 マイク</span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                        type="radio"
                        name="audioSource"
                        value="file"
                        checked={audioSource === 'file'}
                        onChange={() => onAudioSourceChange('file')}
                        disabled={disabled}
                        className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">📁 ファイル</span>
                </label>
            </div>

            {/* File input section (only shown when file source is selected) */}
            {audioSource === 'file' && (
                <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,video/*"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={disabled || isPlaying}
                    />

                    {/* File selection button */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSelectFileClick}
                            disabled={disabled || isPlaying}
                            className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ファイルを選択
                        </button>
                        {fileName && (
                            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">
                                {fileName}
                            </span>
                        )}
                    </div>

                    {/* Playback controls (only shown when file is loaded) */}
                    {isLoaded && (
                        <div className="space-y-2">
                            {/* Play/Stop buttons */}
                            <div className="flex items-center gap-2">
                                {!isPlaying ? (
                                    <button
                                        onClick={onStartPlayback}
                                        disabled={disabled}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        ▶️ 再生開始
                                    </button>
                                ) : (
                                    <button
                                        onClick={onStopPlayback}
                                        disabled={disabled}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        ⏹️ 停止
                                    </button>
                                )}
                                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div className="relative">
                                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-100"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={duration || 100}
                                    value={currentTime}
                                    onChange={handleSeekChange}
                                    disabled={disabled || isPlaying}
                                    className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                    )}

                    {/* Help text */}
                    {!isLoaded && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            MP3, MP4, WAV等の音声/動画ファイルを選択してください。<br />
                            ミュート状態で再生しながらリアルタイム文字起こしを行います。
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
