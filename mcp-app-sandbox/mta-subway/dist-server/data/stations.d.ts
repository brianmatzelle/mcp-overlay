export interface StationInfo {
    id: string;
    name: string;
    lines: string[];
    directions: {
        N: string;
        S: string;
    };
}
export declare const STATIONS: Record<string, StationInfo>;
/**
 * Search stations by name (fuzzy partial match).
 * Optionally filter by line.
 */
export declare function searchStations(query: string, line?: string): StationInfo[];
/**
 * Resolve a station query to a single StationInfo.
 * Tries: direct stop_id, exact name match, partial match.
 */
export declare function resolveStation(line: string, query: string): StationInfo;
