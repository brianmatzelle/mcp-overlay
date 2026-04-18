import { create } from "zustand";
import type { TrackedObject, EnrichmentResponse } from "../types/index";

interface StoreState {
  trackedObjects: Map<number, TrackedObject>;
  setTrackedObjects: (objects: TrackedObject[]) => void;
  updateEnrichment: (trackId: number, data: EnrichmentResponse) => void;
  setEnrichmentState: (
    trackId: number,
    state: TrackedObject["enrichmentState"]
  ) => void;
  toggleExpanded: (trackId: number) => void;
}

export const useStore = create<StoreState>((set) => ({
  trackedObjects: new Map(),

  setTrackedObjects: (objects) =>
    set((state) => {
      const next = new Map(state.trackedObjects);

      // Remove tracks that are no longer present
      for (const id of next.keys()) {
        if (!objects.some((o) => o.trackId === id)) {
          next.delete(id);
        }
      }

      // Upsert incoming objects, preserving enrichment fields for existing tracks
      for (const obj of objects) {
        const existing = next.get(obj.trackId);
        if (existing) {
          next.set(obj.trackId, {
            ...obj,
            enrichmentState: existing.enrichmentState,
            enrichmentData: existing.enrichmentData,
            isExpanded: existing.isExpanded,
          });
        } else {
          next.set(obj.trackId, obj);
        }
      }

      return { trackedObjects: new Map(next) };
    }),

  updateEnrichment: (trackId, data) =>
    set((state) => {
      const obj = state.trackedObjects.get(trackId);
      if (!obj) return state;
      const next = new Map(state.trackedObjects);
      next.set(trackId, {
        ...obj,
        enrichmentState: "ready",
        enrichmentData: data,
      });
      return { trackedObjects: next };
    }),

  setEnrichmentState: (trackId, enrichmentState) =>
    set((state) => {
      const obj = state.trackedObjects.get(trackId);
      if (!obj) return state;
      const next = new Map(state.trackedObjects);
      next.set(trackId, { ...obj, enrichmentState });
      return { trackedObjects: next };
    }),

  toggleExpanded: (trackId) =>
    set((state) => {
      const obj = state.trackedObjects.get(trackId);
      if (!obj) return state;
      const next = new Map(state.trackedObjects);
      next.set(trackId, { ...obj, isExpanded: !obj.isExpanded });
      return { trackedObjects: next };
    }),
}));
