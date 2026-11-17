import { useState } from 'react'

import type { EdgeOrigin } from '@canvas/contract'

function originLabel(origin: EdgeOrigin | undefined): string {
  if (origin === 'managed') return 'Managed'
  if (origin === 'inferred') return 'Inferred'
  return 'Explicit'
}

export function EdgeLabelEditor({
  x,
  y,
  initialValue,
  origin,
  originCardName,
  onOpenOriginCard,
  onSave,
  onCancel,
}: {
  x: number
  y: number
  initialValue: string
  origin?: EdgeOrigin
  originCardName?: string
  onOpenOriginCard?: () => void
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <>
      <div className="canvas-popover-backdrop" onMouseDown={onCancel} />
      <div
        className="edge-label-editor"
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label>
          Edge label
          <input
            autoFocus
            value={value}
            placeholder="Describe the relationship"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSave(value)
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
          />
        </label>
        <div className="edge-origin" aria-label="Edge origin">
          <span className="edge-origin-label">Origin</span>
          <span className="edge-origin-value">{originLabel(origin)}</span>
          {origin === 'managed' && originCardName && (
            <span className="edge-origin-card">
              Edited through <strong>{originCardName}</strong>
              {onOpenOriginCard && (
                <button type="button" className="validation-link-button" onClick={onOpenOriginCard}>
                  Open card
                </button>
              )}
            </span>
          )}
        </div>
        <div className="edge-label-actions">
          <button className="button ghost" onClick={onCancel}>Cancel</button>
          <button className="button primary" onClick={() => onSave(value)}>Save</button>
        </div>
      </div>
    </>
  )
}
