'use client';

import { forwardRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MarkdownInput } from '@/components/ui/markdown-input';
import { getUIConfig } from '@/lib/config';
import { isCursorInCodeBlock } from '@/utils/codeBlockParser';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isLoading: boolean;
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ value, onChange, onSubmit, onStop, isLoading }, ref) => {
    const uiConfig = getUIConfig();
    const placeholderText = uiConfig.inputPlaceholder;

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const inCodeBlock = isCursorInCodeBlock(value, cursorPos);

      // Inside code block: different keybinds
      if (inCodeBlock) {
        // Enter adds newline (don't submit)
        if (e.key === 'Enter' && !e.shiftKey) {
          // Let default behavior happen (adds newline)
          return;
        }

        // Tab inserts tab character
        if (e.key === 'Tab') {
          e.preventDefault();
          const before = value.slice(0, cursorPos);
          const after = value.slice(textarea.selectionEnd);
          const newValue = before + '  ' + after; // 2 spaces for tab
          onChange(newValue);

          // Move cursor after the inserted tab
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = cursorPos + 2;
          });
          return;
        }
      }

      // Outside code block: normal behavior
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e);
      }
    }, [value, onChange, onSubmit]);

    return (
      <div className="flex-shrink-0 border-t border-border bg-background-secondary/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto p-4">
          <form onSubmit={onSubmit} className="flex gap-3 items-end">
            <div className="flex flex-1 relative items-center bg-input rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary/50 transition-all duration-200">
              <MarkdownInput
                ref={ref}
                value={value}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText}
                disabled={isLoading}
                minHeight={44}
                maxHeight={400}
                rows={1}
              />
            </div>

            <div className="flex gap-2">
              {isLoading && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onStop}
                  className="h-[46px] px-4 rounded-lg"
                >
                  Stop
                </Button>
              )}

              <Button
                type="submit"
                disabled={!value.trim() || isLoading}
                className="h-[46px] px-6 rounded-lg"
              >
                {isLoading ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = 'ChatInput';
