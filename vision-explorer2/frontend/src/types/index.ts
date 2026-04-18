// types/index.ts

export interface Detection {
  trackId: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrackedObject extends Detection {
  firstSeen: number;
  lastSeen: number;
  smoothedX: number;
  smoothedY: number;
  smoothedW: number;
  smoothedH: number;
  enrichmentState: "none" | "pending" | "ready" | "error";
  enrichmentData: EnrichmentResponse | null;
  isExpanded: boolean;
  fadingOut: boolean;
}

export interface EnrichmentResponse {
  trackId: number;
  identification: Identification;
  enrichment: Enrichment;
}

export interface Identification {
  name: string;
  brand: string | null;
  model: string | null;
  color: string;
  category: string;
  description: string;
}

export interface Enrichment {
  summary: string;
  price_estimate: {
    range_low: string;
    range_high: string;
    currency: string;
    note: string;
  };
  specs: Record<string, string>;
  search_query: string;
}

export interface WebSocketMessage {
  trackId: number;
  label: string;
  confidence: number;
  cropBase64: string;
}
