export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result?: unknown;
  resourceHtml?: string;
  toolInput?: Record<string, unknown>;
}

export interface ContentBlock {
  type: "text" | "tool_call";
  id: string;
  content?: string;
  toolCall?: ToolCall;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  contentBlocks?: ContentBlock[];
}
