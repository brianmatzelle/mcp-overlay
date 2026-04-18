'use client';

import { Sparkles, Clock, Plus } from 'lucide-react';
import { getAppConfig } from '@/lib/config';

interface MinimalHeaderProps {
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function MinimalHeader({ onToggleHistory, onNewChat }: MinimalHeaderProps) {
  const appConfig = getAppConfig();

  return (
    <header className="flex-shrink-0 h-12 flex items-center justify-between px-4 bg-[var(--background)]/80 backdrop-blur-md border-b border-white/5 z-30">
      {/* Left: Logo + name */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">{appConfig.shortName}</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleHistory}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
          title="Chat history"
        >
          <Clock size={18} />
        </button>
        <button
          onClick={onNewChat}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
          title="New chat"
        >
          <Plus size={18} />
        </button>
      </div>
    </header>
  );
}
