import { X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { Ontology } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'
import { layoutDerivedView, type DerivedDiagram } from '../views/diagramLayout'
import {
  DERIVED_VIEWS,
  deriveSequence,
  deriveView,
  recommendedSequenceProcessId,
  sequenceProcessOptions,
  type DerivedSequence,
  type DerivedViewId,
} from '../views/derivedViews'

type ActiveView = DerivedViewId | 'sequence'

interface DerivedViewsDialogProps {
  open: boolean
  title: string
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  ontology: Ontology
  onClose: () => void
}

export function DerivedViewsDialog({
  open,
  title,
  nodes,
  edges,
  ontology,
  onClose,
}: DerivedViewsDialogProps) {
  const [activeView, setActiveView] = useState<ActiveView>('architecture')
  const [processId, setProcessId] = useState('')
  const [viewport, setViewport] = useState(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))
  const processOptions = useMemo(
    () => sequenceProcessOptions(nodes, ontology),
    [nodes, ontology],
  )
  const recommendedProcessId = recommendedSequenceProcessId(nodes, edges, ontology)
  const activeProcessId = processOptions.some((option) => option.id === processId)
    ? processId
    : recommendedProcessId ?? processOptions[0]?.id
  const view = useMemo(
    () => (activeView === 'sequence'
      ? { nodes: [], edges: [] }
      : deriveView(nodes, edges, activeView, ontology)),
    [activeView, edges, nodes, ontology],
  )
  const diagram = useMemo(() => layoutDerivedView(view), [view])
  const sequence = useMemo(
    () => (activeView === 'sequence'
      ? deriveSequence(nodes, edges, activeProcessId, ontology)
      : { processId: '', participants: [], messages: [] }),
    [activeProcessId, activeView, edges, nodes, ontology],
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
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  const viewDefinition = DERIVED_VIEWS.find((definition) => definition.id === activeView)

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
          {DERIVED_VIEWS.map((definition) => (
            <button
              key={definition.id}
              role="tab"
              aria-selected={activeView === definition.id}
              className={activeView === definition.id ? 'active' : ''}
              onClick={() => setActiveView(definition.id)}
            >
              {definition.label}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={activeView === 'sequence'}
            className={activeView === 'sequence' ? 'active' : ''}
            onClick={() => setActiveView('sequence')}
          >
            Sequence
          </button>
        </div>

        <div className="derived-views-meta">
          {viewDefinition ? (
            <>
              <span>{viewDefinition.description}</span>
              <span>{diagram.nodes.length} cards</span>
              <span>{diagram.edges.length} relations</span>
            </>
          ) : (
            <>
              <span>Process interaction order inferred from explicit relations.</span>
              <span>{sequence.participants.length} participants</span>
              <span>{sequence.messages.length} messages</span>
              <span className="derived-inferred">Inferred order</span>
            </>
          )}
          {activeView === 'sequence' && processOptions.length > 0 && (
            <label className="derived-process">
              <span>Process</span>
              <select
                aria-label="Sequence process"
                value={activeProcessId ?? ''}
                onChange={(event) => setProcessId(event.target.value)}
              >
                {processOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          className="derived-views-body"
          role="tabpanel"
          aria-label={viewDefinition?.label ?? 'Sequence'}
        >
          {activeView === 'sequence'
            ? <SequenceDiagram sequence={sequence} />
            : <GraphDiagram diagram={diagram} label={viewDefinition?.label ?? 'Architecture'} />}
        </div>

        <footer className="derived-views-foot">
          Edits happen only on the source canvas. This view derives from the current unsaved editor state.
        </footer>
      </section>
    </div>
  )
}

function GraphDiagram({ diagram, label }: { diagram: DerivedDiagram; label: string }) {
  if (diagram.nodes.length === 0) {
    return (
      <div className="derived-empty">
        <strong>No cards match this view.</strong>
        <span>Add relevant cards or relations on the source canvas.</span>
      </div>
    )
  }

  return (
    <div className="derived-scroll">
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
            className="derived-card"
            title={node.label}
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
              '--derived-accent': node.accent ?? 'var(--ui-accent)',
            } as CSSProperties}
          >
            <span className="derived-card-type">{node.typeLabel}</span>
            <strong>{node.label}</strong>
            {node.detail && <small>{node.detail}</small>}
          </article>
        ))}
      </div>
    </div>
  )
}

function SequenceDiagram({ sequence }: { sequence: DerivedSequence }) {
  if (sequence.participants.length === 0) {
    return (
      <div className="derived-empty">
        <strong>No process to sequence.</strong>
        <span>Add a Process card to derive an interaction order.</span>
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
        aria-label={`Sequence for ${sequence.participants.find((participant) => participant.id === sequence.processId)?.label ?? 'process'}`}
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
