'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-assistant-message-fg mb-4 mt-6 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-assistant-message-fg mb-3 mt-5 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-medium text-assistant-message-fg mb-2 mt-4 first:mt-0">
              {children}
            </h3>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="text-assistant-message-fg mb-3 leading-relaxed last:mb-0">
              {children}
            </p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="text-assistant-message-fg mb-3 pl-5 space-y-1 list-disc marker:text-accent">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-assistant-message-fg mb-3 pl-5 space-y-1 list-decimal marker:text-accent">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-assistant-message-fg leading-relaxed pl-1">
              {children}
            </li>
          ),

          // Emphasis
          strong: ({ children }) => (
            <strong className="font-semibold text-assistant-message-fg">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground-muted">
              {children}
            </em>
          ),

          // Code
          code: ({ children, className }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code className="bg-background-secondary text-accent px-1.5 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              );
            }

            // Code block with syntax highlighting - uses shared CodeBlock component
            const language = match ? match[1] : 'text';
            const codeString = String(children).replace(/\n$/, '');

            return (
              <CodeBlock
                code={codeString}
                language={language}
              />
            );
          },
          pre: ({ children }) => (
            <div className="mb-3">
              {children}
            </div>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-accent pl-4 my-3 text-foreground-muted italic">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-accent hover:text-accent/80 underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-background-secondary">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left text-assistant-message-fg font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 text-assistant-message-fg">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="border-border my-6" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
