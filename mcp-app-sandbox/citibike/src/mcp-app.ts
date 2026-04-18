import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import "./mcp-app.css";

interface StationData {
  stationName: string;
  stationId: string;
  lat: number;
  lon: number;
  capacity: number;
  classicBikes: number;
  ebikes: number;
  totalBikes: number;
  docksAvailable: number;
  fillPercent: number;
  isRenting: boolean;
  isReturning: boolean;
  lastReported: number;
  fetchedAt: string;
}

const widget = document.getElementById("widget")!;
const loading = document.getElementById("loading")!;
let currentData: StationData | null = null;
let refreshInterval: number | null = null;

const app = new App({ name: "Citi Bike Station Status", version: "1.0.0" });

// Register all handlers BEFORE connect

app.ontoolinput = (_params) => {
  loading.textContent = "Fetching station data...";
  loading.style.display = "block";
};

app.ontoolresult = (result) => {
  const textBlock = result.content?.find(
    (c: { type: string }) => c.type === "text"
  ) as { type: "text"; text: string } | undefined;
  if (!textBlock) return;

  try {
    const data = JSON.parse(textBlock.text) as StationData;
    currentData = data;
    renderWidget(data);
    startAutoRefresh();
  } catch {
    showError("Failed to parse station data");
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

function countColorClass(count: number): string {
  if (count === 0) return "count-red";
  if (count <= 5) return "count-yellow";
  return "count-green";
}

function renderWidget(data: StationData) {
  loading.style.display = "none";

  const showBadges = !data.isRenting || !data.isReturning;

  widget.innerHTML = `
    <div class="loading" id="loading" style="display:none">Loading station data...</div>
    <div class="header">
      <span class="header-icon">\u{1F6B2}</span>
      <div class="station-name">${escapeHtml(data.stationName)}</div>
    </div>

    <div class="section">
      <div class="section-label">Bikes Available</div>
      <div class="bike-counts">
        <div class="bike-count">
          <span class="count-value ${countColorClass(data.classicBikes)}">${data.classicBikes}</span>
          <span class="count-label">classic</span>
        </div>
        <div class="bike-count">
          <span class="ebike-icon">\u26A1</span>
          <span class="count-value ${countColorClass(data.ebikes)}">${data.ebikes}</span>
          <span class="count-label">ebike</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Docks Available</div>
      <div class="dock-count">
        <span class="dock-value ${countColorClass(data.docksAvailable)}">${data.docksAvailable}</span>
        <span class="dock-total">of ${data.capacity}</span>
      </div>
    </div>

    <div class="capacity-bar-container">
      <div class="capacity-bar">
        <div class="capacity-fill" style="width: ${data.fillPercent}%"></div>
      </div>
      <div class="capacity-label">${data.fillPercent}% full</div>
    </div>

    ${showBadges ? `
    <div class="status-badges">
      ${!data.isRenting ? '<span class="badge badge-inactive">Not Renting</span>' : ""}
      ${!data.isReturning ? '<span class="badge badge-inactive">Not Returning</span>' : ""}
    </div>
    ` : ""}

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
      name: "citibike-status",
      arguments: { station: currentData.stationName },
    });

    const textBlock = result.content?.find(
      (c: { type: string }) => c.type === "text"
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) return;

    const data = JSON.parse(textBlock.text) as StationData;
    currentData = data;
    renderWidget(data);
  } catch (e) {
    console.error("Refresh failed:", e);
    showError("Refresh failed - will retry automatically");
  }
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = window.setInterval(manualRefresh, 60_000);
}

// ── Connect ───────────────────────────────────────────────
app.connect();
