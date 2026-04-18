export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'executing' | 'completed' | 'error';
  error?: string;
  result?: string;
  resourceUri?: string;    // tool's _meta.ui.resourceUri (if present)
  resourceHtml?: string;   // HTML fetched from the ui:// resource
}

export interface ContentBlock {
  type: 'text' | 'tool_call';
  id: string;
  content?: string;
  toolCall?: ToolCall;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  contentBlocks?: ContentBlock[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export type ViewState = 'idle' | 'loading' | 'lesson-active';

export type LoadingPhase = 'thinking' | 'rendering' | 'finalizing';

export interface LoadingProgress {
  phase: LoadingPhase;
  streamingText: string;
  toolName?: string;
}
export type DrawerState = 'collapsed' | 'peek' | 'partial' | 'full';

export interface LessonData {
  toolCall: ToolCall;
  assistantMessageId: string;
  timestamp: Date;
}
