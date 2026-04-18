export interface StationInfo {
    station_id: string;
    name: string;
    lat: number;
    lon: number;
    capacity: number;
}
export interface StationStatus {
    station_id: string;
    num_bikes_available: number;
    num_ebikes_available: number;
    num_docks_available: number;
    is_renting: boolean;
    is_returning: boolean;
    last_reported: number;
}
export interface Station {
    station_id: string;
    name: string;
    lat: number;
    lon: number;
    capacity: number;
    num_bikes_available: number;
    num_ebikes_available: number;
    num_docks_available: number;
    is_renting: boolean;
    is_returning: boolean;
    last_reported: number;
}
/** Fetch and merge station info + status into a single map */
export declare function fetchStations(): Promise<Map<string, Station>>;
/** Fuzzy-match a station name. Returns the best matching station or null. */
export declare function findStation(query: string): Promise<Station | null>;
/** Search for stations matching a query. Returns top results. */
export declare function searchStations(query: string, limit?: number): Promise<Station[]>;
