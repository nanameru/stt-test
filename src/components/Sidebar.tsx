import React from 'react';
import { STTProvider, STTConfig } from '@/lib/types';
import { providerNames, providerColors, modelBadges } from '@/lib/constants';

interface SidebarProps {
    configs: STTConfig[];
    selectedProvider: STTProvider | null;
    onSelectProvider: (provider: STTProvider) => void;
    onToggleProvider: (provider: STTProvider, enabled: boolean) => void;
    activeProviders: Set<STTProvider>;
}

export function Sidebar({
    configs,
    selectedProvider,
    onSelectProvider,
    onToggleProvider,
    activeProviders
}: SidebarProps) {
    return (
        <div className="w-80 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                    モデル選択
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                    {configs.filter(c => c.enabled).length} モデルが有効
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {configs.map((config) => {
                    const isSelected = selectedProvider === config.provider;
                    const isActive = activeProviders.has(config.provider);

                    return (
                        <div
                            key={config.provider}
                            onClick={() => onSelectProvider(config.provider)}
                            className={`
                group relative flex items-center p-3 rounded-lg cursor-pointer transition-all border
                ${isSelected
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm'
                                    : 'bg-transparent border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-800'
                                }
              `}
                        >
                            <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                        {providerNames[config.provider]}
                                    </h3>
                                    {modelBadges[config.provider] && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
                                            {modelBadges[config.provider]}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : config.enabled ? 'bg-zinc-300 dark:bg-zinc-600' : 'bg-red-200 dark:bg-red-900'}`} />
                                    <span className="text-xs text-zinc-500 truncate">
                                        {isActive ? '処理中...' : config.enabled ? '待機中' : '無効'}
                                    </span>
                                </div>
                            </div>

                            {/* Toggle Switch */}
                            <div
                                className="flex-shrink-0"
                                onClick={(e) => e.stopPropagation()} // Prevent selection when clicking toggle
                            >
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.enabled}
                                        onChange={(e) => onToggleProvider(config.provider, e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Selection Indicator Bar */}
                            {isSelected && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-md" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
