import { useEffect } from 'react'

import type { LayoutPreview } from './graph/useCanvasLayout'

export function LayoutPreviewGhosts({ preview }: { preview: LayoutPreview }) {
  return (
    <>
      <svg className="layout-preview-links" width="1" height="1" aria-hidden="true">
        {preview.links.map((link) => (
          <line
            key={link.id}
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
          />
        ))}
      </svg>
      {preview.groups.map((group) => (
        <div
          key={group.id}
          className="layout-preview-group"
          style={{
            left: group.x,
            top: group.y,
            width: group.width,
            height: group.height,
          }}
        />
      ))}
      {preview.cards.map((card) => (
        <div
          key={card.id}
          className="layout-preview-card"
          style={{
            left: card.x,
            top: card.y,
            width: card.width,
            height: card.height,
          }}
        />
      ))}
    </>
  )
}

export function LayoutPreviewBar({
  preview,
  onApply,
  onCancel,
}: {
  preview: LayoutPreview
  onApply: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  const count = preview.moves.length
  return (
    <div className="layout-preview-bar" role="region" aria-label="Layout preview">
      <span>{count} {count === 1 ? 'card moves' : 'cards move'}</span>
      <button type="button" className="button primary" onClick={onApply}>Apply</button>
      <button type="button" className="button" onClick={onCancel}>Cancel</button>
    </div>
  )
}
