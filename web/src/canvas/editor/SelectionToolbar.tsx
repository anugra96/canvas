import { ArrowLeftRight, Copy, Group as GroupIcon, Trash2, X } from 'lucide-react'

import { useOntology } from '../../ontology/OntologyContext'
import { CANVAS_COLOR_PRESETS } from '../model/adapter'

export function SelectionToolbar({
  selectedNodes,
  selectedEdges,
  canGroup,
  canManageMembership,
  cardTypeValue,
  membershipLabel,
  onCardTypeChange,
  onGroup,
  onReverse,
  onToggleMembership,
  onDuplicate,
  onDelete,
  onColor,
}: {
  selectedNodes: number
  selectedEdges: number
  canGroup: boolean
  canManageMembership: boolean
  cardTypeValue?: string
  membershipLabel: string
  onCardTypeChange?: (typeId: string) => void
  onGroup: () => void
  onReverse: () => void
  onToggleMembership: () => void
  onDuplicate: () => void
  onDelete: () => void
  onColor: (color: string | undefined) => void
}) {
  const ontology = useOntology()
  const total = selectedNodes + selectedEdges
  if (total === 0) return null
  const hasCurrentType = cardTypeValue === 'text'
    || ontology.entityTypes.some((entityType) => entityType.id === cardTypeValue)

  return (
    <div className="selection-toolbar" onMouseDown={(event) => event.stopPropagation()}>
      <span className="selection-count">{total} selected</span>
      {cardTypeValue !== undefined && onCardTypeChange && (
        <label className="toolbar-field selection-type">
          <span>Card type</span>
          <select
            className="template-select"
            value={cardTypeValue}
            onChange={(event) => onCardTypeChange(event.target.value)}
          >
            <option value="text">Text</option>
            {!hasCurrentType && cardTypeValue !== 'text' && (
              <option value={cardTypeValue}>{cardTypeValue}</option>
            )}
            {ontology.entityTypes.map((entityType) => (
              <option key={entityType.id} value={entityType.id}>{entityType.label}</option>
            ))}
          </select>
        </label>
      )}
      <button className="button" onClick={onGroup} disabled={!canGroup}>
        <GroupIcon size={14} />
        Group
      </button>
      {selectedEdges > 0 && (
        <button className="button" onClick={onReverse}>
          <ArrowLeftRight size={14} />
          Reverse
        </button>
      )}
      {canManageMembership && (
        <button className="button" onClick={onToggleMembership}>
          <GroupIcon size={14} />
          {membershipLabel}
        </button>
      )}
      <div className="selection-colors" aria-label="Selection color">
        {CANVAS_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="color-swatch"
            style={{ background: preset.hex }}
            aria-label={`Color ${preset.id}`}
            title={`Color ${preset.id}`}
            onClick={() => onColor(preset.id)}
          />
        ))}
        <button className="color-swatch clear" aria-label="Remove color" onClick={() => onColor(undefined)}>
          <X size={10} />
        </button>
      </div>
      <button className="button" onClick={onDuplicate}>
        <Copy size={14} />
        Duplicate
      </button>
      <button className="button danger" onClick={onDelete}>
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}
