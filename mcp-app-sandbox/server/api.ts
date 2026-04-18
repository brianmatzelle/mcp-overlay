import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5181;
const MAX_TURNS = 10;
const MODEL = "claude-sonnet-4-20250514";

function sseWrite(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post("/api/chat", async (req, res) => {
  // Wrap entire handler in try-catch for Express 4 async safety
  try {
    const { message, conversationHistory, mcpServerUrl } = req.body ?? {};

    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable is not set" });
      return;
    }

    if (!mcpServerUrl) {
      res.status(400).json({ error: "mcpServerUrl is required" });
      return;
    }

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let mcpClient: Client | null = null;

    try {
      // Connect to MCP server
      mcpClient = new Client({ name: "mcp-app-sandbox-agent", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
      await mcpClient.connect(transport);

      // List tools and convert to Claude format
      const { tools: mcpTools } = await mcpClient.listTools();
      const claudeTools: Anthropic.Messages.Tool[] = mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
      }));

      // Build conversation messages
      const messages: Anthropic.Messages.MessageParam[] = [
        ...(conversationHistory || []),
        { role: "user" as const, content: message },
      ];

      const anthropic = new Anthropic();

      // Agentic loop
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system: "You are a helpful assistant that can use MCP tools to help users. When a tool returns structured content with a resource URI, that means it produced a visual UI that the user can see inline. Describe what you did briefly but don't try to reproduce the UI content in text.",
          tools: claudeTools,
          messages,
        });

        const response = await stream.finalMessage();

        // Send text blocks and collect tool_use blocks
        const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            sseWrite(res, "text_delta", { text: block.text });
          } else if (block.type === "tool_use") {
            toolUseBlocks.push(block);
            sseWrite(res, "tool_use_start", {
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }

        // If no tool calls, we're done
        if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
          break;
        }

        // Add the full assistant response to conversation history (once)
        messages.push({ role: "assistant", content: response.content });

        // Execute each tool call and collect results
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          try {
            const toolResult = await mcpClient.callTool({
              name: block.name,
              arguments: block.input as Record<string, unknown>,
            });

            // Check for MCP App UI
            let resourceHtml: string | undefined;
            const structured = toolResult.structuredContent as
              | { resource?: { uri?: string } }
              | undefined;
            const uri = structured?.resource?.uri;
            if (uri) {
              try {
                const resourceResult = await mcpClient.readResource({ uri });
                resourceHtml = resourceResult.contents?.[0]?.text;
              } catch (e) {
                console.error("Resource read failed:", e);
              }
            }

            sseWrite(res, "tool_execution_complete", {
              id: block.id,
              name: block.name,
              toolInput: block.input,
              result: toolResult,
              resourceHtml,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(toolResult.content),
            });
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`Tool ${block.name} failed:`, errorMsg);

            sseWrite(res, "tool_execution_complete", {
              id: block.id,
              name: block.name,
              toolInput: block.input,
              result: { isError: true, content: [{ type: "text", text: errorMsg }] },
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: errorMsg,
              is_error: true,
            });
          }
        }

        // Add all tool results as a single user message
        messages.push({ role: "user", content: toolResults });
      }

      sseWrite(res, "complete", {});
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("Chat error:", errorMsg);
      sseWrite(res, "error", { error: errorMsg });
    } finally {
      try {
        if (mcpClient) await mcpClient.close();
      } catch {
        // Ignore close errors
      }
      res.end();
    }
  } catch (e) {
    // Outer catch for Express 4 async safety - handles errors before SSE starts
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("Unhandled chat error:", errorMsg);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
