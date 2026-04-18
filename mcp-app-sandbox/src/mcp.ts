/**
 * Lightweight fetch-based MCP client for browser use.
 * Speaks JSON-RPC 2.0 over the MCP Streamable HTTP transport.
 */

let nextId = 0;

export class MCPClient {
  private url: string;
  private sessionId: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown> = {},
    isNotification = false,
  ): Promise<any> {
    const body: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
      params,
    };
    if (!isNotification) {
      body.id = ++nextId;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Capture session ID from response
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    // Notifications don't return a parsed body
    if (isNotification) return undefined;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    return json.result;
  }

  async connect(): Promise<ServerInfo> {
    const result = await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mcp-app-sandbox", version: "1.0.0" },
    });

    // Send initialized notification (fire-and-forget)
    this.rpc("notifications/initialized", {}, true).catch(() => {});

    return result;
  }

  async listTools(): Promise<{ tools: Tool[] }> {
    return this.rpc("tools/list");
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolResult> {
    return this.rpc("tools/call", { name, arguments: args });
  }

  async readResource(uri: string): Promise<ResourceResult> {
    return this.rpc("resources/read", { uri });
  }
}

export interface ServerInfo {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version?: string };
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<
      string,
      { type?: string; description?: string; enum?: string[] }
    >;
    required?: string[];
  };
  _meta?: Record<string, unknown>;
}

export interface ToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  structuredContent?: {
    type: string;
    resource?: { uri: string; mimeType?: string; text?: string };
  };
  _meta?: Record<string, unknown>;
}

export interface ResourceResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
}
