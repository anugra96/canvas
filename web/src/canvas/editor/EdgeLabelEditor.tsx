import { useState } from 'react'

export function EdgeLabelEditor({
  x,
  y,
  initialValue,
  onSave,
  onCancel,
}: {
  x: number
  y: number
  initialValue: string
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
        <div className="edge-label-actions">
          <button className="button ghost" onClick={onCancel}>Cancel</button>
          <button className="button primary" onClick={() => onSave(value)}>Save</button>
        </div>
      </div>
    </>
  )
}
