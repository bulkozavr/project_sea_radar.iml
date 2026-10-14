"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEMO_TICK_MS, demoVessels, mapConfig, type RoutePoint, type Vessel } from "../config/map";

type MovingVessel = Vessel & { route: RoutePoint[]; routeIndex: number };
type SnapshotState = "idle-demo" | "loading" | "success" | "empty" | "error";
type MarkerEntry = { marker: L.Marker; icon: L.DivIcon };
type SnapshotSuccess = {
  ok: true;
  vessels: Vessel[];
  collectedAt: string;
  windowSeconds: number;
  count: number;
  truncated: boolean;
  reason: "window_elapsed" | "limit_reached";
};
type SnapshotFailure = { ok: false; attemptedAt: string; error: { code: string; message: string } };

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Нет данных";
  return `${date.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })} UTC`;
}

function formatSpeed(speedKnots: number | null): string {
  if (speedKnots === null) return "Нет данных";
  return `${speedKnots.toFixed(1).replace(/\.0$/, "")} уз`;
}

function getInitialBearing(from: RoutePoint, to: RoutePoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude1 = toRadians(from[0]);
  const latitude2 = toRadians(to[0]);
  const longitudeDifference = toRadians(to[1] - from[1]);
  const y = Math.sin(longitudeDifference) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDifference);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function VesselCard({ vessel }: { vessel: Vessel }) {
  return (
    <section className="vessel-card">
      <h2>{vessel.id}</h2>
      <dl>
        <dt>Название</dt><dd>{vessel.name ?? "Нет данных"}</dd>
        <dt>Координаты</dt><dd>{vessel.lat.toFixed(5)}, {vessel.lon.toFixed(5)}</dd>
        <dt>Скорость</dt><dd>{formatSpeed(vessel.speedKnots)}</dd>
        <dt>Курс</dt><dd>{vessel.courseDeg === null ? "Нет данных" : `${Math.round(vessel.courseDeg) % 360}°`}</dd>
        <dt>Время</dt><dd>{formatTime(vessel.timestamp)}</dd>
        <dt>Источник</dt><dd>{vessel.source === "demo" ? "Демонстрационные данные" : "AISStream"}</dd>
      </dl>
    </section>
  );
}

function makeIcon(vessel: Vessel): L.DivIcon {
  const iconType = vessel.courseDeg === null ? "neutral" : "course";
  const iconContent = vessel.courseDeg === null
    ? '<span class="vessel-icon-neutral"></span>'
    : `<span class="vessel-icon-course" style="transform: rotate(${vessel.courseDeg}deg)"></span>`;
  return L.divIcon({
    className: "vessel-marker",
    html: `<div data-vessel-id="${vessel.id}" data-icon="${iconType}">${iconContent}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, MarkerEntry>>(new globalThis.Map());
  const hasCenteredSnapshotRef = useRef(false);
  const [state, setState] = useState<SnapshotState>("idle-demo");
  const [vessels, setVessels] = useState<Vessel[]>(() => {
    const timestamp = new Date().toISOString();
    return demoVessels.map((vessel) => ({
      ...vessel,
      lat: vessel.route[0][0],
      lon: vessel.route[0][1],
      courseDeg: getInitialBearing(vessel.route[0], vessel.route[1]),
      timestamp,
      routeIndex: 0,
    }));
  });
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [attemptTime, setAttemptTime] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState(15);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const selectedVessel = vessels.find((vessel) => vessel.id === selectedVesselId) ?? null;

  useEffect(() => {
    if (state !== "idle-demo") return;
    const timer = window.setInterval(() => {
      const timestamp = new Date().toISOString();
      setVessels((current) => current.map((vessel) => {
        const moving = vessel as MovingVessel;
        if (!moving.route || moving.routeIndex >= moving.route.length - 1) return vessel;
        const routeIndex = moving.routeIndex + 1;
        const [lat, lon] = moving.route[routeIndex];
        const courseDeg = getInitialBearing(moving.route[routeIndex - 1], moving.route[routeIndex]);
        const arrived = routeIndex === moving.route.length - 1;
        return {
          ...moving,
          lat,
          lon,
          courseDeg,
          timestamp,
          speedKnots: arrived ? 0 : moving.speedKnots,
          routeIndex,
        };
      }));
    }, DEMO_TICK_MS);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: mapConfig.center,
      zoom: mapConfig.zoom,
      minZoom: 8,
      maxZoom: 16,
    });
    mapRef.current = map;
    const bounds = L.latLngBounds(
      [mapConfig.bounds.south, mapConfig.bounds.west],
      [mapConfig.bounds.north, mapConfig.bounds.east],
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    map.setMaxBounds(bounds);
    map.on("resize", () => map.invalidateSize());
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const onSelect = useCallback((id: string) => {
    setSelectedVesselId((current) => current === id ? current : id);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentIds = new Set(vessels.map((vessel) => vessel.id));
    markersRef.current.forEach(({ marker }, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
    vessels.forEach((vessel) => {
      const existing = markersRef.current.get(vessel.id);
      if (existing) {
        existing.marker.setLatLng([vessel.lat, vessel.lon]);
        const icon = makeIcon(vessel);
        existing.marker.setIcon(icon);
        markersRef.current.set(vessel.id, { marker: existing.marker, icon });
      } else {
        const icon = makeIcon(vessel);
        const marker = L.marker([vessel.lat, vessel.lon], { icon }).addTo(map);
        marker.on("click", () => onSelect(vessel.id));
        markersRef.current.set(vessel.id, { marker, icon });
      }
    });
  }, [vessels, onSelect]);

  async function loadSnapshot() {
    if (state === "loading") return;
    setState("loading");
    setVessels([]);
    setSelectedVesselId(null);
    setAttemptTime(null);
    setMessage(null);
    setTruncated(false);
    setSnapshotCount(0);
    try {
      const response = await fetch("/api/snapshot");
      const result = await response.json() as SnapshotSuccess | SnapshotFailure;
      if (!response.ok || !result.ok) {
        const failure = result as SnapshotFailure;
        setAttemptTime(failure.attemptedAt);
        setMessage(`Не удалось получить данные: ${failure.error.message}`);
        setVessels([]);
        setState("error");
        return;
      }
      const success = result as SnapshotSuccess;
      setAttemptTime(success.collectedAt);
      setWindowSeconds(success.windowSeconds);
      setSnapshotCount(success.count);
      setTruncated(success.truncated);
      setVessels(success.vessels);
      setMessage(success.count === 0 ? "За время сбора позиции не получены" : null);
      if (success.vessels.length > 0 && !hasCenteredSnapshotRef.current) {
        mapRef.current?.setView(mapConfig.center, mapConfig.zoom);
        hasCenteredSnapshotRef.current = true;
      }
      setState(success.vessels.length === 0 ? "empty" : "success");
    } catch {
      setAttemptTime(null);
      setMessage("Не удалось получить данные: Внутренняя ошибка сервера");
      setVessels([]);
      setState("error");
    }
  }

  const sourceLabel = state === "idle-demo"
    ? "Демонстрационные данные"
    : state === "loading"
      ? "Загрузка…"
      : state === "error"
        ? "Данных на карте нет"
        : `AISStream · снимок за ${windowSeconds} с · получен ${attemptTime ? formatTime(attemptTime) : "Нет данных"} · судов: ${snapshotCount} · выборка неполная${truncated ? " · остановлено на лимите 100" : ""}`;

  return (
    <div className="map-layout">
      <div ref={containerRef} className="map" aria-label="Карта пролива Дувр" />
      <aside className="map-source">
        <button type="button" onClick={loadSnapshot} disabled={state === "loading"}>
          Загрузить настоящие позиции
        </button>
        <p className="source-label">{sourceLabel}</p>
        {message && (
          <p className="source-message">
            {message}
            {state === "error" && attemptTime && <><br /><time dateTime={attemptTime}>{formatTime(attemptTime)}</time></>}
          </p>
        )}
        {selectedVessel && <VesselCard vessel={selectedVessel} />}
      </aside>
    </div>
  );
}
