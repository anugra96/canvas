import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

import type { CanvasFlowNode } from '../../model/adapter'

interface UseCanvasCaptureInput {
  nodes: CanvasFlowNode[]
  title: string
  flowRef: React.RefObject<HTMLDivElement | null>
  clientToFlow: (clientX: number, clientY: number) => { x: number; y: number }
  clearSelection: () => void
  prepareAreaSelection: () => void
  setNotice: (message: string) => void
  setError: (message: string) => void
}

export function useCanvasCapture({
  nodes,
  title,
  flowRef,
  clientToFlow,
  clearSelection,
  prepareAreaSelection,
  setNotice,
  setError,
}: UseCanvasCaptureInput) {
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const [screenshotScale, setScreenshotScale] = useState(3)
  const [screenshotError, setScreenshotError] = useState('')
  const [areaMode, setAreaMode] = useState(false)
  const [dragBox, setDragBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const areaStart = useRef<{ clientX: number; clientY: number } | null>(null)
  const areaCurrent = useRef<{ clientX: number; clientY: number } | null>(null)

  const openScreenshot = useCallback(() => {
    setScreenshotError('')
    setScreenshotOpen(true)
  }, [])

  const screenshotDimensions = useCallback((bounds: { width: number; height: number }) => {
    const longEdge = 1600
    const ratio = bounds.width / Math.max(bounds.height, 1)
    if (ratio >= 1) {
      return { width: longEdge, height: Math.max(240, Math.round(longEdge / ratio)) }
    }
    return { width: Math.max(240, Math.round(longEdge * ratio)), height: longEdge }
  }, [])

  const captureBounds = useCallback(async (
    bounds: { x: number; y: number; width: number; height: number },
    suffix: string,
    padding: number,
  ) => {
    const viewport = flowRef.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewport) throw new Error('Canvas viewport is not available.')
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('The selected area is too small.')
    const { width, height } = screenshotDimensions(bounds)
    const transform = getViewportForBounds(bounds, width, height, 0.01, 4, padding)
    const background = flowRef.current
      ? getComputedStyle(flowRef.current).backgroundColor
      : '#ffffff'

    clearSelection()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    const dataUrl = await toPng(viewport, {
      width,
      height,
      pixelRatio: screenshotScale,
      backgroundColor: background,
      cacheBust: true,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
        transformOrigin: '0 0',
      },
    })

    const safeTitle = title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'canvas'
    const link = window.document.createElement('a')
    link.download = `${safeTitle}-${suffix}.png`
    link.href = dataUrl
    link.click()
  }, [clearSelection, flowRef, screenshotDimensions, screenshotScale, title])

  const captureFull = useCallback(async () => {
    if (nodes.length === 0) {
      setScreenshotError('Add a card before capturing the canvas.')
      return
    }
    setScreenshotBusy(true)
    setScreenshotError('')
    try {
      await captureBounds(getNodesBounds(nodes), 'full', 0.05)
      setScreenshotOpen(false)
      setNotice('Screenshot downloaded.')
    } catch (cause) {
      setScreenshotError(cause instanceof Error ? cause.message : 'Could not create the screenshot.')
    } finally {
      setScreenshotBusy(false)
    }
  }, [captureBounds, nodes, setNotice])

  const beginAreaSelection = useCallback(() => {
    setScreenshotOpen(false)
    setScreenshotError('')
    setAreaMode(true)
    setDragBox(null)
    prepareAreaSelection()
  }, [prepareAreaSelection])

  const closeScreenshot = useCallback(() => {
    setScreenshotOpen(false)
  }, [])

  const cancelAreaSelection = useCallback(() => {
    setAreaMode(false)
    setDragBox(null)
    areaStart.current = null
    areaCurrent.current = null
  }, [])

  useEffect(() => {
    if (!areaMode) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelAreaSelection()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [areaMode, cancelAreaSelection])

  const onAreaPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    areaStart.current = { clientX: event.clientX, clientY: event.clientY }
    areaCurrent.current = { clientX: event.clientX, clientY: event.clientY }
    setDragBox({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: 0,
      height: 0,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onAreaPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!areaStart.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const start = areaStart.current
    areaCurrent.current = { clientX: event.clientX, clientY: event.clientY }
    setDragBox({
      x: Math.min(start.clientX, event.clientX) - rect.left,
      y: Math.min(start.clientY, event.clientY) - rect.top,
      width: Math.abs(event.clientX - start.clientX),
      height: Math.abs(event.clientY - start.clientY),
    })
  }, [])

  const onAreaPointerUp = useCallback(async (event: PointerEvent<HTMLDivElement>) => {
    const start = areaStart.current
    if (!start) return
    const end = { clientX: event.clientX, clientY: event.clientY }
    areaStart.current = null
    areaCurrent.current = null
    setDragBox(null)
    const startFlow = clientToFlow(start.clientX, start.clientY)
    const endFlow = clientToFlow(end.clientX, end.clientY)
    const bounds = {
      x: Math.min(startFlow.x, endFlow.x),
      y: Math.min(startFlow.y, endFlow.y),
      width: Math.abs(endFlow.x - startFlow.x),
      height: Math.abs(endFlow.y - startFlow.y),
    }
    if (bounds.width < 12 || bounds.height < 12) return
    setAreaMode(false)
    setScreenshotBusy(true)
    setNotice('Rendering screenshot...')
    try {
      await captureBounds(bounds, 'selection', 0.02)
      setNotice('Screenshot downloaded.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the screenshot.')
    } finally {
      setScreenshotBusy(false)
    }
  }, [captureBounds, clientToFlow, setError, setNotice])

  return {
    screenshotOpen,
    screenshotBusy,
    screenshotScale,
    setScreenshotScale,
    screenshotError,
    areaMode,
    dragBox,
    openScreenshot,
    closeScreenshot,
    captureFull,
    beginAreaSelection,
    cancelAreaSelection,
    onAreaPointerDown,
    onAreaPointerMove,
    onAreaPointerUp,
  }
}

export type CanvasCaptureState = ReturnType<typeof useCanvasCapture>
