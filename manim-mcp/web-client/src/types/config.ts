export interface AppConfig {
  name: string;
  shortName: string;
  description: string;
  tagline: string;
  taglineShort: string;
  icon: string;
  accentIcon: string;
}

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  error: string;
  userBubble: string;
  assistantBubble: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  endpoint: string;
}

export interface MCPClient {
  name: string;
  version: string;
}

export interface MCPToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MCPFallbackTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPConfig {
  servers: {
    primary: MCPServer;
    [key: string]: MCPServer;
  };
  client: MCPClient;
  fallbackTools: MCPFallbackTool[];
}

export interface AIConfig {
  model: string;
  maxTokens: number;
  maxToolCallIterations: number;
  systemPrompt: string;
}

export interface UIConfig {
  quickPrompts: string[];
  welcomeTitle: string;
  welcomeSubtitle?: string;
  inputPlaceholder: string;
  drawerInputPlaceholder?: string;
  assistantAvatar: string;
  userAvatar: string;
}

export interface Config {
  app: AppConfig;
  theme: ThemeConfig;
  mcp: MCPConfig;
  ai: AIConfig;
  ui: UIConfig;
}

