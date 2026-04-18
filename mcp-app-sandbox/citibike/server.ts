import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findStation, searchStations, type Station } from "./lib/gbfs-fetcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");
const RESOURCE_URI = "ui://citibike-status/mcp-app.html";

function formatStationShortId(station: Station): string {
  return station.station_id.slice(0, 8);
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "citibike",
    version: "1.0.0",
  });

  // ── citibike-status tool (with UI) ────────────────────────
  registerAppTool(
    server,
    "citibike-status",
    {
      title: "Citi Bike Station Status",
      description:
        "Shows real-time Citi Bike station availability including classic bikes, " +
        "e-bikes, and open docks. Use station name (e.g. 'Grand Army Plaza', " +
        "'Bedford Ave'). Returns a live availability display.",
      inputSchema: {
        station: z
          .string()
          .describe(
            "Station name or partial match (e.g. 'Grand Army Plaza', 'Bedford Ave & N 7 St')"
          ),
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
      },
    },
    async ({ station }) => {
      const match = await findStation(station);

      if (!match) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No station found matching "${station}". Try search-citibike to find the correct name.`,
            },
          ],
          isError: true,
        };
      }

      const classicBikes =
        match.num_bikes_available - match.num_ebikes_available;
      const totalBikes = match.num_bikes_available;
      const fillPercent =
        match.capacity > 0
          ? Math.round((totalBikes / match.capacity) * 100)
          : 0;

      const data = {
        stationName: match.name,
        stationId: match.station_id,
        lat: match.lat,
        lon: match.lon,
        capacity: match.capacity,
        classicBikes: Math.max(0, classicBikes),
        ebikes: match.num_ebikes_available,
        totalBikes,
        docksAvailable: match.num_docks_available,
        fillPercent,
        isRenting: match.is_renting,
        isReturning: match.is_returning,
        lastReported: match.last_reported,
        fetchedAt: new Date().toISOString(),
      };

      const summary =
        `${match.name}: ${Math.max(0, classicBikes)} classic, ${match.num_ebikes_available} e-bikes, ` +
        `${match.num_docks_available} docks available (${fillPercent}% full)`;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: {
          type: "resource" as const,
          resource: {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: summary,
          },
        },
      };
    }
  );

  // ── search-citibike tool (model-only, no UI) ─────────────
  registerAppTool(
    server,
    "search-citibike",
    {
      title: "Search Citi Bike Stations",
      description:
        "Search for Citi Bike stations by name. Returns matching stations " +
        "with their short IDs and availability. Use this to find the correct " +
        "station name before calling citibike-status.",
      inputSchema: {
        query: z
          .string()
          .describe("Station name to search for (partial match supported)"),
      },
      _meta: {
        ui: { visibility: ["model"] },
      },
    },
    async ({ query }) => {
      const results = await searchStations(query);
      const text =
        results.length === 0
          ? `No stations found matching "${query}"`
          : results
              .map(
                (s) =>
                  `${s.name} (${formatStationShortId(s)}) - ${s.num_bikes_available} bikes, ${s.num_docks_available} docks`
              )
              .join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  // ── UI resource ────────────────────────────────────────────
  registerAppResource(
    server,
    "Citi Bike Station Status UI",
    RESOURCE_URI,
    {
      description: "Real-time Citi Bike station availability display",
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8"
      );
      return {
        contents: [
          { uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    }
  );

  return server;
}
