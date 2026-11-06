import type { CanvasDocument } from '@skyward/canvas-contract'

export class CanvasConflictError extends Error {
  readonly latest: CanvasDocument

  constructor(latest: CanvasDocument) {
    super('The canvas changed on another client.')
    this.name = 'CanvasConflictError'
    this.latest = latest
  }
}
