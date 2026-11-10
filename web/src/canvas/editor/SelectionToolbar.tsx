import { ArrowLeftRight, Copy, Group as GroupIcon, Link2, Scaling, Trash2, X } from 'lucide-react'

import { useOntology } from '../../ontology/OntologyContext'
import { CANVAS_COLOR_PRESETS } from '../model/adapter'

export function SelectionToolbar({
  selectedNodes,
  selectedEdges,
  canGroup,
  canManageMembership,
  cardTypeValue,
  allowText = true,
  entityTypeIds,
  membershipLabel,
  canConnect = false,
  connectMode = false,
  onConnect,
  canResize = false,
  onResize,
  onCardTypeChange,
  onGroup,
  onReverse,
  relationValue,
  relationTypes = [],
  allowUnspecified = false,
  onRelationChange,
  onToggleMembership,
  onDuplicate,
  onDelete,
  onClear,
  onColor,
}: {
  selectedNodes: number
  selectedEdges: number
  canGroup: boolean
  canManageMembership: boolean
  cardTypeValue?: string
  allowText?: boolean
  entityTypeIds?: string[]
  membershipLabel: string
  canConnect?: boolean
  connectMode?: boolean
  onConnect?: () => void
  canResize?: boolean
  onResize?: () => void
  onCardTypeChange?: (typeId: string) => void
  onGroup: () => void
  onReverse: () => void
  relationValue?: string
  relationTypes?: Array<{ id: string; label: string }>
  allowUnspecified?: boolean
  onRelationChange?: (value: string) => void
  onToggleMembership: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClear: () => void
  onColor: (color: string | undefined) => void
}) {
  const ontology = useOntology()
  const total = selectedNodes + selectedEdges
  if (total === 0) return null
  const availableEntityTypes = entityTypeIds
    ? ontology.entityTypes.filter((entityType) => entityTypeIds.includes(entityType.id))
    : ontology.entityTypes
  const hasCurrentType = cardTypeValue === 'text'
    || availableEntityTypes.some((entityType) => entityType.id === cardTypeValue)

  return (
    <div className="selection-toolbar" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button selection-clear" onClick={onClear} aria-label="Clear selection" title="Clear selection">
        <X size={14} />
      </button>
      <span className="selection-count">{total} selected</span>
      {canConnect && onConnect && (
        <button
          className={`button${connectMode ? ' primary' : ''}`}
          onClick={onConnect}
          aria-pressed={connectMode}
        >
          <Link2 size={14} />
          {connectMode ? 'Tap a card' : 'Connect'}
        </button>
      )}
      {cardTypeValue !== undefined && onCardTypeChange && (
        <label className="toolbar-field selection-type">
          <span>Card type</span>
          <select
            className="template-select"
            value={cardTypeValue}
            onChange={(event) => onCardTypeChange(event.target.value)}
          >
            {(allowText || cardTypeValue === 'text') && <option value="text">Text</option>}
            {!hasCurrentType && cardTypeValue !== 'text' && (
              <option value={cardTypeValue}>{cardTypeValue}</option>
            )}
            {availableEntityTypes.map((entityType) => (
              <option key={entityType.id} value={entityType.id}>{entityType.label}</option>
            ))}
          </select>
        </label>
      )}
      {canResize && onResize && (
        <button className="button" onClick={onResize}>
          <Scaling size={14} />
          Size
        </button>
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
      {selectedEdges > 0 && onRelationChange && (
        <label className="toolbar-field selection-relation">
          <span>Relation</span>
          <select
            className="template-select"
            aria-label="Edge relation"
            value={relationValue ?? ''}
            onChange={(event) => onRelationChange(event.target.value)}
          >
            {relationValue === 'mixed' && <option value="mixed" disabled>Mixed</option>}
            {allowUnspecified && <option value="">Unspecified</option>}
            {relationTypes.map((relationType) => (
              <option key={relationType.id} value={relationType.id}>{relationType.label}</option>
            ))}
          </select>
        </label>
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
