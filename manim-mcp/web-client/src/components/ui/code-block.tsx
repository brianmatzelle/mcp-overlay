'use client';

import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLanguageLabel?: boolean;
}

/**
 * Shared code block component with syntax highlighting.
 * Used by both user message bubbles and assistant responses.
 */
export function CodeBlock({ code, language = 'text', showLanguageLabel = false }: CodeBlockProps) {
  const hasLanguage = language && language !== 'text';

  return (
    <div className="my-2 rounded-lg overflow-hidden">
      {showLanguageLabel && hasLanguage && (
        <div className="bg-[#282c34] px-3 py-1 text-xs text-gray-400 border-b border-gray-700">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        style={oneDark as Record<string, React.CSSProperties>}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: hasLanguage && showLanguageLabel ? '0 0 0.5rem 0.5rem' : '0.5rem',
          fontSize: '0.875rem',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--code-font-family, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace)',
          }
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
