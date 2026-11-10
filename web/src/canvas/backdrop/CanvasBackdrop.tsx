import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'

import { useBackdropEnabled } from '../../atmosphere/backdropPreference'
import { sceneForTheme } from '../../atmosphere/registry'
import { useTheme } from '../../themes'
import { loadScene, mulberry } from '../../atmosphere/scenes'

const PIXEL = 3
const OVERSCAN = 48

export function CanvasBackdrop() {
  const theme = useTheme()
  const { getViewport } = useReactFlow()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const enabled = useBackdropEnabled()
  const sceneId = enabled ? sceneForTheme(theme) : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneId) return
    const container = canvas.parentElement
    if (!container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let staticLayer: HTMLCanvasElement | null = null
    let state: unknown = null

    const rebuild = (scene: Awaited<ReturnType<typeof loadScene>>): boolean => {
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
    let stopped = false
    let cleanup: (() => void) | undefined
    void loadScene(sceneId).then((scene) => {
      if (stopped) return
      const t0 = performance.now()
      const frame = (now: number): void => {
        if (!document.hidden && rebuild(scene) && staticLayer) {
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
      cleanup = () => {
        cancelAnimationFrame(raf)
        observer.disconnect()
      }
    })
    return () => {
      stopped = true
      cleanup?.()
    }
  }, [sceneId, getViewport])

  return (
    <>
      {sceneId && (
        <div className="canvas-backdrop" data-scene={sceneId} aria-hidden="true">
          <canvas ref={canvasRef} />
        </div>
      )}
    </>
  )
}
