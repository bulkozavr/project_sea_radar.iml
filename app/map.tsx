"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { demoVessel, mapConfig, type Vessel } from "../config/map";

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
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);

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

    const iconType = demoVessel.courseDeg === null ? "neutral" : "course";
    const iconContent =
      demoVessel.courseDeg === null
        ? '<span class="vessel-icon-neutral"></span>'
        : `<span class="vessel-icon-course" style="transform: rotate(${demoVessel.courseDeg}deg)"></span>`;
    const vesselIcon = L.divIcon({
      className: "vessel-marker",
      html: `<div data-vessel-id="${demoVessel.id}" data-icon="${iconType}">${iconContent}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([demoVessel.lat, demoVessel.lon], { icon: vesselIcon }).addTo(map);
    marker.on("click", () => {
      setSelectedVessel((current) =>
        current?.id === demoVessel.id ? current : demoVessel,
      );
    });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
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
