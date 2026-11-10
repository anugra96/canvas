import type { CanvasNodeSide } from '@canvas/contract'

export interface PendingConnection {
  fromNodeId: string
  fromSide: CanvasNodeSide
  position: { x: number; y: number }
  screen: { x: number; y: number }
}

export interface EdgeLabelEditorState {
  edgeId: string
  label: string
  x: number
  y: number
}

export interface CardMenuState {
  screen: { x: number; y: number }
}
