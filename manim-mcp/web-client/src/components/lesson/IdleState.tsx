'use client';

import { getUIConfig } from '@/lib/config';

interface IdleStateProps {
  onPromptClick: (prompt: string) => void;
}

export function IdleState({ onPromptClick }: IdleStateProps) {
  const uiConfig = getUIConfig();

  const colors = [
    'from-blue-500/20 to-blue-600/10 hover:from-blue-500/30 hover:to-blue-600/20',
    'from-purple-500/20 to-purple-600/10 hover:from-purple-500/30 hover:to-purple-600/20',
    'from-emerald-500/20 to-emerald-600/10 hover:from-emerald-500/30 hover:to-emerald-600/20',
    'from-amber-500/20 to-amber-600/10 hover:from-amber-500/30 hover:to-amber-600/20',
    'from-rose-500/20 to-rose-600/10 hover:from-rose-500/30 hover:to-rose-600/20',
  ];

  return (
    <div className="flex flex-col items-center h-full px-4 sm:px-6 overflow-y-auto">
      {/* Radial gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 sm:top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, color-mix(in srgb, var(--primary) 20%, transparent) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Spacer pushes content toward center on large screens, shrinks on small */}
      <div className="flex-1 min-h-8 sm:min-h-0" />

      <div className="relative z-10 text-center max-w-2xl mx-auto space-y-2 sm:space-y-4 mb-6 sm:mb-10">
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground tracking-tight">
          {uiConfig.welcomeTitle}
        </h1>
        {uiConfig.welcomeSubtitle && (
          <p className="text-sm sm:text-lg text-foreground-muted">
            {uiConfig.welcomeSubtitle}
          </p>
        )}
      </div>

      {/* Prompt cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 max-w-3xl w-full pb-4">
        {uiConfig.quickPrompts.map((prompt, i) => (
          <button
            key={prompt}
            onClick={() => onPromptClick(prompt)}
            className={`prompt-card text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br ${colors[i % colors.length]} border border-white/5 backdrop-blur-sm`}
          >
            <span className="text-xs sm:text-sm text-foreground font-medium leading-snug line-clamp-2 sm:line-clamp-3">
              {prompt}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-4 sm:min-h-0" />
    </div>
  );
}
