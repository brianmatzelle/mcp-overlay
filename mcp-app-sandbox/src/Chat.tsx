import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AppRenderer } from "@mcp-ui/client";
import type { Message, ContentBlock, ToolCall } from "./chat-types";

interface ChatProps {
  serverUrl: string;
  isConnected: boolean;
  onCallTool: (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<unknown>;
  onReadResource: (params: { uri: string }) => Promise<unknown>;
}

let nextMsgId = 0;
function msgId() {
  return `msg-${++nextMsgId}`;
}

let nextBlockId = 0;
function blockId() {
  return `block-${++nextBlockId}`;
}

export function Chat({
  serverUrl,
  isConnected,
  onCallTool,
  onReadResource,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sandboxConfig = useMemo(
    () => ({ url: new URL("/sandbox_proxy.html", window.location.origin) }),
    [],
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when connected
  useEffect(() => {
    if (isConnected) inputRef.current?.focus();
  }, [isConnected]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !isConnected || isLoading) return;

    setInput("");

    // Add user message
    const userMsg: Message = { id: msgId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Build conversation history for the API (exclude the current message)
    const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of messages) {
      if (msg.role === "user") {
        conversationHistory.push({ role: "user", content: msg.content });
      } else {
        const textContent = msg.contentBlocks
          ?.filter((b) => b.type === "text" && b.content)
          .map((b) => b.content)
          .join("");
        if (textContent) {
          conversationHistory.push({ role: "assistant", content: textContent });
        }
      }
    }

    // Add streaming assistant message placeholder
    const assistantMsgId = msgId();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
      contentBlocks: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory,
          mcpServerUrl: serverUrl,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      // Parse SSE stream
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            const data = JSON.parse(line.slice(6));
            handleSSEEvent(assistantMsgId, currentEvent, data);
            currentEvent = "";
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const errorText = e instanceof Error ? e.message : String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                contentBlocks: [
                  ...(m.contentBlocks || []),
                  {
                    type: "text" as const,
                    id: blockId(),
                    content: `Error: ${errorText}`,
                  },
                ],
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      // Mark streaming complete
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
    }
  }, [input, isConnected, isLoading, messages, serverUrl]);

  function handleSSEEvent(assistantMsgId: string, event: string, data: any) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantMsgId) return m;
        const blocks = [...(m.contentBlocks || [])];

        switch (event) {
          case "text_delta": {
            // Append to last text block or create new one
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock && lastBlock.type === "text") {
              blocks[blocks.length - 1] = {
                ...lastBlock,
                content: (lastBlock.content || "") + data.text,
              };
            } else {
              blocks.push({
                type: "text",
                id: blockId(),
                content: data.text,
              });
            }
            break;
          }
          case "tool_use_start": {
            const toolCall: ToolCall = {
              id: data.id,
              name: data.name,
              input: data.input,
              status: "running",
            };
            blocks.push({
              type: "tool_call",
              id: blockId(),
              toolCall,
            });
            break;
          }
          case "tool_execution_complete": {
            // Find and update the matching tool call block
            for (let i = 0; i < blocks.length; i++) {
              if (
                blocks[i].type === "tool_call" &&
                blocks[i].toolCall?.id === data.id
              ) {
                blocks[i] = {
                  ...blocks[i],
                  toolCall: {
                    ...blocks[i].toolCall!,
                    status: data.result?.isError ? "error" : "complete",
                    result: data.result,
                    resourceHtml: data.resourceHtml,
                    toolInput: data.toolInput,
                  },
                };
                break;
              }
            }
            break;
          }
          case "error": {
            blocks.push({
              type: "text",
              id: blockId(),
              content: `Error: ${data.error}`,
            });
            break;
          }
        }

        // Build combined content string from text blocks
        const content = blocks
          .filter((b) => b.type === "text")
          .map((b) => b.content)
          .join("");

        return { ...m, contentBlocks: blocks, content };
      }),
    );
  }

  function handleClear() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>AI Agent</h2>
        {messages.length > 0 && (
          <button className="btn-clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            {isConnected
              ? "Ask the AI agent to use MCP tools"
              : "Connect to an MCP server first"}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
            {msg.role === "user" ? (
              <div className="chat-bubble chat-bubble-user">{msg.content}</div>
            ) : (
              <div className="chat-bubble chat-bubble-assistant">
                {msg.contentBlocks?.map((block) =>
                  block.type === "text" ? (
                    <div key={block.id} className="chat-text">
                      {block.content}
                    </div>
                  ) : block.toolCall ? (
                    <ToolCallCard
                      key={block.id}
                      toolCall={block.toolCall}
                      sandboxConfig={sandboxConfig}
                      onCallTool={onCallTool}
                      onReadResource={onReadResource}
                    />
                  ) : null,
                )}
                {msg.isStreaming &&
                  (!msg.contentBlocks || msg.contentBlocks.length === 0) && (
                    <div className="chat-thinking">Thinking...</div>
                  )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isConnected ? "Ask the AI agent..." : "Connect to a server first"
          }
          disabled={!isConnected || isLoading}
          rows={1}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={!isConnected || isLoading || !input.trim()}
        >
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

/* ── Tool Call Card ─────────────────────────────────── */

function ToolCallCard({
  toolCall,
  sandboxConfig,
  onCallTool,
  onReadResource,
}: {
  toolCall: ToolCall;
  sandboxConfig: { url: URL };
  onCallTool: ChatProps["onCallTool"];
  onReadResource: ChatProps["onReadResource"];
}) {
  const [expanded, setExpanded] = useState(false);
  const [appHeight, setAppHeight] = useState(350);

  return (
    <div className={`tool-card tool-card-${toolCall.status}`}>
      <div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-card-indicator">
          {toolCall.status === "running" && (
            <span className="tool-card-spinner" />
          )}
          {toolCall.status === "complete" && "✓"}
          {toolCall.status === "error" && "✗"}
        </span>
        <span className="tool-card-name">{toolCall.name}</span>
        <span className="tool-card-chevron">{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div className="tool-card-details">
          <div className="tool-card-section">
            <span className="tool-card-label">Input</span>
            <pre className="tool-card-json">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result != null && (
            <div className="tool-card-section">
              <span className="tool-card-label">Result</span>
              <pre className="tool-card-json">
                {JSON.stringify(
                  (toolCall.result as any)?.content,
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Inline MCP App */}
      {toolCall.resourceHtml && (
        <div
          className="chat-app-container"
          style={{ height: appHeight }}
        >
          <AppRenderer
            toolName={toolCall.name}
            sandbox={sandboxConfig}
            html={toolCall.resourceHtml}
            toolInput={toolCall.toolInput}
            toolResult={toolCall.result as any}
            onCallTool={onCallTool as any}
            onReadResource={onReadResource as any}
            onSizeChanged={(params) => {
              if (params.height && params.height > 0) {
                setAppHeight(Math.min(Math.max(params.height, 150), 600));
              }
            }}
            onError={(err) => console.error("Chat MCP App error:", err)}
          />
        </div>
      )}
    </div>
  );
}
