import { NextRequest, NextResponse } from 'next/server';
import { createMCPClient } from '@/lib/mcp-client';

export async function POST(request: NextRequest) {
  const mcpClient = createMCPClient('primary');

  try {
    const { method, params } = await request.json();

    if (method === 'callTool') {
      const result = await mcpClient.callToolRaw(params.name, params.arguments || {});
      return NextResponse.json(result);
    }

    if (method === 'readResource') {
      const result = await mcpClient.readResource(params.uri);
      return NextResponse.json({ contents: result ? [result] : [] });
    }

    return NextResponse.json({ error: 'Unknown method' }, { status: 400 });
  } catch (error) {
    console.error('MCP proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    await mcpClient.close();
  }
}
