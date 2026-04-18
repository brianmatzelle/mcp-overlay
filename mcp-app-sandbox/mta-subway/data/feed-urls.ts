const MTA_BASE =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";

export const FEED_URLS: Record<string, string> = {
  "1": `${MTA_BASE}gtfs`,
  "2": `${MTA_BASE}gtfs`,
  "3": `${MTA_BASE}gtfs`,
  "4": `${MTA_BASE}gtfs`,
  "5": `${MTA_BASE}gtfs`,
  "6": `${MTA_BASE}gtfs`,
  "7": `${MTA_BASE}gtfs`,
  S: `${MTA_BASE}gtfs`,
  A: `${MTA_BASE}gtfs-ace`,
  C: `${MTA_BASE}gtfs-ace`,
  E: `${MTA_BASE}gtfs-ace`,
  B: `${MTA_BASE}gtfs-bdfm`,
  D: `${MTA_BASE}gtfs-bdfm`,
  F: `${MTA_BASE}gtfs-bdfm`,
  M: `${MTA_BASE}gtfs-bdfm`,
  G: `${MTA_BASE}gtfs-g`,
  J: `${MTA_BASE}gtfs-jz`,
  Z: `${MTA_BASE}gtfs-jz`,
  L: `${MTA_BASE}gtfs-l`,
  N: `${MTA_BASE}gtfs-nqrw`,
  Q: `${MTA_BASE}gtfs-nqrw`,
  R: `${MTA_BASE}gtfs-nqrw`,
  W: `${MTA_BASE}gtfs-nqrw`,
};
