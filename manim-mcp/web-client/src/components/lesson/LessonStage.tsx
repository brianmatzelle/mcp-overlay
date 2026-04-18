'use client';

import { useCallback, useMemo } from 'react';
import { AppRenderer } from '@mcp-ui/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ViewState, LessonData, LoadingProgress } from '@/components/chat/types';
import { IdleState } from './IdleState';
import { LoadingState } from './LoadingState';

interface LessonStageProps {
  viewState: ViewState;
  lessonData: LessonData | null;
  loadingProgress?: LoadingProgress | null;
  onPromptClick: (prompt: string) => void;
}

export function LessonStage({ viewState, lessonData, loadingProgress, onPromptClick }: LessonStageProps) {
  const sandboxConfig = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return { url: new URL('/sandbox_proxy.html', window.location.origin) };
  }, []);

  const toolResult: CallToolResult | undefined = useMemo(() => {
    if (!lessonData?.toolCall.result) return undefined;
    try {
      const parsed = JSON.parse(lessonData.toolCall.result);
      if (Array.isArray(parsed)) {
        return { content: parsed, isError: false };
      }
      return {
        content: [{ type: 'text' as const, text: lessonData.toolCall.result }],
        isError: false,
      };
    } catch {
      return {
        content: [{ type: 'text' as const, text: lessonData.toolCall.result }],
        isError: false,
      };
    }
  }, [lessonData?.toolCall.result]);

  const handleCallTool = useCallback(async (params: { name: string; arguments?: Record<string, unknown> }) => {
    const res = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'callTool', params }),
    });
    return res.json();
  }, []);

  const handleReadResource = useCallback(async (params: { uri: string }) => {
    const res = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'readResource', params }),
    });
    return res.json();
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('MCP App error:', error);
  }, []);

  if (viewState === 'idle') {
    return <IdleState onPromptClick={onPromptClick} />;
  }

  if (viewState === 'loading') {
    return <LoadingState progress={loadingProgress} />;
  }

  // lesson-active
  if (!lessonData || !lessonData.toolCall.resourceHtml || !sandboxConfig) {
    return <LoadingState progress={loadingProgress} />;
  }

  return (
    <div className="lesson-enter lesson-stage h-full w-full overflow-auto">
      <AppRenderer
        toolName={lessonData.toolCall.name}
        sandbox={sandboxConfig}
        html={lessonData.toolCall.resourceHtml}
        toolInput={lessonData.toolCall.input}
        toolResult={toolResult}
        onCallTool={handleCallTool}
        onReadResource={handleReadResource}
        onError={handleError}
      />
    </div>
  );
}
