import { X } from 'lucide-react'

import { colorFor } from '../model/adapter'
import { useOntology } from '../../ontology/OntologyContext'

export function ConnectionTemplateMenu({
  x,
  y,
  onSelect,
  onClose,
}: {
  x: number
  y: number
  onSelect: (templateId: string) => void
  onClose: () => void
}) {
  const ontology = useOntology()
  return (
    <>
      <div className="canvas-popover-backdrop" onMouseDown={onClose} />
      <div
        className="connection-menu"
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span>Connect to</span>
          <button className="icon-button" onClick={onClose} aria-label="Close template menu">
            <X size={13} />
          </button>
        </header>
        <button className="connection-option" onClick={() => onSelect('text')}>
          <span className="template-dot" />
          Text card
        </button>
        {ontology.entityTypes.map((entityType) => (
          <button
            className="connection-option"
            key={entityType.id}
            onClick={() => onSelect(entityType.id)}
          >
            <span
              className="template-dot"
              style={{ background: colorFor(entityType.color) ?? 'var(--sky-cyan)' }}
            />
            {entityType.label}
          </button>
        ))}
      </div>
    </>
  )
}
