'use client';

import { useState, useCallback, useMemo } from 'react';
import { AppRenderer } from '@mcp-ui/client';
import type { ToolCall } from '@/components/chat/types';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface MCPAppDisplayProps {
  toolCall: ToolCall;
}

export function MCPAppDisplay({ toolCall }: MCPAppDisplayProps) {
  const [height, setHeight] = useState(450);

  const sandboxConfig = useMemo(() => ({
    url: new URL('/sandbox_proxy.html', window.location.origin),
  }), []);

  // Reconstruct CallToolResult from the stored result string.
  // toolCall.result is JSON.stringify(content_array) from the API route,
  // so parse it back to get the original content array.
  const toolResult: CallToolResult | undefined = useMemo(() => {
    if (!toolCall.result) return undefined;
    try {
      const parsed = JSON.parse(toolCall.result);
      // If parsed is an array, it's the content array directly
      if (Array.isArray(parsed)) {
        return { content: parsed, isError: false };
      }
      // Otherwise wrap it as a text content block
      return {
        content: [{ type: 'text' as const, text: toolCall.result }],
        isError: false,
      };
    } catch {
      // If parsing fails, treat the raw string as text content
      return {
        content: [{ type: 'text' as const, text: toolCall.result }],
        isError: false,
      };
    }
  }, [toolCall.result]);

  // Handle tool calls FROM the iframe back to MCP server
  const handleCallTool = useCallback(async (params: { name: string; arguments?: Record<string, unknown> }) => {
    const res = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'callTool', params }),
    });
    return res.json();
  }, []);

  // Handle resource reads FROM the iframe
  const handleReadResource = useCallback(async (params: { uri: string }) => {
    const res = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'readResource', params }),
    });
    return res.json();
  }, []);

  const handleSizeChanged = useCallback((params: { width?: number; height?: number }) => {
    if (params.height && params.height > 0) {
      setHeight(Math.min(params.height, 800));
    }
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('MCP App error:', error);
  }, []);

  return (
    <div
      className="rounded-lg overflow-hidden border border-[#2A2D35]"
      style={{ minHeight: 400, height }}
    >
      <AppRenderer
        toolName={toolCall.name}
        sandbox={sandboxConfig}
        html={toolCall.resourceHtml}
        toolInput={toolCall.input}
        toolResult={toolResult}
        onCallTool={handleCallTool}
        onReadResource={handleReadResource}
        onSizeChanged={handleSizeChanged}
        onError={handleError}
      />
    </div>
  );
}
