"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./map"), { ssr: false });

export default function Home() {
  return <main className="map-page"><Map /></main>;
}
