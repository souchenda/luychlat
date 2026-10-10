"use client"

import { useRef, useState } from "react"

const MAX = 6

/**
 * A photo to read letter by letter: pinch (or wheel) to zoom up to 6×, drag to move when zoomed,
 * double-tap to zoom in / back out.
 */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  const lastTap = useRef(0)

  const clamp = (scale: number) => Math.min(MAX, Math.max(1, scale))
  const reset = () => setView({ scale: 1, x: 0, y: 0 })

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale }
    } else if (pointers.current.size === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) setView((v) => (v.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
      lastTap.current = now
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const scale = clamp((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist)
      setView((v) => (scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...v, scale }))
    } else if (pointers.current.size === 1) {
      setView((v) => (v.scale > 1 ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  return (
    <div
      className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(e) => {
        const scale = clamp(view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
        if (scale === 1) reset()
        else setView((v) => ({ ...v, scale }))
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: pointers.current.size ? "none" : "transform 120ms ease-out" }}
      />
    </div>
  )
}
