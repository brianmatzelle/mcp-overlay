'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Video } from 'lucide-react';
import type { ToolCall } from '@/components/chat/types';
import { MCPAppDisplay } from './mcp-app-display';

/**
 * Colorize JSON for display using CSS variables.
 * Returns React elements with colored spans for keys, strings, numbers, booleans, and null.
 */
function colorizeJson(obj: unknown, indent: number = 0): React.ReactNode {
  const indentStr = '  '.repeat(indent);
  const nextIndentStr = '  '.repeat(indent + 1);

  if (obj === null) {
    return <span style={{ color: 'var(--syntax-code-keyword, #C678DD)' }}>null</span>;
  }

  if (typeof obj === 'boolean') {
    return <span style={{ color: 'var(--syntax-code-keyword, #C678DD)' }}>{String(obj)}</span>;
  }

  if (typeof obj === 'number') {
    return <span style={{ color: 'var(--syntax-code-number, #D19A66)' }}>{String(obj)}</span>;
  }

  if (typeof obj === 'string') {
    return <span style={{ color: 'var(--syntax-code-string, #98C379)' }}>&quot;{obj}&quot;</span>;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return <span>[]</span>;
    return (
      <>
        {'[\n'}
        {obj.map((item, i) => (
          <React.Fragment key={i}>
            {nextIndentStr}
            {colorizeJson(item, indent + 1)}
            {i < obj.length - 1 ? ',\n' : '\n'}
          </React.Fragment>
        ))}
        {indentStr}{']'}
      </>
    );
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <>
        {'{\n'}
        {entries.map(([key, value], i) => (
          <React.Fragment key={key}>
            {nextIndentStr}
            <span style={{ color: 'var(--syntax-code-function, #61AFEF)' }}>&quot;{key}&quot;</span>
            {': '}
            {colorizeJson(value, indent + 1)}
            {i < entries.length - 1 ? ',\n' : '\n'}
          </React.Fragment>
        ))}
        {indentStr}{'}'}
      </>
    );
  }

  return <span>{String(obj)}</span>;
}

export function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'executing':
        return <div className="w-3 h-3 border border-[#697565] border-t-transparent rounded-full animate-spin"></div>;
      case 'completed':
        return <span className="text-green-400">&#x2713;</span>;
      case 'error':
        return <span className="text-red-400">&#x2717;</span>;
    }
  };

  // Check if result contains a video to display
  const getVideoPath = (result: string | undefined): string | null => {
    if (!result) return null;
    const match = result.match(/\[DISPLAY_VIDEO:([^\]]+)\]/);
    return match ? match[1] : null;
  };

  const videoPath = toolCall.result ? getVideoPath(toolCall.result) : null;
  const hasMCPApp = Boolean(toolCall.resourceHtml) && toolCall.status === 'completed';
  const canExpand = toolCall.status === 'completed' || toolCall.status === 'error';

  return (
    <div className={cn(
      "rounded-lg bg-[#1A1C20]/50 border text-sm transition-all duration-200",
      canExpand
        ? "border-[#1A1C20]/30 hover:border-[#697565]/40 hover:shadow-sm"
        : "border-[#1A1C20]/30"
    )}>
      {/* Header - always visible */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
          canExpand && "cursor-pointer hover:bg-[#1A1C20]/80"
        )}
        onClick={canExpand ? () => setIsExpanded(!isExpanded) : undefined}
      >
        {/* Icon and tool name */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#2A2D35] flex items-center justify-center">
            <span className="text-[#ECDFCC] text-xs font-medium">E</span>
          </div>
          <span className="font-medium text-[#ECDFCC]">{toolCall.name.replace(/_/g, ' ')}</span>
        </div>

        {/* Status */}
        <div className="flex-1 flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-[#C4B8A8]/80">
            {toolCall.status === 'executing' ? 'Running...' :
             toolCall.status === 'completed' ? 'Completed' :
             `Error: ${toolCall.error}`}
          </span>
        </div>

        {/* Expand/collapse arrow */}
        {canExpand && (
          <div className="text-[#C4B8A8]/60">
            {isExpanded ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 10l4-4 4 4H4z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 6l4 4 4-4H4z"/>
              </svg>
            )}
          </div>
        )}
      </div>

      {/* MCP App Display - Renders lesson viewer iframe when resourceHtml is present */}
      {hasMCPApp && (
        <div className="mx-3 my-3">
          <MCPAppDisplay toolCall={toolCall} />
        </div>
      )}

      {/* Video Player - Always visible if video path exists and no MCP App */}
      {!hasMCPApp && videoPath && toolCall.status === 'completed' && (
        <div className="mx-3 my-3">
          <div className="rounded-lg overflow-hidden border border-[#697565]/30 bg-[#1A1C20]">
            <video
              controls
              autoPlay
              muted
              loop
              className="w-full max-w-2xl mx-auto"
              preload="metadata"
            >
              <source src={`/api/video?path=${encodeURIComponent(videoPath)}`} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <div className="px-4 py-2 bg-[#1A1C20]/50 text-sm text-[#C4B8A8] flex items-center gap-2">
              <Video size={14} /> Manim Animation
            </div>
          </div>
        </div>
      )}

      {/* Expandable content */}
      {isExpanded && canExpand && (
        <div className="border-t border-[#1A1C20]/50">
          {/* Request section */}
          <div className="p-4">
            <h4 className="text-[#C4B8A8]/90 font-medium mb-2">Request</h4>
            <pre className="text-xs text-[#C4B8A8]/80 bg-[#0F1014] rounded p-3 overflow-x-auto">
              <code>{colorizeJson(toolCall.input)}</code>
            </pre>
          </div>

          {/* Response section */}
          {(toolCall.result || toolCall.error) && (
            <div className="p-4 pt-0">
              <h4 className="text-[#C4B8A8]/90 font-medium mb-2">Response</h4>
              <pre className="text-xs text-[#C4B8A8]/80 bg-[#0F1014] rounded p-3 overflow-x-auto whitespace-pre-wrap">
                <code>{toolCall.error || toolCall.result}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
