import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE, } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LINE_COLORS } from "./data/line-colors.js";
import { FEED_URLS } from "./data/feed-urls.js";
import { resolveStation, searchStations } from "./data/stations.js";
import { fetchArrivals } from "./lib/gtfs-fetcher.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");
const RESOURCE_URI = "ui://subway-arrivals/mcp-app.html";
const DASHBOARD_URI = "ui://subway-dashboard/mcp-app.html";
export function createServer() {
    const server = new McpServer({
        name: "mta-subway",
        version: "1.0.0",
    });
    // ── subway-arrivals tool (with UI) ────────────────────────
    registerAppTool(server, "subway-arrivals", {
        title: "NYC Subway Arrivals",
        description: "Shows real-time subway arrival times for a NYC station. " +
            "Use line (e.g. 'G', 'L', 'A') and station (e.g. 'Greenpoint Av', 'Union Sq'). " +
            "Returns a live countdown display.",
        inputSchema: {
            line: z
                .string()
                .describe("Subway line letter or number (e.g. 'G', 'L', '1', 'A')"),
            station: z
                .string()
                .describe("Station name or stop ID (e.g. 'Greenpoint Av', 'G26', 'Times Sq-42 St')"),
        },
        _meta: {
            ui: { resourceUri: RESOURCE_URI },
        },
    }, async ({ line, station }) => {
        const upperLine = line.toUpperCase();
        const stationInfo = resolveStation(upperLine, station);
        const feedUrl = FEED_URLS[upperLine];
        if (!feedUrl) {
            return {
                content: [
                    { type: "text", text: `Unknown line: ${line}` },
                ],
                isError: true,
            };
        }
        const arrivals = await fetchArrivals(feedUrl, stationInfo.id, upperLine);
        const color = LINE_COLORS[upperLine] ?? "#999999";
        const data = {
            line: upperLine,
            stationName: stationInfo.name,
            stopId: stationInfo.id,
            directions: {
                N: { label: stationInfo.directions.N, arrivals: arrivals.north },
                S: { label: stationInfo.directions.S, arrivals: arrivals.south },
            },
            color,
            fetchedAt: new Date().toISOString(),
        };
        const summary = `${upperLine} train at ${stationInfo.name}: ` +
            `${stationInfo.directions.N}: ${arrivals.north.join(", ") || "no trains"} min | ` +
            `${stationInfo.directions.S}: ${arrivals.south.join(", ") || "no trains"} min`;
        return {
            content: [{ type: "text", text: JSON.stringify(data) }],
            structuredContent: {
                type: "resource",
                resource: {
                    uri: RESOURCE_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: summary,
                },
            },
        };
    });
    // ── search-stations tool (model-only, no UI) ─────────────
    registerAppTool(server, "search-stations", {
        title: "Search NYC Subway Stations",
        description: "Search for NYC subway stations by name. Returns matching stations " +
            "with their stop IDs and lines served. Use this to find the correct " +
            "station before calling subway-arrivals.",
        inputSchema: {
            query: z
                .string()
                .describe("Station name to search for (partial match supported)"),
            line: z
                .string()
                .optional()
                .describe("Optional: filter by subway line"),
        },
        _meta: {
            ui: { visibility: ["model"] },
        },
    }, async ({ query, line }) => {
        const results = searchStations(query, line);
        const text = results.length === 0
            ? `No stations found matching "${query}"${line ? ` on ${line} line` : ""}`
            : results
                .slice(0, 10)
                .map((s) => `${s.name} (${s.id}) - Lines: ${s.lines.join(", ")}`)
                .join("\n");
        return {
            content: [{ type: "text", text }],
        };
    });
    // ── show-dashboard tool (with UI) ────────────────────────
    registerAppTool(server, "show-dashboard", {
        title: "NYC Subway Dashboard",
        description: "Shows a dashboard with multiple subway arrival panels in a grid. " +
            "Specify an array of panels, each with a line and station. " +
            'Example: panels = [{"line":"G","station":"Greenpoint Av"},{"line":"L","station":"Bedford Av"}]',
        inputSchema: {
            panels: z
                .array(z.object({
                line: z
                    .string()
                    .describe("Subway line letter or number (e.g. 'G', 'L', '1')"),
                station: z
                    .string()
                    .describe("Station name or stop ID (e.g. 'Greenpoint Av')"),
                label: z
                    .string()
                    .optional()
                    .describe("Optional display label for the panel"),
            }))
                .describe("Array of subway panels to display"),
        },
        _meta: {
            ui: { resourceUri: DASHBOARD_URI },
        },
    }, async ({ panels }) => {
        // Read the bundled subway app HTML to embed in child iframes
        const subwayHtml = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
        const data = { panels, appHtml: subwayHtml };
        const summary = panels
            .map((p) => `${p.line} at ${p.station}${p.label ? ` (${p.label})` : ""}`)
            .join(", ");
        return {
            content: [{ type: "text", text: JSON.stringify(data) }],
            structuredContent: {
                type: "resource",
                resource: {
                    uri: DASHBOARD_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: `Dashboard: ${summary}`,
                },
            },
        };
    });
    // ── UI resources ────────────────────────────────────────────
    registerAppResource(server, "MTA Subway Arrivals UI", RESOURCE_URI, {
        description: "Real-time NYC subway arrivals countdown display",
        mimeType: RESOURCE_MIME_TYPE,
    }, async () => {
        const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
        return {
            contents: [
                { uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
            ],
        };
    });
    registerAppResource(server, "NYC Subway Dashboard UI", DASHBOARD_URI, {
        description: "Dashboard displaying multiple subway arrival panels",
        mimeType: RESOURCE_MIME_TYPE,
    }, async () => {
        const html = await fs.readFile(path.join(DIST_DIR, "dashboard-app.html"), "utf-8");
        return {
            contents: [
                { uri: DASHBOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
            ],
        };
    });
    return server;
}
