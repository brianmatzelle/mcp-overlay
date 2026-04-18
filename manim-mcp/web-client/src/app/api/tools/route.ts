import { NextResponse } from 'next/server';
import { createMCPClient } from '@/lib/mcp-client';
import { getMCPConfig } from '@/lib/config';

export async function GET() {
  try {
    const mcpClient = createMCPClient('primary');

    try {
      // Fetch tools from MCP server
      const mcpTools = await mcpClient.listTools();

      // Format tools for display
      const tools = mcpTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Execute ${tool.name} tool`,
        inputSchema: tool.inputSchema
      }));

      await mcpClient.close();

      return NextResponse.json({
        tools,
        source: 'mcp-server'
      });

    } catch (error) {
      console.error('Error fetching tools from MCP server:', error);

      // Fallback to configured fallback tools
      const mcpConfig = getMCPConfig();
      const tools = mcpConfig.fallbackTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      await mcpClient.close();

      return NextResponse.json({
        tools,
        source: 'fallback',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Tools API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tools' },
      { status: 500 }
    );
  }
}
