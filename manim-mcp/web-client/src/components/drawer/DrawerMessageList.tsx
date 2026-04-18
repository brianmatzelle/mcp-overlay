'use client';

import MarkdownRenderer from '@/components/MarkdownRenderer';
import type { Message } from '@/components/chat/types';

interface DrawerMessageListProps {
  messages: Message[];
}

export function DrawerMessageList({ messages }: DrawerMessageListProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {messages.map((message) => {
        // Extract only text content — no tool calls
        const textContent = message.contentBlocks
          ?.filter((b) => b.type === 'text' && b.content)
          .map((b) => b.content)
          .join('\n') || message.content;

        if (!textContent) return null;

        return (
          <div key={message.id} className="flex items-start gap-3">
            {/* Role indicator dot */}
            <div
              className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                message.type === 'user' ? 'bg-primary' : 'bg-foreground-muted'
              }`}
            />
            <div className="text-sm text-foreground min-w-0 overflow-hidden">
              {message.type === 'assistant' ? (
                <MarkdownRenderer content={textContent} />
              ) : (
                <span className="whitespace-pre-wrap">{textContent}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
