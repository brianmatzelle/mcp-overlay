import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createMCPClient } from '@/lib/mcp-client';
import { getAIConfig } from '@/lib/config';

// Initialize Anthropic client
function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const aiConfig = getAIConfig();

    const anthropic = createAnthropicClient();
    const mcpClient = createMCPClient('primary');
    
    // Fetch available tools dynamically from MCP server
    const mcpTools = await mcpClient.listTools();
    const availableTools = mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

    // Build map of tool name -> resourceUri for MCP App tools
    const toolUiMap: Record<string, string> = {};
    for (const tool of mcpTools) {
      const resourceUri = (tool._meta as Record<string, unknown>)?.ui
        ? ((tool._meta as Record<string, unknown>).ui as Record<string, unknown>)?.resourceUri
        : undefined;
      if (typeof resourceUri === 'string') {
        toolUiMap[tool.name] = resourceUri;
      }
    }

    // Build conversation messages
    const messages: Anthropic.Messages.MessageParam[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ];

    const systemPrompt = aiConfig.systemPrompt;

    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          const eventData = `data: ${JSON.stringify({ type, data })}\n\n`;
          controller.enqueue(encoder.encode(eventData));
        };

        try {
          // Send tool UI metadata to frontend so it knows which tools have MCP App UIs
          if (Object.keys(toolUiMap).length > 0) {
            sendEvent('tool_ui_metadata', { toolUiMap });
          }

          let conversationMessages = [...messages];

          // Handle tool calls in a loop (configured max iterations to prevent infinite loops)
          // TODO: MAKE THE TOOL CALL LIMIT DEPENDENT ON THE USER'S SUBSCRIPTION
          for (let iteration = 0; iteration < aiConfig.maxToolCallIterations; iteration++) {
            // Make streaming request to Claude
            const stream = await anthropic.messages.create({
              model: aiConfig.model,
              max_tokens: aiConfig.maxTokens,
              system: systemPrompt,
              messages: conversationMessages,
              tools: availableTools,
              tool_choice: { type: 'auto' },
              stream: true
            });

            let hasToolUse = false;
            let currentContent: (Anthropic.Messages.ContentBlockParam | undefined)[] = [];
            let toolInputBuffers: Record<number, string> = {}; // Buffer for accumulating tool input JSON
            
            // Process streaming response
            for await (const messageStreamEvent of stream) {
              if (messageStreamEvent.type === 'content_block_start') {
                if (messageStreamEvent.content_block.type === 'text') {
                  sendEvent('text_start', { 
                    index: messageStreamEvent.index 
                  });
                } else if (messageStreamEvent.content_block.type === 'tool_use') {
                  hasToolUse = true;
                  sendEvent('tool_use_start', {
                    index: messageStreamEvent.index,
                    tool: {
                      id: messageStreamEvent.content_block.id,
                      name: messageStreamEvent.content_block.name,
                      input: messageStreamEvent.content_block.input
                    }
                  });
                  // Initialize the content block and input buffer
                  // Ensure the array is large enough and place the block at the correct index
                  while (currentContent.length <= messageStreamEvent.index) {
                    currentContent.push(undefined);
                  }
                  currentContent[messageStreamEvent.index] = messageStreamEvent.content_block;
                  toolInputBuffers[messageStreamEvent.index] = '';
                }
              } else if (messageStreamEvent.type === 'content_block_delta') {
                if (messageStreamEvent.delta.type === 'text_delta') {
                  sendEvent('text_delta', {
                    index: messageStreamEvent.index,
                    text: messageStreamEvent.delta.text
                  });
                } else if (messageStreamEvent.delta.type === 'input_json_delta') {
                  // Accumulate the JSON input for this tool use block
                  toolInputBuffers[messageStreamEvent.index] = 
                    (toolInputBuffers[messageStreamEvent.index] || '') + messageStreamEvent.delta.partial_json;
                  
                  sendEvent('tool_input_delta', {
                    index: messageStreamEvent.index,
                    partial_json: messageStreamEvent.delta.partial_json
                  });
                }
                } else if (messageStreamEvent.type === 'content_block_stop') {
                if (messageStreamEvent.index < currentContent.length && 
                    currentContent[messageStreamEvent.index]?.type === 'text') {
                  sendEvent('text_stop', { index: messageStreamEvent.index });
                } else if (currentContent[messageStreamEvent.index]?.type === 'tool_use') {
                  // Parse the accumulated JSON input for this tool use block
                  const toolBlock = currentContent[messageStreamEvent.index] as Anthropic.Messages.ToolUseBlockParam;
                  const accumulatedInput = toolInputBuffers[messageStreamEvent.index];
                  
                  if (accumulatedInput) {
                    try {
                      toolBlock.input = JSON.parse(accumulatedInput);
                    } catch (error) {
                      console.error('Failed to parse tool input JSON:', accumulatedInput, error);
                      toolBlock.input = {};
                    }
                  }
                  
                  sendEvent('tool_use_stop', { index: messageStreamEvent.index });
                }
              } else if (messageStreamEvent.type === 'message_start') {
                currentContent = [];
                toolInputBuffers = {};
              } else if (messageStreamEvent.type === 'message_delta') {
                // Handle message-level updates if needed
              } else if (messageStreamEvent.type === 'message_stop') {
                // Message completed
                break;
              }
            }

            // If there were tool uses, execute them
            if (hasToolUse) {
              const toolResults = [];
              
              for (const block of currentContent) {
                if (block && block.type === 'tool_use' && block.id && block.name) {
                  sendEvent('tool_execution_start', {
                    tool_name: block.name,
                    tool_id: block.id
                  });
                  
                  try {
                    console.log(`Calling MCP tool: ${block.name} with args:`, block.input);
                    const toolArgs = block.input as Record<string, unknown>;
                    const toolResult = await mcpClient.callTool(block.name, toolArgs);

                    // If this tool has an MCP App UI, fetch the HTML resource
                    let resourceHtml: string | undefined;
                    const resourceUri = toolUiMap[block.name];
                    if (resourceUri && !toolResult.isError) {
                      try {
                        const resource = await mcpClient.readResource(resourceUri);
                        if (resource?.text) resourceHtml = resource.text;
                      } catch (resourceError) {
                        console.error(`Error fetching UI resource for ${block.name}:`, resourceError);
                      }
                    }

                    sendEvent('tool_execution_complete', {
                      tool_name: block.name,
                      tool_id: block.id,
                      success: !toolResult.isError,
                      result: toolResult.isError ?
                        `Error: ${toolResult.content}` :
                        JSON.stringify(toolResult.content, null, 2),
                      resourceUri,
                      resourceHtml,
                    });
                    
                    toolResults.push({
                      type: 'tool_result' as const,
                      tool_use_id: block.id,
                      content: toolResult.isError ? 
                        `Error: ${toolResult.content}` : 
                        JSON.stringify(toolResult.content, null, 2)
                    });
                  } catch (error) {
                    console.error(`Error calling tool ${block.name}:`, error);
                    
                    sendEvent('tool_execution_error', {
                      tool_name: block.name,
                      tool_id: block.id,
                      error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    
                    toolResults.push({
                      type: 'tool_result' as const,
                      tool_use_id: block.id,
                      content: `Error calling ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
                    });
                  }
                }
              }

              // Add assistant message and tool results to conversation
              // Filter out undefined elements that were added for proper indexing
              const validContent = currentContent.filter(block => block !== undefined);
              conversationMessages = [
                ...conversationMessages,
                {
                  role: 'assistant',
                  content: validContent
                }
              ];

              if (toolResults.length > 0) {
                conversationMessages = [
                  ...conversationMessages,
                  {
                    role: 'user',
                    content: toolResults
                  }
                ];
                
                // Continue with next iteration to get the final response
                continue;
              } else {
                break;
              }
            } else {
              // No tool use, we're done
              break;
            }
          }

          sendEvent('complete', {});
          controller.close();

        } catch (error) {
          console.error('Streaming error:', error);
          sendEvent('error', {
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          });
          controller.close();
        } finally {
          await mcpClient.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { error: `Chat processing failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Handle preflight requests for CORS
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
