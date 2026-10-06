export type Vessel = {
  id: string;
  name: string | null;
  lat: number;
  lon: number;
  speedKnots: number | null;
  courseDeg: number | null;
  timestamp: string;
  source: "demo" | "aisstream";
};

export const demoVessel: Vessel = {
  id: "demo-1",
  name: "Демо-судно 1",
  lat: 51.0,
  lon: 1.45,
  speedKnots: 12,
  courseDeg: 45,
  timestamp: "2026-09-26T12:00:00Z",
  source: "demo",
};

export const mapConfig = {
  bounds: {
    south: 50.75,
    west: 0.95,
    north: 51.25,
    east: 1.95,
  },
  center: [51.0, 1.45] as [number, number],
  zoom: 10,
};
