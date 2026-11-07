import { X } from 'lucide-react'

import {
  findEntityType,
  profileEntityTypeIds,
  type CanvasProfile,
} from '@canvas/contract'

import { colorFor } from '../model/adapter'
import { useOntology } from '../../ontology/OntologyContext'

export function ConnectionTemplateMenu({
  x,
  y,
  profile,
  mode = 'connection',
  onSelect,
  onClose,
}: {
  x: number
  y: number
  profile: CanvasProfile
  mode?: 'connection' | 'card'
  onSelect: (templateId: string) => void
  onClose: () => void
}) {
  const ontology = useOntology()
  const systems = profile.id === 'systems'
  const availableEntityTypes = systems
    ? profileEntityTypeIds(profile)
      .map((id) => findEntityType(ontology, id))
      .filter((entityType): entityType is NonNullable<typeof entityType> => Boolean(entityType))
    : ontology.entityTypes
  return (
    <>
      <div className="canvas-popover-backdrop" onMouseDown={onClose} />
      <div
        className="connection-menu"
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span>{mode === 'card' ? 'Create card' : 'Connect to'}</span>
          <button className="icon-button" onClick={onClose} aria-label="Close template menu">
            <X size={13} />
          </button>
        </header>
        {!systems && (
          <button className="connection-option" onClick={() => onSelect('text')}>
            <span className="template-dot" />
            Text card
          </button>
        )}
        {mode === 'connection' && systems && availableEntityTypes.length === 0 && (
          <p className="connection-empty">No compatible card types.</p>
        )}
        {availableEntityTypes.map((entityType) => (
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
