import { Download, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'

import {
  buildApiReference,
  computeLevelGraph,
  LEVEL_DEFINITIONS,
  LEVEL_NAMES,
  type LevelNumber,
  type Ontology,
} from '@canvas/contract'

import { nodeDimensions, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import { ApiReferenceView } from '../apiDesign/ApiReferenceView'
import { layoutDerivedView, type DerivedDiagram } from '../views/diagramLayout'
import {
  derivedExportFilename,
  exportDerivedPng,
  exportDerivedSvg,
} from './capture/derivedExport'
import {
  DERIVED_VIEWS,
  deriveSequence,
  deriveView,
  recommendedSequenceJobId,
  sequenceJobOptions,
  type DerivedSequence,
  type DerivedUnassignedItem,
  type DerivedViewId,
} from '../views/derivedViews'

type ActiveView = DerivedViewId | 'sequence' | 'reference'

interface DerivedViewsDialogProps {
  open: boolean
  title: string
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  ontology: Ontology
  profileId?: string
  initialLevel?: LevelNumber
  onShowInCanvas?: (id: string) => void
  guardExport?: (label: string, run: () => void) => void
  onClose: () => void
}

export function DerivedViewsDialog({
  open,
  title,
  nodes,
  edges,
  ontology,
  profileId = 'systems',
  initialLevel,
  onShowInCanvas,
  guardExport,
  onClose,
}: DerivedViewsDialogProps) {
  const isApi = profileId === 'api'
  const [activeView, setActiveView] = useState<ActiveView>(isApi ? 'reference' : 'architecture')
  const [jobId, setJobId] = useState('')
  const [level, setLevel] = useState<LevelNumber>(initialLevel ?? (isApi ? 4 : 1))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [arrange, setArrange] = useState<'seeded' | 'auto'>('seeded')
  const [exportError, setExportError] = useState('')
  const [levelRequest, setLevelRequest] = useState({ open, initialLevel })
  const [viewSession, setViewSession] = useState(open)
  const graphSurface = useRef<HTMLDivElement>(null)
  const availableLevels = useMemo(() => {
    const rawNodes = nodes.map((node) => node.data.raw)
    const rawEdges = edges.flatMap((edge) => (edge.data?.raw ? [edge.data.raw] : []))
    const graph = computeLevelGraph(rawNodes, rawEdges)
    return new Set(graph.levels.values())
  }, [edges, nodes])
  const [viewport, setViewport] = useState(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))
  const jobOptions = useMemo(
    () => sequenceJobOptions(nodes, ontology),
    [nodes, ontology],
  )
  const recommendedJobId = recommendedSequenceJobId(nodes, edges, ontology)
  const activeJobId = jobOptions.some((option) => option.id === jobId)
    ? jobId
    : recommendedJobId ?? jobOptions[0]?.id
  const view = useMemo(
    () => (activeView === 'sequence' || activeView === 'reference'
      ? { nodes: [], edges: [], notInLevels: [] }
      : deriveView(nodes, edges, activeView, ontology, { level, expanded })),
    [activeView, edges, expanded, level, nodes, ontology],
  )
  const canvasSeed = useMemo(() => new Map(nodes.map((node) => {
    const size = nodeDimensions(node)
    return [
      node.id,
      { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 },
    ] as const
  })), [nodes])
  const diagram = useMemo(
    () => layoutDerivedView(
      view,
      isApi ? undefined : { seed: canvasSeed, arrange },
    ),
    [arrange, canvasSeed, isApi, view],
  )
  const sequence = useMemo(
    () => (activeView === 'sequence'
      ? deriveSequence(nodes, edges, activeJobId, ontology)
      : { jobId: '', participants: [], messages: [] }),
    [activeJobId, activeView, edges, nodes, ontology],
  )

  useEffect(() => {
    const visualViewport = window.visualViewport
    function updateViewport() {
      setViewport({
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
      })
    }
    visualViewport?.addEventListener('resize', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (!/^[1-4]$/.test(event.key) || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) return
      if (!DERIVED_VIEWS.some((definition) => definition.id === activeView)) return
      const next = Number(event.key) as LevelNumber
      if (!availableLevels.has(next)) return
      setLevel(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView, availableLevels, onClose, open])

  if (levelRequest.open !== open || levelRequest.initialLevel !== initialLevel) {
    setLevelRequest({ open, initialLevel })
    if (open && initialLevel != null) setLevel(initialLevel)
  }

  if (viewSession !== open) {
    setViewSession(open)
    if (open) setArrange('seeded')
  }

  if (!open) return null

  const viewDefinition = DERIVED_VIEWS.find((definition) => definition.id === activeView)
  const levelLabel = `Level ${level} ${LEVEL_NAMES[level]}`
  const footer = `${title} · ${viewDefinition?.label ?? 'View'} · ${levelLabel} · ${new Date().toISOString().slice(0, 10)}`

  function selectView(next: ActiveView) {
    setActiveView(next)
    if (next === 'contracts') setLevel(4)
  }

  function runExport(kind: 'png' | 'svg') {
    if (!viewDefinition) return
    const action = () => {
      setExportError('')
      if (kind === 'png') {
        if (!graphSurface.current) return
        void exportDerivedPng(
          graphSurface.current,
          derivedExportFilename(title, viewDefinition.label, levelLabel, 'png'),
        ).catch((cause: unknown) => {
          setExportError(cause instanceof Error ? cause.message : 'Could not export the view.')
        })
      } else {
        exportDerivedSvg(
          diagram,
          footer,
          derivedExportFilename(title, viewDefinition.label, levelLabel, 'svg'),
        )
      }
    }
    if (guardExport) guardExport(`Derived view ${kind.toUpperCase()}`, action)
    else action()
  }

  return (
    <div
      className="derived-views-backdrop"
      style={{
        '--derived-vv-width': `${viewport.width}px`,
        '--derived-vv-height': `${viewport.height}px`,
      } as CSSProperties}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="derived-views-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Derived views"
      >
        <header className="derived-views-head">
          <div>
            <span className="derived-views-kicker">Derived views</span>
            <h2 id="derived-views-title">{title}</h2>
            <p>Read-only projections from the source canvas.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close derived views">
            <X size={17} />
          </button>
        </header>

        <div className="derived-views-tabs" role="tablist" aria-label="Derived view">
          {isApi && (
            <button
              role="tab"
              aria-selected={activeView === 'reference'}
              className={activeView === 'reference' ? 'active' : ''}
              onClick={() => selectView('reference')}
            >
              Reference
            </button>
          )}
          {DERIVED_VIEWS.map((definition) => (
            <button
              key={definition.id}
              role="tab"
              aria-selected={activeView === definition.id}
              className={activeView === definition.id ? 'active' : ''}
              onClick={() => selectView(definition.id)}
            >
              {definition.label}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={activeView === 'sequence'}
            className={activeView === 'sequence' ? 'active' : ''}
            onClick={() => selectView('sequence')}
          >
            Sequence
          </button>
        </div>

        <div className="derived-views-meta">
          {viewDefinition && (
            <div className="derived-level" role="group" aria-label="Level">
              {LEVEL_DEFINITIONS.map((definition) => {
                const available = availableLevels.has(definition.level)
                return (
                  <button
                    key={definition.level}
                    type="button"
                    className={`derived-level-step${level === definition.level ? ' active' : ''}`}
                    aria-pressed={level === definition.level}
                    disabled={!available}
                    title={available
                      ? `Level ${definition.level} ${definition.name}`
                      : `Level ${definition.level} ${definition.name}: No cards at this level`}
                    onClick={() => setLevel(definition.level)}
                  >
                    <strong>{definition.level}</strong>
                    <span>{definition.name}</span>
                    {!available && <small>No cards at this level</small>}
                  </button>
                )
              })}
            </div>
          )}
          {activeView === 'reference' ? (
            <>
              <span>Endpoint and model reference derived from the API canvas.</span>
              <span>{buildApiReference(nodes.map((node) => node.data.raw)).length} resources</span>
              <span>{nodes.filter((node) => node.data.entity?.entityType === 'endpoint').length} endpoints</span>
            </>
          ) : viewDefinition ? (
            <>
              <span>{viewDefinition.description}</span>
              <span>{diagram.nodes.length} cards</span>
              <span>{diagram.edges.length} relations</span>
              <button
                type="button"
                className="derived-action"
                disabled={expanded.size === 0}
                onClick={() => setExpanded(new Set())}
              >
                Collapse all
              </button>
              {!isApi && (
                <button
                  type="button"
                  className="derived-action"
                  aria-pressed={arrange === 'auto'}
                  onClick={() => setArrange((current) => current === 'auto' ? 'seeded' : 'auto')}
                >
                  Auto arrange
                </button>
              )}
              <button type="button" className="derived-action" onClick={() => runExport('png')}>
                <Download size={13} /> PNG
              </button>
              <button type="button" className="derived-action" onClick={() => runExport('svg')}>
                <Download size={13} /> SVG
              </button>
              {exportError && <span className="derived-export-error">{exportError}</span>}
            </>
          ) : (
            <>
              <span>Job interaction order inferred from explicit relations.</span>
              <span>{sequence.participants.length} participants</span>
              <span>{sequence.messages.length} messages</span>
              <span className="derived-inferred">Inferred order</span>
            </>
          )}
          {activeView === 'sequence' && jobOptions.length > 0 && (
            <label className="derived-process">
              <span>Job</span>
              <select
                aria-label="Sequence job"
                value={activeJobId ?? ''}
                onChange={(event) => setJobId(event.target.value)}
              >
                {jobOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          className="derived-views-body"
          role="tabpanel"
          aria-label={activeView === 'reference' ? 'API reference' : viewDefinition?.label ?? 'Sequence'}
        >
          {activeView === 'reference'
            ? <ApiReferenceView nodes={nodes} />
            : activeView === 'sequence'
              ? <SequenceDiagram sequence={sequence} />
              : (
                <GraphDiagram
                  diagram={diagram}
                  label={viewDefinition?.label ?? 'Architecture'}
                  footer={footer}
                  notInLevels={view.notInLevels}
                  surfaceRef={graphSurface}
                  onExpand={(id) => setExpanded((current) => new Set(current).add(id))}
                  onShowInCanvas={onShowInCanvas}
                />
              )}
        </div>

        <footer className="derived-views-foot">
          Edits happen only on the source canvas. This view derives from the current unsaved editor state.
        </footer>
      </section>
    </div>
  )
}

function GraphDiagram({
  diagram,
  label,
  footer,
  notInLevels,
  surfaceRef,
  onExpand,
  onShowInCanvas,
}: {
  diagram: DerivedDiagram
  label: string
  footer: string
  notInLevels: DerivedUnassignedItem[]
  surfaceRef: RefObject<HTMLDivElement | null>
  onExpand: (id: string) => void
  onShowInCanvas?: (id: string) => void
}) {
  if (diagram.nodes.length === 0 && notInLevels.length === 0) {
    return (
      <div className="derived-empty">
        <strong>No cards match this view.</strong>
        <span>Add relevant cards or relations on the source canvas.</span>
      </div>
    )
  }

  return (
    <div className="derived-scroll">
      <div className="derived-export-surface" ref={surfaceRef}>
        <div
          className="derived-graph"
          style={{ width: diagram.width, height: diagram.height }}
          role="img"
          aria-label={`${label} derived diagram`}
        >
          <svg
            className="derived-graph-edges"
            width={diagram.width}
            height={diagram.height}
            viewBox={`0 0 ${diagram.width} ${diagram.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="derived-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="derived-arrow" />
              </marker>
            </defs>
            {diagram.edges.map((edge) => (
              <g key={edge.id}>
                <path d={edge.path} markerEnd="url(#derived-arrow)" className="derived-edge-path" />
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  className="derived-edge-label"
                  paintOrder="stroke"
                  stroke="var(--ui-panel-solid)"
                  strokeWidth="4"
                >
                  {edge.label}
                </text>
              </g>
            ))}
          </svg>
          {diagram.nodes.map((node) => (
            <article
              key={node.id}
              className={`derived-card${node.isUnassigned ? ' unassigned' : ''}${node.expanded ? ' expanded' : ''}`}
              title={node.label}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
                '--derived-accent': node.accent ?? 'var(--ui-accent)',
              } as CSSProperties}
            >
              <div className="derived-card-head">
                <span className="derived-card-type">{node.typeLabel}</span>
                {node.annotations && node.annotations.length > 0 && (
                  <span className="derived-card-badges">
                    {node.annotations.map((badge) => (
                      <span key={badge.typeId} className="derived-badge">
                        {badge.count} {badge.label}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <strong>{node.label}</strong>
              {node.detail && <small>{node.detail}</small>}
              {node.contents && node.contents.length > 0 && (
                <div className="derived-contents">
                  {node.contents.map((chip) => (
                    <span key={chip.typeId} className="derived-content-chip">
                      {chip.count} {chip.typeLabel.toLowerCase()}{chip.count === 1 ? '' : 's'}
                    </span>
                  ))}
                </div>
              )}
              {node.internalRelations ? (
                <small className="derived-internal">
                  {node.internalRelations} internal relation{node.internalRelations === 1 ? '' : 's'}
                </small>
              ) : null}
              {node.canExpand && (
                <button type="button" className="derived-card-action" onClick={() => onExpand(node.id)}>
                  Expand
                </button>
              )}
              {node.isUnassigned && node.unassignedItems && (
                <div className="derived-unassigned-list">
                  {node.unassignedItems.map((item) => (
                    <div key={item.id} className="derived-unassigned-item">
                      <span title={item.label}>{item.label}</span>
                      {onShowInCanvas && (
                        <button type="button" onClick={() => onShowInCanvas(item.id)}>
                          Show in canvas
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        {notInLevels.length > 0 && (
          <section className="derived-not-in-levels" aria-label="Not in levels">
            <strong>Not in levels ({notInLevels.length})</strong>
            <div className="derived-unassigned-list">
              {notInLevels.map((item) => (
                <div key={item.id} className="derived-unassigned-item">
                  <span title={item.label}>{item.label}</span>
                  {onShowInCanvas && (
                    <button type="button" onClick={() => onShowInCanvas(item.id)}>
                      Show in canvas
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        <footer className="derived-export-footer">{footer}</footer>
      </div>
    </div>
  )
}

function SequenceDiagram({ sequence }: { sequence: DerivedSequence }) {
  if (sequence.participants.length === 0) {
    return (
      <div className="derived-empty">
        <strong>No job to sequence.</strong>
        <span>Add a System with kind job to derive an interaction order.</span>
      </div>
    )
  }

  const laneWidth = 176
  const laneGap = 42
  const left = 28
  const headerHeight = 58
  const messageTop = 138
  const messageGap = 56
  const width = left * 2 + sequence.participants.length * laneWidth
    + (sequence.participants.length - 1) * laneGap
  const height = messageTop + Math.max(sequence.messages.length, 1) * messageGap + 34
  const laneX = (index: number) => left + index * (laneWidth + laneGap)
  const indexById = new Map(sequence.participants.map((participant, index) => [participant.id, index]))
  const byId = new Map(sequence.participants.map((participant) => [participant.id, participant]))

  return (
    <div className="derived-scroll">
      <div
        className="derived-sequence"
        style={{ width, height }}
        role="img"
        aria-label={`Sequence for ${sequence.participants.find((participant) => participant.id === sequence.jobId)?.label ?? 'job'}`}
      >
        <svg
          className="derived-sequence-canvas"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="derived-sequence-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="derived-arrow" />
            </marker>
          </defs>
          {sequence.participants.map((participant, index) => {
            const x = laneX(index) + laneWidth / 2
            return (
              <line
                key={participant.id}
                x1={x}
                y1={headerHeight + 10}
                x2={x}
                y2={height - 18}
                className="derived-lifeline"
              />
            )
          })}
          {sequence.messages.map((message, index) => {
            const sourceIndex = indexById.get(message.from)
            const targetIndex = indexById.get(message.to)
            if (sourceIndex == null || targetIndex == null) return null
            const source = byId.get(message.from)
            const target = byId.get(message.to)
            if (!source || !target) return null
            const sourceX = laneX(sourceIndex) + laneWidth / 2
            const targetX = laneX(targetIndex) + laneWidth / 2
            const y = messageTop + index * messageGap
            return (
              <g key={message.id}>
                <text x={16} y={y + 4} className="derived-message-order">{message.order}</text>
                <line
                  x1={sourceX}
                  y1={y}
                  x2={targetX}
                  y2={y}
                  className="derived-message-line"
                  markerEnd="url(#derived-sequence-arrow)"
                />
                <circle cx={sourceX} cy={y} r="3" className="derived-message-origin" />
                <text
                  x={(sourceX + targetX) / 2}
                  y={y - 9}
                  textAnchor="middle"
                  className="derived-message-label"
                  paintOrder="stroke"
                  stroke="var(--ui-panel-solid)"
                  strokeWidth="4"
                >
                  {message.label}
                </text>
              </g>
            )
          })}
          {sequence.messages.length === 0 && (
            <text
              x={width / 2}
              y={messageTop + 18}
              textAnchor="middle"
              className="derived-sequence-empty"
            >
              No explicit relations touch this process.
            </text>
          )}
        </svg>
        {sequence.participants.map((participant, index) => (
          <article
            key={participant.id}
            className="derived-participant"
            title={participant.label}
            style={{
              left: laneX(index),
              top: 0,
              width: laneWidth,
              height: headerHeight,
              '--derived-accent': participant.accent ?? 'var(--ui-accent)',
            } as CSSProperties}
          >
            <span>{participant.typeLabel}</span>
            <strong>{participant.label}</strong>
            {participant.detail && <small>{participant.detail}</small>}
          </article>
        ))}
      </div>
    </div>
  )
}
