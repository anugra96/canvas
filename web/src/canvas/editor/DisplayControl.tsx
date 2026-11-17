import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { EdgeClass } from '@canvas/contract'

import {
  DISPLAY_CLASSES,
  type CanvasDisplayState,
  type DisplayCardType,
  type DisplayPreset,
} from '../display/display'

const CLASS_LABELS: Record<EdgeClass, string> = {
  flow: 'Flow',
  contract: 'Contract',
  structure: 'Structure',
  access: 'Access',
  annotation: 'Annotation',
  unspecified: 'Unspecified',
}

const PRESET_LABELS: Record<DisplayPreset, string> = {
  minimal: 'Minimal',
  standard: 'Standard',
  all: 'All',
  custom: 'Custom',
}

export interface DisplayControlProps {
  state: CanvasDisplayState
  cardTypes: DisplayCardType[]
  hiddenCards: number
  hiddenEdges: number
  revealedCardLabels: string[]
  onChangePreset: (preset: Exclude<DisplayPreset, 'custom'>) => void
  onToggleClass: (edgeClass: EdgeClass) => void
  onToggleCardType: (typeId: string) => void
  onReset: () => void
}

export function DisplayControl({
  state,
  cardTypes,
  hiddenCards,
  hiddenEdges,
  revealedCardLabels,
  onChangePreset,
  onToggleClass,
  onToggleCardType,
  onReset,
}: DisplayControlProps) {
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function close() {
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
      triggerRef.current?.focus()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (controlRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const hiddenLabel = `${hiddenCards} ${hiddenCards === 1 ? 'card' : 'cards'}, ${hiddenEdges} ${hiddenEdges === 1 ? 'edge' : 'edges'} hidden`

  return (
    <div className="display-control" ref={controlRef}>
      <button
        ref={triggerRef}
        type="button"
        className="bar-button display-trigger"
        aria-label="Display"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} />
        <span>Display</span>
        <ChevronDown size={12} />
      </button>
      {(hiddenCards > 0 || hiddenEdges > 0) && (
        <button
          type="button"
          className="display-chip"
          onClick={() => setOpen(true)}
          aria-label={`${hiddenLabel}. Open Display`}
        >
          {hiddenLabel}
        </button>
      )}
      {open && (
        <section className="display-popover" role="dialog" aria-label="Display">
          <header className="display-popover-head">
            <div>
              <span className="display-kicker">Canvas</span>
              <h2>Display</h2>
            </div>
            <button type="button" className="button ghost display-reset" onClick={onReset}>
              Reset
            </button>
          </header>

          <div className="display-presets" role="group" aria-label="Display preset">
            {(['minimal', 'standard', 'all', 'custom'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className={`display-preset${state.preset === preset ? ' active' : ''}`}
                aria-pressed={state.preset === preset}
                disabled={preset === 'custom'}
                onClick={() => {
                  if (preset !== 'custom') onChangePreset(preset)
                }}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>

          {revealedCardLabels.length > 0 && (
            <p className="display-reveal">
              Showing {revealedCardLabels.map((label) => `"${label}"`).join(', ')} from Review
            </p>
          )}

          <fieldset className="display-group">
            <legend>Classes</legend>
            {DISPLAY_CLASSES.map((edgeClass) => (
              <label key={edgeClass} className="display-check">
                <input
                  type="checkbox"
                  checked={state.classes.includes(edgeClass)}
                  onChange={() => onToggleClass(edgeClass)}
                />
                <span>{CLASS_LABELS[edgeClass]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="display-group">
            <legend>Cards</legend>
            {cardTypes.map((cardType) => (
              <label key={cardType.id} className="display-check">
                <input
                  type="checkbox"
                  checked={!state.hiddenCardTypes.includes(cardType.id)}
                  onChange={() => onToggleCardType(cardType.id)}
                />
                <span>{cardType.label}</span>
                <span className="display-count">{cardType.count}</span>
              </label>
            ))}
          </fieldset>
        </section>
      )}
    </div>
  )
}
