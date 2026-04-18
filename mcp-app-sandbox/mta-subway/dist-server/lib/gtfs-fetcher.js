import GtfsRealtimeBindings from "gtfs-realtime-bindings";
/**
 * Fetch GTFS-RT protobuf from MTA and extract arrival times
 * for a specific stop, optionally filtered by route.
 *
 * @param feedUrl - MTA GTFS-RT feed URL
 * @param stopId  - Parent stop ID (e.g. "G26")
 * @param routeId - Optional route filter (e.g. "G") for shared feeds
 * @returns Arrival times in minutes for each direction, sorted ascending
 */
export async function fetchArrivals(feedUrl, stopId, routeId) {
    const response = await fetch(feedUrl);
    if (!response.ok) {
        throw new Error(`MTA feed request failed: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    const now = Date.now() / 1000;
    const north = [];
    const south = [];
    for (const entity of feed.entity) {
        if (!entity.tripUpdate)
            continue;
        // Filter by routeId if specified (needed for shared feeds like 1-7)
        if (routeId && entity.tripUpdate.trip?.routeId !== routeId) {
            continue;
        }
        for (const stu of entity.tripUpdate.stopTimeUpdate ?? []) {
            const timeValue = stu.arrival?.time ?? stu.departure?.time;
            if (!timeValue)
                continue;
            // gtfs-realtime-bindings uses protobufjs Long for int64.
            // Unix timestamps fit in 32 bits, so .low is safe.
            const arrivalTime = typeof timeValue === "number"
                ? timeValue
                : typeof timeValue.toNumber === "function"
                    ? timeValue.toNumber()
                    : timeValue.low ?? 0;
            if (arrivalTime === 0)
                continue;
            const mins = Math.round((arrivalTime - now) / 60);
            if (mins < 0)
                continue;
            if (stu.stopId === `${stopId}N`) {
                north.push(mins);
            }
            else if (stu.stopId === `${stopId}S`) {
                south.push(mins);
            }
        }
    }
    return {
        north: north.sort((a, b) => a - b).slice(0, 5),
        south: south.sort((a, b) => a - b).slice(0, 5),
    };
}
