export interface ArrivalResult {
    north: number[];
    south: number[];
}
/**
 * Fetch GTFS-RT protobuf from MTA and extract arrival times
 * for a specific stop, optionally filtered by route.
 *
 * @param feedUrl - MTA GTFS-RT feed URL
 * @param stopId  - Parent stop ID (e.g. "G26")
 * @param routeId - Optional route filter (e.g. "G") for shared feeds
 * @returns Arrival times in minutes for each direction, sorted ascending
 */
export declare function fetchArrivals(feedUrl: string, stopId: string, routeId?: string): Promise<ArrivalResult>;
