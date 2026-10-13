export const DEMO_TICK_MS = 2000;

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

export type RoutePoint = [lat: number, lon: number];

export type DemoVessel = Vessel & {
  route: RoutePoint[];
};

export const demoVessels: DemoVessel[] = [
  {
    id: "demo-1",
    name: "Демо-судно 1",
    lat: 51.0,
    lon: 1.45,
    speedKnots: 12,
    courseDeg: 45,
    timestamp: "2026-09-26T12:00:00Z",
    source: "demo",
    route: [
      [51.0, 1.45],
      [51.02, 1.49],
      [51.04, 1.54],
      [51.06, 1.59],
      [51.08, 1.64],
      [51.10, 1.69],
      [51.12, 1.74],
      [51.14, 1.79],
    ],
  },
  {
    id: "demo-2",
    name: "Демо-судно 2",
    lat: 50.88,
    lon: 1.12,
    speedKnots: 10,
    courseDeg: 90,
    timestamp: "2026-09-26T12:00:00Z",
    source: "demo",
    route: [
      [50.88, 1.12],
      [50.90, 1.17],
      [50.92, 1.22],
      [50.94, 1.27],
      [50.96, 1.32],
      [50.98, 1.37],
      [51.00, 1.42],
      [51.02, 1.47],
      [51.04, 1.52],
    ],
  },
  {
    id: "demo-3",
    name: "Демо-судно 3",
    lat: 51.18,
    lon: 1.82,
    speedKnots: 8,
    courseDeg: 225,
    timestamp: "2026-09-26T12:00:00Z",
    source: "demo",
    route: [
      [51.18, 1.82],
      [51.16, 1.78],
      [51.14, 1.74],
      [51.12, 1.70],
      [51.10, 1.66],
      [51.08, 1.62],
      [51.06, 1.58],
      [51.04, 1.54],
      [51.02, 1.50],
      [51.00, 1.46],
    ],
  },
];

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
