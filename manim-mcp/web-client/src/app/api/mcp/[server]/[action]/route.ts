import { createMCPClient } from '@/lib/mcp-client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ server: string; action: string }> }
) {
  const { server, action } = await params;

  // Validate server parameter
  if (server !== 'espn') {
    return NextResponse.json(
      { error: `Invalid server: ${server}. Must be 'espn'` },
      { status: 400 }
    );
  }

  try {
    const client = createMCPClient(server as 'espn');
    let result;

    switch (action) {
      case 'tools':
        result = await client.listTools();
        break;
      
      case 'call':
        const body = await request.json();
        if (!body.tool) {
          return NextResponse.json(
            { error: 'Missing tool name in request body' },
            { status: 400 }
          );
        }
        result = await client.callTool(body.tool, body.arguments || {});
        break;
      
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Must be 'tools' or 'call'` },
          { status: 400 }
        );
    }

    await client.close();
    return NextResponse.json(result);

  } catch (error) {
    console.error(`MCP ${server}/${action} error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to ${action} on ${server}: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Enable CORS for development
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
