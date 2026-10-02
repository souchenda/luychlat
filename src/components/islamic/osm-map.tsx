"use client"

import dynamic from "next/dynamic"

import { Skeleton } from "@/components/ui/skeleton"

export type MapMarker = { id: string; lat: number; lng: number; tone: "MOSQUE" | "SURAU" | "HALAL" | "PENDING" | "PIN"; title: string }

export type OsmMapProps = {
  center: { lat: number; lng: number }
  zoom?: number
  markers?: MapMarker[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Tap (or drag the PIN marker) to choose a point. */
  onPick?: (point: { lat: number; lng: number }) => void
  /** The user's position, as a blue dot (stays on the device; only map tiles are fetched). */
  me?: { lat: number; lng: number } | null
  className?: string
}

/** Leaflet only runs in the browser, and is only downloaded where a map is shown. */
export const OsmMap = dynamic<OsmMapProps>(() => import("./osm-map-impl"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-xl" />,
})
