import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./dashboard-app.css";

// ── Types ──────────────────────────────────────────────

interface PanelConfig {
  line: string;
  station: string;
  label?: string;
}

interface DashboardData {
  panels: PanelConfig[];
  appHtml: string;
}

// ── Line colors (client-side subset) ───────────────────

const LINE_COLORS: Record<string, string> = {
  "1": "#D82233", "2": "#D82233", "3": "#D82233",
  "4": "#009952", "5": "#009952", "6": "#009952",
  "7": "#9A38A1",
  A: "#0062CF", C: "#0062CF", E: "#0062CF",
  B: "#EB6800", D: "#EB6800", F: "#EB6800", M: "#EB6800",
  G: "#799534",
  J: "#8E5C33", Z: "#8E5C33",
  L: "#7C858C",
  N: "#F6BC26", Q: "#F6BC26", R: "#F6BC26", W: "#F6BC26",
  S: "#7C858C",
};

// ── DOM refs ───────────────────────────────────────────

const dashboard = document.getElementById("dashboard")!;
const loading = document.getElementById("loading")!;
const bridges: AppBridge[] = [];

// ── App setup ──────────────────────────────────────────

const app = new App({ name: "NYC Subway Dashboard", version: "1.0.0" });

app.ontoolinput = () => {
  loading.textContent = "Fetching dashboard data...";
  loading.style.display = "block";
};

app.ontoolresult = (result) => {
  const textBlock = result.content?.find(
    (c: { type: string }) => c.type === "text",
  ) as { type: "text"; text: string } | undefined;
  if (!textBlock) return;

  try {
    const data = JSON.parse(textBlock.text) as DashboardData;
    renderDashboard(data);
  } catch {
    showError("Failed to parse dashboard data");
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

app.onteardown = async () => {
  for (const bridge of bridges) {
    try {
      await bridge.teardownResource({});
    } catch {
      // child may already be gone
    }
  }
  return {};
};

// ── Render dashboard ───────────────────────────────────

function renderDashboard(data: DashboardData) {
  loading.style.display = "none";

  dashboard.innerHTML = `
    <div class="dashboard-header">NYC Subway Dashboard</div>
    <div class="dashboard-grid" id="grid"></div>
  `;

  const grid = document.getElementById("grid")!;

  for (const panel of data.panels) {
    spawnPanel(grid, panel, data.appHtml);
  }
}

// ── Spawn a single panel ───────────────────────────────

async function spawnPanel(
  grid: HTMLElement,
  panel: PanelConfig,
  appHtml: string,
) {
  const lineColor = LINE_COLORS[panel.line.toUpperCase()] ?? "#999";
  const label = panel.label || `${panel.line.toUpperCase()} — ${panel.station}`;
  const panelId = `panel-${panel.line}-${panel.station}`.replace(/\s+/g, "-");

  // Build panel DOM
  const cell = document.createElement("div");
  cell.className = "dashboard-panel";
  cell.innerHTML = `
    <div class="panel-header">
      <div class="panel-line-bullet" style="background:${lineColor}">${escapeHtml(panel.line.toUpperCase())}</div>
      <span class="panel-label">${escapeHtml(label)}</span>
      <span class="panel-status" id="${panelId}-status">loading...</span>
    </div>
  `;

  // Create child iframe with subway app HTML
  const iframe = document.createElement("iframe");
  iframe.className = "panel-iframe";
  iframe.sandbox.add("allow-scripts");
  iframe.srcdoc = appHtml;

  cell.appendChild(iframe);
  grid.appendChild(cell);

  // Wait a tick for contentWindow to be available
  await new Promise((r) => setTimeout(r, 0));

  const childWindow = iframe.contentWindow;
  if (!childWindow) {
    setStatus(panelId, "error");
    return;
  }

  // Set up AppBridge as mini-host for this child
  const transport = new PostMessageTransport(childWindow, childWindow);
  const bridge = new AppBridge(
    null,
    { name: "NYC Subway Dashboard", version: "1.0.0" },
    { serverTools: {} },
  );
  bridges.push(bridge);

  // Race condition handling: child may init before or after tool result
  let toolResult: CallToolResult | null = null;
  let childReady = false;

  function sendDataToChild() {
    bridge.sendToolInput({
      arguments: { line: panel.line, station: panel.station },
    });
    bridge.sendToolResult(toolResult!);
  }

  // Proxy tool calls from child through our own App connection
  bridge.oncalltool = async (params) => {
    return app.callServerTool({
      name: params.name,
      arguments: params.arguments ?? {},
    });
  };

  bridge.oninitialized = () => {
    childReady = true;
    if (toolResult) sendDataToChild();
  };

  // Dynamic height from child
  bridge.onsizechange = ({ height }) => {
    if (height && height > 0) {
      iframe.style.height = `${Math.min(Math.max(height, 150), 500)}px`;
    }
  };

  // Connect bridge (starts listening for messages from this child)
  await bridge.connect(transport);

  // Fetch actual subway data
  try {
    const result = await app.callServerTool({
      name: "subway-arrivals",
      arguments: { line: panel.line, station: panel.station },
    });
    toolResult = result;
    setStatus(panelId, "live");

    if (childReady) sendDataToChild();
  } catch (e) {
    console.error(`Panel ${panel.line}/${panel.station} failed:`, e);
    setStatus(panelId, "error");
  }
}

// ── Helpers ────────────────────────────────────────────

function setStatus(panelId: string, status: "live" | "error") {
  const el = document.getElementById(`${panelId}-status`);
  if (!el) return;
  el.textContent = status === "live" ? "live" : "error";
  el.className = `panel-status ${status}`;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function showError(msg: string) {
  loading.style.display = "none";
  const el = document.createElement("div");
  el.className = "error";
  el.textContent = msg;
  dashboard.appendChild(el);
}

// ── Connect to host ────────────────────────────────────

app.connect();
