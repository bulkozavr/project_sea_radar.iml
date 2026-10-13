"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEMO_TICK_MS, demoVessels, mapConfig, type RoutePoint, type Vessel } from "../config/map";

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Нет данных";
  }

  return `${date.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })} UTC`;
}

function formatSpeed(speedKnots: number | null): string {
  if (speedKnots === null) {
    return "Нет данных";
  }

  return `${speedKnots.toFixed(1).replace(/\.0$/, "")} уз`;
}

type MovingVessel = Vessel & {
  route: RoutePoint[];
  routeIndex: number;
};

type MarkerEntry = {
  marker: L.Marker;
  icon: L.DivIcon;
};

function getInitialBearing(from: RoutePoint, to: RoutePoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude1 = toRadians(from[0]);
  const latitude2 = toRadians(to[0]);
  const longitudeDifference = toRadians(to[1] - from[1]);
  const y = Math.sin(longitudeDifference) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDifference);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function VesselCard({ vessel }: { vessel: Vessel }) {
  return (
    <section className="vessel-card">
      <h2>{vessel.id}</h2>
      <dl>
        <dt>Название</dt>
        <dd>{vessel.name ?? "Нет данных"}</dd>
        <dt>Координаты</dt>
        <dd>{vessel.lat.toFixed(5)}, {vessel.lon.toFixed(5)}</dd>
        <dt>Скорость</dt>
        <dd>{formatSpeed(vessel.speedKnots)}</dd>
        <dt>Курс</dt>
        <dd>{vessel.courseDeg === null ? "Нет данных" : `${Math.round(vessel.courseDeg) % 360}°`}</dd>
        <dt>Время</dt>
        <dd>{formatTime(vessel.timestamp)}</dd>
        <dt>Источник</dt>
        <dd>{vessel.source === "demo" ? "Демонстрационные данные" : "AISStream"}</dd>
      </dl>
    </section>
  );
}

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<globalThis.Map<string, MarkerEntry>>(new globalThis.Map());
  const [vessels, setVessels] = useState<MovingVessel[]>(() => {
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
  const selectedVessel = vessels.find((vessel) => vessel.id === selectedVesselId) ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      console.count('tick');
      const timestamp = new Date().toISOString();
      setVessels((currentVessels) =>
        currentVessels.map((vessel) => {
          if (vessel.routeIndex >= vessel.route.length - 1) {
            return vessel;
          }

          const routeIndex = vessel.routeIndex + 1;
          const [lat, lon] = vessel.route[routeIndex];
          const courseDeg = getInitialBearing(vessel.route[routeIndex - 1], vessel.route[routeIndex]);
          const arrived = routeIndex === vessel.route.length - 1;

          return {
            ...vessel,
            lat,
            lon,
            courseDeg,
            timestamp,
            speedKnots: arrived ? 0 : vessel.speedKnots,
            routeIndex,
          };
        }),
      );
    }, DEMO_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    markersRef.current.forEach(({ marker, icon }, id) => {
      const vessel = vessels.find((current) => current.id === id);
      if (!vessel) {
        return;
      }

      marker.setLatLng([vessel.lat, vessel.lon]);
      const iconType = vessel.courseDeg === null ? "neutral" : "course";
      const iconContent =
        vessel.courseDeg === null
          ? '<span class="vessel-icon-neutral"></span>'
          : `<span class="vessel-icon-course" style="transform: rotate(${vessel.courseDeg}deg)"></span>`;
      icon.options.html = `<div data-vessel-id="${vessel.id}" data-icon="${iconType}">${iconContent}</div>`;
      marker.setIcon(icon);
    });
  }, [vessels]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: mapConfig.center,
      zoom: mapConfig.zoom,
      minZoom: 8,
      maxZoom: 16,
    });

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

    vessels.forEach((vessel) => {
      const iconType = vessel.courseDeg === null ? "neutral" : "course";
      const iconContent =
        vessel.courseDeg === null
          ? '<span class="vessel-icon-neutral"></span>'
          : `<span class="vessel-icon-course" style="transform: rotate(${vessel.courseDeg}deg)"></span>`;
      const vesselIcon = L.divIcon({
        className: "vessel-marker",
        html: `<div data-vessel-id="${vessel.id}" data-icon="${iconType}">${iconContent}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([vessel.lat, vessel.lon], { icon: vesselIcon }).addTo(map);
      markersRef.current.set(vessel.id, { marker, icon: vesselIcon });
      marker.on("click", () => {
        setSelectedVesselId((current) => current === vessel.id ? current : vessel.id);
      });
    });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      markersRef.current.clear();
      map.remove();
    };
  }, []);

  return (
    <div className="map-layout">
      <div ref={containerRef} className="map" aria-label="Карта пролива Дувр" />
      <aside className="map-source">
        <div aria-hidden="true" style={{ height: 48 }} />
        <p style={{ margin: 0 }}>
          {selectedVessel?.source === "aisstream" ? "AISStream" : "Демонстрационные данные"}
        </p>
        {selectedVessel && <VesselCard vessel={selectedVessel} />}
      </aside>
    </div>
  );
}
