import { useEffect, useRef, useState } from 'react'
import { Image } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'

import { useTheme } from '../../themes'
import { SCENES, mulberry, type BackdropSceneId } from './scenes'

const PREF_KEY = 'canvas-backdrop'
const PIXEL = 4
const OVERSCAN = 48

function sceneForTheme(theme: string): BackdropSceneId | null {
  switch (theme) {
    case 'dune':
      return 'dune-night'
    case 'dune-light':
      return 'dune-day'
    case 'tide':
      return 'tide'
    case 'ember':
      return 'ember'
    case 'gargantua':
      return 'void'
    default:
      return null
  }
}

function readPref(): boolean {
  try {
    if (localStorage.getItem(PREF_KEY) === 'off') return false
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return true
}

export function CanvasBackdrop() {
  const theme = useTheme()
  const { getViewport } = useReactFlow()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [enabled, setEnabled] = useState(readPref)
  const available = sceneForTheme(theme) !== null
  const sceneId = enabled ? sceneForTheme(theme) : null

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
    } catch {
      // Storage unavailable; the in-memory preference still applies.
    }
  }, [enabled])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneId) return
    const container = canvas.parentElement
    if (!container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scene = SCENES[sceneId]
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let staticLayer: HTMLCanvasElement | null = null
    let state: unknown = null

    const rebuild = (): boolean => {
      const rect = container.getBoundingClientRect()
      const nextW = Math.max(48, Math.floor(rect.width / PIXEL))
      const nextH = Math.max(32, Math.floor(rect.height / PIXEL))
      if (nextW === w && nextH === h && staticLayer) return true
      w = nextW
      h = nextH
      canvas.width = w
      canvas.height = h
      const rng = mulberry(1337)
      const layer = document.createElement('canvas')
      layer.width = w
      layer.height = h
      const layerCtx = layer.getContext('2d')
      if (!layerCtx) return false
      scene.paintStatic(layerCtx, w, h, rng)
      staticLayer = layer
      state = scene.init(w, h, rng)
      return true
    }

    let raf = 0
    const t0 = performance.now()
    const frame = (now: number): void => {
      if (!document.hidden && rebuild() && staticLayer) {
        const t = reduced ? 0 : (now - t0) / 1000
        const vp = getViewport()
        const px = Math.max(-OVERSCAN, Math.min(OVERSCAN, vp.x * 0.03))
        const py = Math.max(-OVERSCAN, Math.min(OVERSCAN, vp.y * 0.03))
        canvas.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`
        ctx.drawImage(staticLayer, 0, 0)
        scene.paintDynamic(ctx, w, h, t, { x: vp.x, y: vp.y }, state)
        if (reduced) return
      }
      if (!reduced) {
        raf = requestAnimationFrame(frame)
      }
    }

    const observer = new ResizeObserver(() => {
      staticLayer = null
    })
    observer.observe(container)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [sceneId, getViewport])

  return (
    <>
      {sceneId && (
        <canvas ref={canvasRef} className="canvas-backdrop" data-scene={sceneId} aria-hidden="true" />
      )}
      {available && (
        <button
          type="button"
          className="button ghost canvas-backdrop-toggle"
          aria-label="Toggle animated backdrop"
          aria-pressed={enabled}
          title="Toggle animated backdrop"
          onClick={() => setEnabled((value) => !value)}
        >
          <Image size={14} />
        </button>
      )}
    </>
  )
}
