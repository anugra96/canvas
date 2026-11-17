import type { CanvasDocument } from '@canvas/contract'

import type { CanvasClient } from '../../api/client'

import { createContext, useContext } from 'react'

export interface CanvasSchemaResult {
  ok: boolean
  schemaId?: string
  error?: string
}

export interface CanvasEditorActions {
  updateText: (id: string, text: string) => void
  updateLabel: (id: string, label: string) => void
  updateEntityField: (id: string, fieldKey: string, value: string) => void
  resizeNode: (id: string, width: number, height: number) => void
  autoFitNode: (id: string) => void
  editEdgeLabel: (id: string, clientX: number, clientY: number) => void
  selectEdge: (id: string) => void
  openCanvasLinks: (id: string) => void
  createOrOpenApiCanvas: (id: string, title: string) => void
  openNodeEditor: (id: string) => void
  extractSchemaCard: (id: string) => CanvasSchemaResult
  inlineSchemaCard: (id: string) => CanvasSchemaResult
}

export const CanvasEditorActionsContext = createContext<CanvasEditorActions | null>(null)

export function useCanvasEditorActions(): CanvasEditorActions {
  const actions = useContext(CanvasEditorActionsContext)
  if (!actions) throw new Error('Canvas editor actions are not available.')
  return actions
}

export interface NodeEditRequest {
  id: string
  token: number
}

export const NodeEditRequestContext = createContext<NodeEditRequest | null>(null)

export function useNodeEditRequest(id: string): number {
  const request = useContext(NodeEditRequestContext)
  return request?.id === id ? request.token : 0
}

export interface CanvasEditorProps {
  client: CanvasClient
  document: CanvasDocument
  onBack: () => void
  trail: Array<{ id: string; label: string }>
  onOpenTrail: (index: number) => void
  onOpenLinkedCanvas: (canvasId: string, label: string) => void
}
