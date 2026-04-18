import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import "./mcp-app.css";

interface ArrivalData {
  line: string;
  stationName: string;
  stopId: string;
  directions: {
    N: { label: string; arrivals: number[] };
    S: { label: string; arrivals: number[] };
  };
  color: string;
  fetchedAt: string;
}

const widget = document.getElementById("widget")!;
const loading = document.getElementById("loading")!;
let currentData: ArrivalData | null = null;
let refreshInterval: number | null = null;

const app = new App({ name: "MTA Subway Arrivals", version: "1.0.0" });

// Register all handlers BEFORE connect

app.ontoolinput = (_params) => {
  loading.textContent = "Fetching arrivals...";
  loading.style.display = "block";
};

app.ontoolresult = (result) => {
  // Parse arrival data from text content
  const textBlock = result.content?.find(
    (c: { type: string }) => c.type === "text"
  ) as { type: "text"; text: string } | undefined;
  if (!textBlock) return;

  try {
    const data = JSON.parse(textBlock.text) as ArrivalData;
    currentData = data;
    renderWidget(data);
    startAutoRefresh();
  } catch {
    showError("Failed to parse arrival data");
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

app.onteardown = async () => {
  if (refreshInterval) clearInterval(refreshInterval);
  return {};
};

// ── Rendering ─────────────────────────────────────────────

function renderWidget(data: ArrivalData) {
  loading.style.display = "none";

  // Build inner HTML - keep the loading div but hidden
  widget.innerHTML = `
    <div class="loading" id="loading" style="display:none">Loading arrivals...</div>
    <div class="header">
      <div class="line-bullet" style="background:${data.color}">${escapeHtml(data.line)}</div>
      <div class="station-name">${escapeHtml(data.stationName)}</div>
    </div>
    <div class="direction">
      <div class="dir-label">${escapeHtml(data.directions.N.label)}</div>
      <div class="arrivals">${formatArrivals(data.directions.N.arrivals)}</div>
    </div>
    <div class="divider"></div>
    <div class="direction">
      <div class="dir-label">${escapeHtml(data.directions.S.label)}</div>
      <div class="arrivals">${formatArrivals(data.directions.S.arrivals)}</div>
    </div>
    <div class="footer">
      <span class="status-dot"></span>
      <span class="updated-at">Updated ${formatTime(data.fetchedAt)}</span>
      <button class="refresh-btn" id="refresh-btn">Refresh</button>
    </div>
  `;

  document
    .getElementById("refresh-btn")
    ?.addEventListener("click", manualRefresh);
}

function formatArrivals(mins: number[]): string {
  if (mins.length === 0) {
    return '<span class="no-trains">No trains</span>';
  }
  return mins
    .map((m, i) => {
      if (m === 0) return '<span class="arriving">NOW</span>';
      if (i === 0) return `<span class="next-train">${m} min</span>`;
      return `<span class="later-train">${m}</span>`;
    })
    .join(" ");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function showError(msg: string) {
  loading.style.display = "none";
  const existing = widget.querySelector(".error");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "error";
  el.textContent = msg;
  widget.appendChild(el);
}

// ── Refresh ───────────────────────────────────────────────

async function manualRefresh() {
  if (!currentData) return;

  const btn = document.getElementById("refresh-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "...";
  }

  try {
    const result = await app.callServerTool({
      name: "subway-arrivals",
      arguments: { line: currentData.line, station: currentData.stopId },
    });

    const textBlock = result.content?.find(
      (c: { type: string }) => c.type === "text"
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) return;

    const data = JSON.parse(textBlock.text) as ArrivalData;
    currentData = data;
    renderWidget(data);
  } catch (e) {
    console.error("Refresh failed:", e);
    showError("Refresh failed - will retry automatically");
  }
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = window.setInterval(manualRefresh, 30_000);
}

// ── Connect ───────────────────────────────────────────────
app.connect();
