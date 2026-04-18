import { useState, useCallback, useMemo } from "react";
import { AppRenderer } from "@mcp-ui/client";
import { MCPClient, type Tool, type ToolResult, type ServerInfo } from "./mcp";
import { Chat } from "./Chat";

type Status = "idle" | "connecting" | "connected" | "error";

export function App() {
  // Connection
  const [serverUrl, setServerUrl] = useState("http://localhost:3001/mcp");
  const [client, setClient] = useState<MCPClient | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusError, setStatusError] = useState("");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  // Tools
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({});

  // Execution
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [appHtml, setAppHtml] = useState<string | null>(null);
  const [appHeight, setAppHeight] = useState(450);
  const [lastToolInput, setLastToolInput] = useState<
    Record<string, unknown> | undefined
  >();
  const [lastToolResult, setLastToolResult] = useState<
    ToolResult | undefined
  >();

  const selectedToolInfo = tools.find((t) => t.name === selectedTool);

  async function handleConnect() {
    setStatus("connecting");
    setStatusError("");
    try {
      const c = new MCPClient(serverUrl);
      const info = await c.connect();
      const toolsResult = await c.listTools();
      setClient(c);
      setServerInfo(info);
      setTools(toolsResult.tools || []);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setStatusError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDisconnect() {
    setClient(null);
    setServerInfo(null);
    setTools([]);
    setSelectedTool(null);
    setToolArgs({});
    setResult(null);
    setAppHtml(null);
    setLastToolInput(undefined);
    setLastToolResult(undefined);
    setStatus("idle");
  }

  function handleSelectTool(name: string) {
    setSelectedTool(name);
    setToolArgs({});
    setResult(null);
    setAppHtml(null);
    setAppHeight(450);
    setLastToolInput(undefined);
    setLastToolResult(undefined);
  }

  async function handleRun() {
    if (!client || !selectedToolInfo) return;
    setRunning(true);
    setResult(null);
    setAppHtml(null);

    try {
      // Build typed args from form fields
      const args: Record<string, unknown> = {};
      const props = selectedToolInfo.inputSchema?.properties || {};
      for (const [key, schema] of Object.entries(props)) {
        const val = toolArgs[key];
        if (val !== undefined && val !== "") {
          if (schema.type === "number" || schema.type === "integer") {
            args[key] = Number(val);
          } else if (schema.type === "boolean") {
            args[key] = val === "true";
          } else {
            args[key] = val;
          }
        }
      }

      setLastToolInput(args);
      const res = await client.callTool(selectedTool!, args);
      setResult(res);
      setLastToolResult(res);

      // Check for MCP App UI (structuredContent with resource URI)
      const uri = res?.structuredContent?.resource?.uri;
      if (uri) {
        const resourceResult = await client.readResource(uri);
        const html = resourceResult?.contents?.[0]?.text;
        if (html) {
          setAppHtml(html);
        }
      }
    } catch (e) {
      setResult({
        isError: true,
        content: [
          { type: "text", text: e instanceof Error ? e.message : String(e) },
        ],
      });
    } finally {
      setRunning(false);
    }
  }

  // AppRenderer callbacks for iframe tool calls / resource reads
  const handleCallTool = useCallback(
    async (params: { name: string; arguments?: Record<string, unknown> }) => {
      if (!client) throw new Error("Not connected");
      return client.callTool(params.name, params.arguments || {});
    },
    [client],
  );

  const handleReadResource = useCallback(
    async (params: { uri: string }) => {
      if (!client) throw new Error("Not connected");
      return client.readResource(params.uri);
    },
    [client],
  );

  const sandboxConfig = useMemo(
    () => ({ url: new URL("/sandbox_proxy.html", window.location.origin) }),
    [],
  );

  function handleArgKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !running) {
      handleRun();
    }
  }

  return (
    <div className="host">
      <header className="host-header">
        <h1>MCP App Sandbox</h1>
        <span className={`status-badge ${status}`}>
          {status === "connected" && serverInfo
            ? serverInfo.serverInfo?.name || "connected"
            : status}
        </span>
      </header>

      <div className="host-body">
        {/* Sidebar: connection + tool list */}
        <aside className="sidebar">
          <section className="panel">
            <h2>Server</h2>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                status !== "connecting" &&
                status !== "connected" &&
                handleConnect()
              }
              placeholder="http://localhost:3001/mcp"
              disabled={status === "connected"}
            />
            {status === "connected" ? (
              <button className="btn-disconnect" onClick={handleDisconnect}>
                Disconnect
              </button>
            ) : (
              <button
                className="btn-connect"
                onClick={handleConnect}
                disabled={status === "connecting"}
              >
                {status === "connecting" ? "Connecting..." : "Connect"}
              </button>
            )}
            {statusError && <div className="error-msg">{statusError}</div>}
          </section>

          {tools.length > 0 && (
            <section className="panel">
              <h2>Tools ({tools.length})</h2>
              <ul className="tool-list">
                {tools.map((tool) => (
                  <li
                    key={tool.name}
                    className={`tool-item ${selectedTool === tool.name ? "selected" : ""}`}
                    onClick={() => handleSelectTool(tool.name)}
                  >
                    <span className="tool-name">{tool.name}</span>
                    {tool.description && (
                      <span className="tool-desc">{tool.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        {/* Main content area */}
        <main className="main-content">
          {/* Tool execution panel */}
          {selectedToolInfo && (
            <section className="panel execution-panel">
              <h2>{selectedTool}</h2>
              {selectedToolInfo.description && (
                <p className="tool-description">
                  {selectedToolInfo.description}
                </p>
              )}

              <div className="tool-args">
                {Object.entries(
                  selectedToolInfo.inputSchema?.properties || {},
                ).map(([key, schema]) => (
                  <div key={key} className="arg-field">
                    <label>
                      {key}
                      {selectedToolInfo.inputSchema?.required?.includes(
                        key,
                      ) && <span className="required">*</span>}
                    </label>
                    {schema.enum ? (
                      <select
                        value={toolArgs[key] || ""}
                        onChange={(e) =>
                          setToolArgs((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select...</option>
                        {schema.enum.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          schema.type === "number" ||
                          schema.type === "integer"
                            ? "number"
                            : "text"
                        }
                        value={toolArgs[key] || ""}
                        onChange={(e) =>
                          setToolArgs((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        onKeyDown={handleArgKeyDown}
                        placeholder={schema.description || key}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn-run"
                onClick={handleRun}
                disabled={running}
              >
                {running ? "Running..." : "Run Tool"}
              </button>
            </section>
          )}

          {/* Text result (when no MCP App UI) */}
          {result && !appHtml && (
            <section className="panel result-panel">
              <h2>
                Result{" "}
                {result.isError && <span className="error-tag">Error</span>}
              </h2>
              <pre className="result-json">
                {JSON.stringify(result.content, null, 2)}
              </pre>
            </section>
          )}

          {/* MCP App display */}
          {appHtml && (
            <section className="panel app-panel">
              <div className="app-header">
                <h2>MCP App</h2>
                <span className="app-tool-name">{selectedTool}</span>
              </div>
              <div className="app-container" style={{ height: appHeight }}>
                <AppRenderer
                  toolName={selectedTool!}
                  sandbox={sandboxConfig}
                  html={appHtml}
                  toolInput={lastToolInput}
                  toolResult={lastToolResult as any}
                  onCallTool={handleCallTool as any}
                  onReadResource={handleReadResource as any}
                  onSizeChanged={(params) => {
                    if (params.height && params.height > 0) {
                      setAppHeight(Math.min(Math.max(params.height, 200), 900));
                    }
                  }}
                  onError={(err) => console.error("MCP App error:", err)}
                />
              </div>
            </section>
          )}

          {/* Empty states */}
          {!selectedTool && status === "connected" && (
            <div className="placeholder">
              Select a tool from the sidebar to get started
            </div>
          )}
          {status !== "connected" && (
            <div className="placeholder">
              Connect to an MCP server to get started
            </div>
          )}
        </main>

        {/* AI Agent chat panel */}
        {status === "connected" && (
          <Chat
            serverUrl={serverUrl}
            isConnected={status === "connected"}
            onCallTool={handleCallTool}
            onReadResource={handleReadResource}
          />
        )}
      </div>
    </div>
  );
}
