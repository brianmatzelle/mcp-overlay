'use client';

import { useRef, useEffect } from 'react';
import type { LoadingProgress } from '@/components/chat/types';

const PHASE_LABELS: Record<string, string> = {
  thinking: 'Thinking...',
  rendering: 'Rendering...',
  finalizing: 'Almost done...',
};

interface LoadingStateProps {
  progress?: LoadingProgress | null;
}

export function LoadingState({ progress }: LoadingStateProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as streaming text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [progress?.streamingText]);

  const phase = progress?.phase ?? 'thinking';
  const phaseLabel = PHASE_LABELS[phase] ?? 'Thinking...';
  const streamingText = progress?.streamingText ?? '';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-4">
      {/* Bouncing dots — subtle accent */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-primary/60 bounce-dot" />
        <div className="w-2.5 h-2.5 rounded-full bg-primary/60 bounce-dot" />
        <div className="w-2.5 h-2.5 rounded-full bg-primary/60 bounce-dot" />
      </div>

      {/* Phase indicator */}
      <p className="text-sm font-medium text-primary tracking-wide uppercase streaming-text-enter" key={phase}>
        {phaseLabel}
      </p>

      {/* Streaming text preview */}
      {streamingText && (
        <div
          ref={scrollRef}
          className="max-w-xl w-full max-h-48 sm:max-h-64 overflow-y-auto rounded-lg bg-[var(--surface)] border border-white/5 px-4 py-3"
        >
          <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap streaming-text-enter">
            {streamingText}
          </p>
        </div>
      )}
    </div>
  );
}
