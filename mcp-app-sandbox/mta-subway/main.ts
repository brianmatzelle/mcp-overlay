import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import cors from "cors";
import express from "express";
import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

async function main() {
  // ── stdio mode (for Claude Desktop) ─────────────────────
  if (process.argv.includes("--stdio")) {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[mta-subway] Running in stdio mode");
    return;
  }

  // ── HTTP mode ───────────────────────────────────────────
  const app = express();
  app.use(cors());
  // Note: do NOT use express.json() here — the MCP SDK's StreamableHTTPServerTransport
  // reads the raw body stream via @hono/node-server. If Express consumes the stream
  // first, the transport hangs forever waiting to read an already-drained stream.

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.log(`[mta-subway] Server listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
