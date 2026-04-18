'use client';

import { useCallback } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { getUIConfig } from '@/lib/config';

interface DrawerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isLoading: boolean;
}

export function DrawerInput({ value, onChange, onSubmit, onStop, isLoading }: DrawerInputProps) {
  const uiConfig = getUIConfig();
  const placeholder = uiConfig.drawerInputPlaceholder || uiConfig.inputPlaceholder;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e);
      }
    },
    [onSubmit]
  );

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 sm:px-4 pb-3 pt-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className="flex-1 h-10 px-4 bg-[var(--surface)] text-foreground text-sm rounded-full border border-white/10 outline-none focus:border-primary/50 placeholder:text-foreground-muted/50 transition-colors"
      />
      {isLoading ? (
        <button
          type="button"
          onClick={onStop}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--surface-alt)] text-foreground-muted hover:text-foreground transition-colors"
        >
          <Square size={14} />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
