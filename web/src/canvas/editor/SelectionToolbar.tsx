import { ArrowLeftRight, Building2, Copy, Group as GroupIcon, Link2, Scaling, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { canvasEndpoints, type CanvasLink, type EdgeOrigin } from '@canvas/contract'

import type { CanvasClient } from '../../api/client'
import { useOntology } from '../../ontology/OntologyContext'
import { CANVAS_COLOR_PRESETS } from '../model/adapter'

interface EndpointTarget {
  nodeId: string
  links: CanvasLink[]
}

function EndpointPicker({
  client,
  target,
  value,
  onChange,
}: {
  client: CanvasClient
  target: EndpointTarget
  value: string
  onChange: (endpoint: string | undefined) => void
}) {
  const [state, setState] = useState<
    { nodeId: string; status: 'loading' } | { nodeId: string; status: 'missing' } | { nodeId: string; status: 'ready'; options: string[] }
  >({ nodeId: target.nodeId, status: 'loading' })
  const current = state.nodeId === target.nodeId ? state : { status: 'loading' as const }

  useEffect(() => {
    let active = true
    const nodeId = target.nodeId
    async function load() {
      try {
        const canvases = await client.listCanvases()
        const link = target.links.find((candidate) => (
          canvases.some((canvas) => canvas.id === candidate.canvasId && canvas.profile === 'api')
        ))
        if (!link) {
          if (active) setState({ nodeId, status: 'missing' })
          return
        }
        const document = await client.getCanvas(link.canvasId)
        if (active) setState({ nodeId, status: 'ready', options: canvasEndpoints(document.canvas) })
      } catch {
        if (active) setState({ nodeId, status: 'missing' })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [client, target])

  if (current.status === 'loading') return null
  if (current.status === 'missing') return null
  const options = current.options
  const missing = Boolean(value) && !options.includes(value)
  return (
    <label className="toolbar-field selection-endpoint">
      <span>Endpoint</span>
      <select
        className="template-select"
        aria-label="Endpoint"
        value={value}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">No endpoint</option>
        {missing && <option value={value}>{`${value} (missing)`}</option>}
        {options.map((endpoint) => (
          <option key={endpoint} value={endpoint}>{endpoint}</option>
        ))}
      </select>
    </label>
  )
}

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
  coarsePointer = false,
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
  canEditDistrict = false,
  districtIsDistrict = false,
  districtOwnerId,
  districtOwners = [],
  onToggleDistrict,
  onDistrictOwnerChange,
  onDuplicate,
  onDelete,
  onClear,
  onColor,
  client,
  endpointTarget,
  endpointValue = '',
  onEndpointChange,
  edgeOrigin,
  edgeOriginCardName,
  onOpenOriginCard,
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
  coarsePointer?: boolean
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
  canEditDistrict?: boolean
  districtIsDistrict?: boolean
  districtOwnerId?: string
  districtOwners?: Array<{ id: string; name: string }>
  onToggleDistrict?: () => void
  onDistrictOwnerChange?: (ownerId: string | undefined) => void
  onDuplicate: () => void
  onDelete: () => void
  onClear: () => void
  onColor: (color: string | undefined) => void
  client?: CanvasClient
  endpointTarget?: EndpointTarget
  endpointValue?: string
  onEndpointChange?: (endpoint: string | undefined) => void
  edgeOrigin?: EdgeOrigin
  edgeOriginCardName?: string
  onOpenOriginCard?: () => void
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
          {connectMode ? (coarsePointer ? 'Tap a card' : 'Click a card') : 'Connect'}
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
      {selectedEdges === 1 && client && endpointTarget && onEndpointChange && (
        <EndpointPicker
          client={client}
          target={endpointTarget}
          value={endpointValue}
          onChange={onEndpointChange}
        />
      )}
      {selectedEdges === 1 && edgeOrigin && (
        <span className="selection-origin">
          <span>{edgeOrigin === 'managed' ? 'Managed' : edgeOrigin === 'inferred' ? 'Inferred' : 'Explicit'} edge</span>
          {edgeOrigin === 'managed' && edgeOriginCardName && (
            <span>
              Edited through <strong>{edgeOriginCardName}</strong>
              {onOpenOriginCard && (
                <button type="button" className="validation-link-button" onClick={onOpenOriginCard}>
                  Open card
                </button>
              )}
            </span>
          )}
        </span>
      )}
      {canManageMembership && (
        <button className="button" onClick={onToggleMembership}>
          <GroupIcon size={14} />
          {membershipLabel}
        </button>
      )}
      {canEditDistrict && onToggleDistrict && (
        <button
          className={`button${districtIsDistrict ? ' primary' : ''}`}
          onClick={onToggleDistrict}
          aria-pressed={districtIsDistrict}
        >
          <Building2 size={14} />
          District
        </button>
      )}
      {districtIsDistrict && onDistrictOwnerChange && (
        <label className="toolbar-field selection-district-owner">
          <span>District owner</span>
          <select
            className="template-select"
            aria-label="District owner"
            value={districtOwnerId ?? ''}
            onChange={(event) => onDistrictOwnerChange(event.target.value || undefined)}
          >
            <option value="">No owner</option>
            {districtOwners.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.name}</option>
            ))}
          </select>
        </label>
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
