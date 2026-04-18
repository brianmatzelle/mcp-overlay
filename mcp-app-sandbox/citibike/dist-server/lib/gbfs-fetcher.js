// GBFS API URLs
const STATION_INFO_URL = "https://gbfs.citibikenyc.com/gbfs/en/station_information.json";
const STATION_STATUS_URL = "https://gbfs.citibikenyc.com/gbfs/en/station_status.json";
// Cache TTLs
const INFO_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STATUS_TTL_MS = 60 * 1000; // 60 seconds
// Cache state
let infoCache = null;
let infoCacheTime = 0;
let statusCache = null;
let statusCacheTime = 0;
async function fetchStationInfo() {
    if (infoCache && Date.now() - infoCacheTime < INFO_TTL_MS) {
        return infoCache;
    }
    const res = await fetch(STATION_INFO_URL);
    if (!res.ok)
        throw new Error(`Failed to fetch station info: ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json());
    const map = new Map();
    for (const s of json.data.stations) {
        map.set(s.station_id, {
            station_id: s.station_id,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            capacity: s.capacity,
        });
    }
    infoCache = map;
    infoCacheTime = Date.now();
    return map;
}
async function fetchStationStatus() {
    if (statusCache && Date.now() - statusCacheTime < STATUS_TTL_MS) {
        return statusCache;
    }
    const res = await fetch(STATION_STATUS_URL);
    if (!res.ok)
        throw new Error(`Failed to fetch station status: ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json());
    const map = new Map();
    for (const s of json.data.stations) {
        map.set(s.station_id, {
            station_id: s.station_id,
            num_bikes_available: s.num_bikes_available ?? 0,
            num_ebikes_available: s.num_ebikes_available ?? 0,
            num_docks_available: s.num_docks_available ?? 0,
            is_renting: s.is_renting === true || s.is_renting === 1,
            is_returning: s.is_returning === true || s.is_returning === 1,
            last_reported: s.last_reported ?? 0,
        });
    }
    statusCache = map;
    statusCacheTime = Date.now();
    return map;
}
/** Fetch and merge station info + status into a single map */
export async function fetchStations() {
    const [info, status] = await Promise.all([
        fetchStationInfo(),
        fetchStationStatus(),
    ]);
    const merged = new Map();
    for (const [id, inf] of info) {
        const st = status.get(id);
        if (!st)
            continue;
        merged.set(id, {
            ...inf,
            ...st,
        });
    }
    return merged;
}
/** Fuzzy-match a station name. Returns the best matching station or null. */
export async function findStation(query) {
    const stations = await fetchStations();
    const q = query.toLowerCase().trim();
    // Exact match first
    for (const s of stations.values()) {
        if (s.name.toLowerCase() === q)
            return s;
    }
    // Substring match - score by how early the match occurs and name length
    const matches = [];
    for (const s of stations.values()) {
        const name = s.name.toLowerCase();
        const idx = name.indexOf(q);
        if (idx !== -1) {
            // Lower score = better match. Prefer: earlier position, shorter name, starts-with
            const score = idx * 10 + name.length + (idx === 0 ? -100 : 0);
            matches.push({ station: s, score });
        }
    }
    if (matches.length === 0)
        return null;
    matches.sort((a, b) => a.score - b.score);
    return matches[0].station;
}
/** Search for stations matching a query. Returns top results. */
export async function searchStations(query, limit = 10) {
    const stations = await fetchStations();
    const q = query.toLowerCase().trim();
    const matches = [];
    for (const s of stations.values()) {
        const name = s.name.toLowerCase();
        const idx = name.indexOf(q);
        if (idx !== -1) {
            const score = idx * 10 + name.length + (idx === 0 ? -100 : 0);
            matches.push({ station: s, score });
        }
    }
    matches.sort((a, b) => a.score - b.score);
    return matches.slice(0, limit).map((m) => m.station);
}
