'use client';

import React from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { getAppConfig } from '@/lib/config';
import type { Message } from './types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const appConfig = getAppConfig();
  const assistantName = appConfig.name;

  // Extract only text content — no tool calls
  const textBlocks = message.contentBlocks?.filter(
    (b) => b.type === 'text' && b.content
  );

  const textContent =
    textBlocks && textBlocks.length > 0
      ? textBlocks.map((b) => b.content).join('\n')
      : message.content;

  if (message.type === 'user') {
    return (
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-primary" />
        <span className="text-sm text-foreground whitespace-pre-wrap">{textContent}</span>
      </div>
    );
  }

  // Assistant message
  if (!textContent && message.isStreaming) {
    return (
      <div className="flex items-center gap-2 text-foreground-muted/60 text-sm">
        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        <span>{assistantName} is thinking...</span>
      </div>
    );
  }

  if (!textContent) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-foreground-muted" />
      <div className="text-sm text-foreground min-w-0 overflow-hidden">
        <MarkdownRenderer content={textContent} />
      </div>
    </div>
  );
}
