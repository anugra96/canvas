import { Scaling, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const WIDTH_MIN = 160
const HEIGHT_MIN = 80
const SIZE_MAX = 4000

const PRESETS = [
  { label: 'Small', width: 260, height: 160 },
  { label: 'Default', width: 360, height: 200 },
  { label: 'Wide', width: 520, height: 240 },
  { label: 'Tall', width: 360, height: 420 },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function NodeSizeDialog({
  label,
  width,
  height,
  onApply,
  onClose,
}: {
  label: string
  width: number
  height: number
  onApply: (width: number, height: number) => void
  onClose: () => void
}) {
  const [nextWidth, setNextWidth] = useState(() => clamp(width, WIDTH_MIN, SIZE_MAX))
  const [nextHeight, setNextHeight] = useState(() => clamp(height, HEIGHT_MIN, SIZE_MAX))

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className="size-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="size-dialog" role="dialog" aria-modal="true" aria-label={`Resize ${label}`}>
        <header className="size-head">
          <div>
            <span className="size-kicker"><Scaling size={13} /> Layout</span>
            <h2>Resize {label}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close size dialog">
            <X size={16} />
          </button>
        </header>

        <div className="size-fields">
          <label>
            Width
            <input
              type="number"
              inputMode="numeric"
              min={WIDTH_MIN}
              max={SIZE_MAX}
              value={nextWidth}
              onChange={(event) => setNextWidth(Number(event.target.value))}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              inputMode="numeric"
              min={HEIGHT_MIN}
              max={SIZE_MAX}
              value={nextHeight}
              onChange={(event) => setNextHeight(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="size-presets" aria-label="Size presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="button"
              onClick={() => {
                setNextWidth(preset.width)
                setNextHeight(preset.height)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="size-actions">
          <button className="button" onClick={onClose}>Cancel</button>
          <button
            className="button primary"
            onClick={() => onApply(
              clamp(nextWidth, WIDTH_MIN, SIZE_MAX),
              clamp(nextHeight, HEIGHT_MIN, SIZE_MAX),
            )}
          >
            Apply size
          </button>
        </div>
      </section>
    </div>
  )
}
