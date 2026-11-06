import { useCallback, useMemo, useRef, useState } from 'react'

import { deepEqual } from '@skyward/canvas-contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'

export interface CanvasSnapshot {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
}

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return structuredClone(snapshot)
}

function stableSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => {
      const copy = structuredClone(node)
      delete (copy as Partial<CanvasFlowNode>).selected
      delete (copy as Partial<CanvasFlowNode>).dragging
      delete (copy as Partial<CanvasFlowNode>).resizing
      delete (copy as Partial<CanvasFlowNode>).measured
      return copy
    }),
    edges: snapshot.edges.map((edge) => {
      const copy = structuredClone(edge)
      delete (copy as Partial<CanvasFlowEdge>).selected
      return copy
    }),
  }
}

export function useCanvasHistory(initial: CanvasSnapshot) {
  const past = useRef<CanvasSnapshot[]>([])
  const future = useRef<CanvasSnapshot[]>([])
  const last = useRef<CanvasSnapshot>(stableSnapshot(initial))
  const applying = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const observe = useCallback((snapshot: CanvasSnapshot) => {
    if (applying.current) {
      applying.current = false
      return
    }
    const timer = window.setTimeout(() => {
      const next = stableSnapshot(snapshot)
      if (deepEqual(next, last.current)) return
      past.current.push(last.current)
      if (past.current.length > 80) past.current.shift()
      future.current = []
      last.current = next
      setCanUndo(true)
      setCanRedo(false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [])

  const undo = useCallback((current: CanvasSnapshot) => {
    const stableCurrent = stableSnapshot(current)
    if (!deepEqual(stableCurrent, last.current)) {
      past.current.push(last.current)
      last.current = stableCurrent
      future.current = []
    }
    const previous = past.current.pop()
    if (!previous) {
      setCanUndo(past.current.length > 0)
      setCanRedo(future.current.length > 0)
      return null
    }
    future.current.push(cloneSnapshot(stableCurrent))
    last.current = cloneSnapshot(previous)
    applying.current = true
    setCanUndo(past.current.length > 0)
    setCanRedo(future.current.length > 0)
    return cloneSnapshot(previous)
  }, [])

  const redo = useCallback((current: CanvasSnapshot) => {
    const stableCurrent = stableSnapshot(current)
    if (!deepEqual(stableCurrent, last.current)) {
      past.current.push(last.current)
      last.current = stableCurrent
      future.current = []
      setCanUndo(past.current.length > 0)
      setCanRedo(false)
      return null
    }
    const next = future.current.pop()
    if (!next) return null
    past.current.push(cloneSnapshot(stableCurrent))
    last.current = cloneSnapshot(next)
    applying.current = true
    setCanUndo(past.current.length > 0)
    setCanRedo(future.current.length > 0)
    return cloneSnapshot(next)
  }, [])

  const reset = useCallback((snapshot: CanvasSnapshot) => {
    past.current = []
    future.current = []
    last.current = stableSnapshot(snapshot)
    applying.current = true
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  return useMemo(
    () => ({
      observe,
      undo,
      redo,
      reset,
      canUndo,
      canRedo,
    }),
    [canRedo, canUndo, observe, redo, reset, undo],
  )
}
