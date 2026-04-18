'use client';

import { useRef, useEffect, forwardRef, useCallback } from 'react';
import { renderHighlightedMarkdown } from '@/utils/markdownHighlight';
import { cn } from '@/lib/utils';

interface MarkdownInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  minHeight?: number;
  maxHeight?: number;
  rows?: number;
}

/**
 * A textarea with live markdown syntax highlighting.
 * Uses an overlay technique: transparent textarea over a styled highlight layer.
 */
export const MarkdownInput = forwardRef<HTMLTextAreaElement, MarkdownInputProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      placeholder,
      disabled = false,
      className,
      containerClassName,
      minHeight = 44,
      maxHeight = 400,
      rows = 1,
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

    // Sync scroll position between textarea and highlight layer
    // Using transform instead of scrollTop because highlight div has overflow:hidden
    const syncScroll = useCallback(() => {
      if (textareaRef.current && highlightRef.current) {
        const scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.style.transform = `translateY(-${scrollTop}px)`;
      }
    }, [textareaRef]);

    // Auto-resize textarea based on content
    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
      }
    }, [textareaRef, maxHeight]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    // Handle scroll sync
    const handleScroll = () => {
      syncScroll();
    };

    return (
      <div className={cn('relative w-full', containerClassName)}>
        {/* Highlight layer - shows styled markdown, not interactive */}
        <div
          className={cn(
            'absolute inset-0 pointer-events-none overflow-hidden',
          )}
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
          }}
          aria-hidden="true"
        >
          {/* Inner content wrapper - gets transformed for scroll sync */}
          <div
            ref={highlightRef}
            className={cn(
              'whitespace-pre-wrap break-words',
              'px-4 py-3 text-base leading-normal',
              className
            )}
          >
            {value ? (
              renderHighlightedMarkdown(value)
            ) : (
              <span className="text-foreground-muted/60">{placeholder}</span>
            )}
          </div>
        </div>

        {/* Actual textarea - transparent text, captures all input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onScroll={handleScroll}
          placeholder="" // Placeholder handled by highlight layer
          disabled={disabled}
          rows={rows}
          className={cn(
            'markdown-input-textarea', // For ::selection CSS fix
            'relative w-full bg-transparent resize-none overflow-y-auto focus:outline-none',
            'px-4 py-3 text-base leading-normal',
            'text-transparent caret-foreground',
            className
          )}
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
            // Ensure textarea text is invisible but caret and selection work
            WebkitTextFillColor: 'transparent',
          }}
        />
      </div>
    );
  }
);

MarkdownInput.displayName = 'MarkdownInput';
