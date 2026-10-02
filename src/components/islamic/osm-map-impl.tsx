"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { useEffect, useRef } from "react"

import type { MapMarker, OsmMapProps } from "./osm-map"

const EMOJI: Record<MapMarker["tone"], string> = { MOSQUE: "🕌", SURAU: "🛐", HALAL: "🍽️", PENDING: "⏳", PIN: "📍" }

function icon(m: MapMarker, selected: boolean): L.DivIcon {
  const size = m.tone === "PIN" ? 34 : selected ? 38 : 30
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, m.tone === "PIN" ? size : size / 2],
    // Static markup only: names are never put into HTML.
    html: `<span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:9999px;font-size:${Math.round(size * 0.55)}px;background:${m.tone === "PIN" ? "transparent" : "white"};box-shadow:${m.tone === "PIN" ? "none" : "0 1px 4px rgba(0,0,0,.35)"};${selected ? "outline:3px solid #10b981;" : ""}${m.tone === "PENDING" ? "opacity:.75;" : ""}">${EMOJI[m.tone]}</span>`,
  })
}

/** OpenStreetMap via Leaflet: place markers, an optional "you are here" dot, and tap-to-pick for the suggestion form. */
export default function OsmMapImpl({ center, zoom = 13, markers = [], selectedId, onSelect, onPick, me, className }: OsmMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const meLayer = useRef<L.CircleMarker | null>(null)
  const handlers = useRef({ onSelect, onPick })
  handlers.current = { onSelect, onPick }

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(m)
    // Plain credit line (no flag icon).
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')
    m.on("click", (e: L.LeafletMouseEvent) => handlers.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    // Opened inside a sheet / after a layout change: measure again once visible.
    const t = window.setTimeout(() => m.invalidateSize(), 300)
    return () => {
      window.clearTimeout(t)
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; center/zoom changes are applied below
  }, [])

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom() < zoom ? zoom : map.current.getZoom())
  }, [center.lat, center.lng, zoom])

  useEffect(() => {
    const group = layer.current
    if (!group) return
    group.clearLayers()
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: icon(m, m.id === selectedId), title: m.title, keyboard: true, draggable: m.tone === "PIN" && Boolean(onPick) })
      marker.on("click", () => handlers.current.onSelect?.(m.id))
      if (m.tone === "PIN") marker.on("dragend", () => handlers.current.onPick?.(marker.getLatLng()))
      marker.addTo(group)
    }
  }, [markers, selectedId, onPick])

  useEffect(() => {
    const m = map.current
    if (!m) return
    meLayer.current?.remove()
    meLayer.current = me ? L.circleMarker([me.lat, me.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }).addTo(m) : null
  }, [me])

  return <div ref={el} className={className} role="application" aria-label="OpenStreetMap" />
}
