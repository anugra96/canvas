import { X } from 'lucide-react'

const RESPONSE_CHOICES = ['200', '201', '204', '400', '422']

export function ManagedEdgeChooser({
  sourceLabel,
  modelName,
  onChoose,
  onClose,
}: {
  sourceLabel: string
  modelName: string
  onChoose: (choice: { kind: 'request' } | { kind: 'response'; status: string }) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="canvas-popover-backdrop" onMouseDown={onClose} />
      <div className="managed-edge-chooser" role="dialog" aria-label="Managed relation">
        <header>
          <div>
            <span>Connect {sourceLabel}</span>
            <strong>{modelName}</strong>
          </div>
          <button className="icon-button" aria-label="Close managed relation chooser" onClick={onClose}>
            <X size={13} />
          </button>
        </header>
        <button onClick={() => onChoose({ kind: 'request' })}>Request body</button>
        {RESPONSE_CHOICES.map((status) => (
          <button key={status} onClick={() => onChoose({ kind: 'response', status })}>
            Response {status}
          </button>
        ))}
      </div>
    </>
  )
}
