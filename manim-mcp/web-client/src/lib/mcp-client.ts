import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getMCPConfig } from "./config";

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: unknown;
  isError?: boolean;
}

export class MCPHTTPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected: boolean = false;

  constructor(baseUrl: string, clientName?: string, clientVersion?: string) {
    const mcpConfig = getMCPConfig();
    
    this.transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    this.client = new Client({
      name: clientName || mcpConfig.client.name,
      version: clientVersion || mcpConfig.client.version,
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect(this.transport);
      this.connected = true;
    }
  }

  async callTool(name: string, arguments_: Record<string, unknown> = {}): Promise<MCPToolResult> {
    await this.connect();
    
    try {
      const result = await this.client.callTool({ name, arguments: arguments_ });
      return {
        content: result.content,
        isError: Boolean(result.isError)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Error calling tool ${name}: ${errorMessage}`,
        isError: true
      };
    }
  }

  async callToolRaw(name: string, arguments_: Record<string, unknown> = {}) {
    await this.connect();
    return this.client.callTool({ name, arguments: arguments_ });
  }

  async listTools(): Promise<MCPTool[]> {
    await this.connect();

    try {
      const result = await this.client.listTools();
      return (result.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        _meta: tool._meta as Record<string, unknown> | undefined,
      }));
    } catch (error) {
      console.error('Error listing tools:', error);
      return [];
    }
  }

  async readResource(uri: string): Promise<{ uri: string; mimeType?: string; text?: string } | null> {
    await this.connect();

    try {
      const result = await this.client.readResource({ uri });
      const content = result.contents?.[0];
      if (!content) return null;
      return {
        uri: content.uri,
        mimeType: content.mimeType,
        text: 'text' in content ? (content.text as string) : undefined,
      };
    } catch (error) {
      console.error('Error reading resource:', uri, error);
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}

// Factory function to create clients for different servers
export function createMCPClient(serverId: string): MCPHTTPClient {
  const mcpConfig = getMCPConfig();
  
  // Find the server configuration
  const server = serverId === 'primary' 
    ? mcpConfig.servers.primary 
    : mcpConfig.servers[serverId];
  
  if (!server) {
    throw new Error(`MCP server '${serverId}' not found in configuration`);
  }
  
  // Check for environment variable override
  const envKey = `NEXT_PUBLIC_${server.id.toUpperCase()}_MCP_URL`;
  const envUrl = process.env[envKey];
  
  const baseUrl = envUrl || server.url;
  const fullUrl = `${baseUrl}${server.endpoint}`;
  
  return new MCPHTTPClient(fullUrl);
}
