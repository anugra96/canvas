import { useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ViewportPortal,
  type Viewport,
} from '@xyflow/react'

import {
  attachRequestModel,
  attachResponseModel,
  columnFromDatabaseHandle,
  edgeOrigin,
  getEdgeMeta,
  referenceRouteEdge,
  removeModelReference,
  routeReferences,
  responseHasOtherContent,
  type CanvasProfile,
  type EdgeOrigin,
  type LevelNumber,
  type Ontology,
  type ReviewMode,
} from '@canvas/contract'
import type { Connection, EdgeChange } from '@xyflow/react'

import { CanvasBackdrop } from '../backdrop/CanvasBackdrop'
import { nodeDimensions, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import { useCanvasEditorActions } from './CanvasEditorContext'
import { writeViewport } from './viewport'
import { useApiDesign } from '../apiDesign/ApiDesignContext'
import { ManagedEdgeChooser } from '../apiDesign/ManagedEdgeChooser'
import { ConnectionPreview } from './graph/ConnectionPreview'
import { LayoutPreviewBar, LayoutPreviewGhosts } from './LayoutPreview'
import type { CanvasGraphState } from './graph/useCanvasGraph'
import type { CanvasCaptureState } from './capture/useCanvasCapture'
import type { CanvasValidationEditor } from './validation/useCanvasValidation'
import { ConnectionTemplateMenu } from './ConnectionTemplateMenu'
import { EdgeLabelEditor } from './EdgeLabelEditor'
import { ReviewPanel } from './ReviewPanel'
import { SelectionToolbar } from './SelectionToolbar'
import { CanvasEdge as CanvasEdgeComponent } from './edges/CanvasEdge'
import { DatabaseReferenceEdge } from './edges/DatabaseReferenceEdge'
import { CodeNode } from './nodes/CodeNode'
import { SchemaNode } from './nodes/SchemaNode'
import { EntityNode } from './nodes/EntityNode'
import { FileNode } from './nodes/FileNode'
import { GroupNode } from './nodes/GroupNode'
import { LinkNode } from './nodes/LinkNode'
import { TextNode as TextNodeComponent } from './nodes/TextNode'

const nodeTypes = {
  text: TextNodeComponent,
  entity: EntityNode,
  schema: SchemaNode,
  code: CodeNode,
  group: GroupNode,
  file: FileNode,
  link: LinkNode,
}

const edgeTypes = {
  canvas: CanvasEdgeComponent,
  'database-reference': DatabaseReferenceEdge,
}

interface CanvasWorkspaceProps {
  documentId: string
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  isMobile: boolean
  coarsePointer: boolean
  isSystems: boolean
  profile: CanvasProfile
  ontology: Ontology
  availableEntityTypes: Array<{ id: string; label: string }>
  profileRelationTypes: Array<{ id: string; label: string }>
  shouldFitInitial: boolean
  savedViewport: Viewport | null
  viewportLayout: 'mobile' | 'desktop'
  flowRef: React.RefObject<HTMLDivElement | null>
  graph: CanvasGraphState
  capture: CanvasCaptureState
  validation: CanvasValidationEditor
  setNotice: (message: string) => void
  onOpenHelp: () => void
  reviewMode: ReviewMode
  onReviewModeChange: (mode: ReviewMode) => void
  onOpenLevel: (level: LevelNumber) => void
}

export function CanvasWorkspace({
  documentId,
  nodes,
  edges,
  isMobile,
  coarsePointer,
  isSystems,
  profile,
  ontology,
  availableEntityTypes,
  profileRelationTypes,
  shouldFitInitial,
  savedViewport,
  viewportLayout,
  flowRef,
  graph,
  capture,
  validation,
  setNotice,
  onOpenHelp,
  reviewMode,
  onReviewModeChange,
  onOpenLevel,
}: CanvasWorkspaceProps) {
  const apiDesign = useApiDesign()
  const actions = useCanvasEditorActions()
  const [managedConnection, setManagedConnection] = useState<{
    sourceId: string
    targetId: string
    sourceLabel: string
    modelName: string
  } | null>(null)
  const renderedEdges = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const databaseRoutes = profile.id === 'database'
      ? (() => {
        const cards = nodes.map((node) => {
          const size = nodeDimensions(node)
          return {
            ...node.data.raw,
            x: node.position.x,
            y: node.position.y,
            width: size.width,
            height: size.height,
          }
        })
        const referenceEdges = edges.filter((edge) => (
          edge.data?.relationType === 'references' && edge.data.raw
        ))
        const routes = routeReferences(
          referenceEdges.map((edge) => referenceRouteEdge(edge.data!.raw)),
          cards,
        )
        return new Map(referenceEdges.map((edge, index) => [edge.id, routes[index]]))
      })()
      : undefined
    return edges.map((edge) => {
      if (!edge.data) return edge
      const raw = edge.data.raw
      const origin = edgeOrigin(raw)
      const originNode = origin === 'managed' ? nodeById.get(edge.source) : undefined
      const fields = originNode?.data.entity?.fields ?? {}
      const originCardName = String(fields.name ?? fields.title ?? '').trim()
      const next: CanvasFlowEdge = {
        ...edge,
        data: {
          ...edge.data,
          origin,
          ...(originNode
            ? {
              originCardId: originNode.id,
              originCardName: originCardName || originNode.id,
            }
            : {}),
        },
      }
      if (profile.id === 'database' && edge.data.relationType === 'references') {
        const route = databaseRoutes?.get(edge.id)
        const routed: CanvasFlowEdge = {
          ...next,
          type: 'database-reference',
          data: route && route.length >= 2
            ? { ...edge.data, referenceRoute: route }
            : next.data,
        }
        return routed
      }
      if (edge.data.relationType !== 'uses') return next
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target) return next
      if (Math.abs(source.position.x - target.position.x) < 1) {
        return {
          ...next,
          sourceHandle: source.position.y < target.position.y ? 'bottom' : 'top',
          targetHandle: source.position.y < target.position.y ? 'top' : 'bottom',
        }
      }
      return {
        ...next,
        sourceHandle: target.position.x > source.position.x ? 'right' : 'left',
        targetHandle: target.position.x > source.position.x ? 'left' : 'right',
      }
    })
  }, [edges, nodes, profile.id])

  const selectedOrigin = graph.selectedEdges.length === 1
    ? renderedEdges.find((edge) => edge.selected)?.data
    : undefined
  const editorOrigin = graph.edgeLabelEditor
    ? renderedEdges.find((edge) => edge.id === graph.edgeLabelEditor?.edgeId)?.data
    : undefined

  function nodeField(id: string, key: string): string {
    const node = nodes.find((candidate) => candidate.id === id)
    const value = node?.data.entity?.fields[key]
    return value == null ? '' : String(value)
  }

  function handleConnect(connection: Connection) {
    if (profile.id === 'database') {
      const fromColumn = columnFromDatabaseHandle(connection.sourceHandle)
      const toColumn = columnFromDatabaseHandle(connection.targetHandle)
      if (connection.source && connection.target && fromColumn && toColumn) {
        actions.addDatabaseReference({
          fromNode: connection.source,
          toNode: connection.target,
          fromColumn,
          toColumn,
        })
      } else {
        setNotice('Draw a reference from one column row to another.')
      }
      return
    }
    if (!apiDesign) {
      graph.onConnect(connection)
      return
    }
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)
    if (source?.data.entity?.entityType === 'endpoint' && target?.data.entity?.entityType === 'schema') {
      const sourceLabel = `${nodeField(source.id, 'method')} ${nodeField(source.id, 'path')}`.trim()
      setManagedConnection({
        sourceId: source.id,
        targetId: target.id,
        sourceLabel,
        modelName: nodeField(target.id, 'name') || 'Model',
      })
      return
    }
    graph.onConnect(connection)
  }

  function chooseManagedConnection(choice: { kind: 'request' } | { kind: 'response'; status: string }) {
    if (!managedConnection) return
    try {
      const operation = JSON.parse(nodeField(managedConnection.sourceId, 'operation') || '{}')
      const next = choice.kind === 'request'
        ? attachRequestModel(operation, managedConnection.modelName)
        : attachResponseModel(operation, choice.status, managedConnection.modelName)
      graph.updateEntityField(managedConnection.sourceId, 'operation', JSON.stringify(next, null, 2))
    } catch {
      setNotice('Fix the endpoint operation JSON before drawing a managed relation.')
    }
    setManagedConnection(null)
  }

  function handleEdgesChange(changes: EdgeChange<CanvasFlowEdge>[]) {
    if (profile.id === 'database') {
      const removals = changes
        .filter((change) => change.type === 'remove')
        .map((change) => edges.find((edge) => edge.id === change.id))
        .filter((edge): edge is CanvasFlowEdge => Boolean(edge))
        .filter((edge) => {
          const meta = edge.data?.raw ? getEdgeMeta(edge.data.raw) : undefined
          return meta?.managed && meta.relationType === 'references'
        })
      if (removals.length > 0) {
        const removedIds = new Set(removals.map((edge) => edge.id))
        for (const edge of removals) actions.removeDatabaseReference(edge.id)
        const rest = changes.filter((change) => !(
          change.type === 'remove' && removedIds.has(change.id)
        ))
        if (rest.length > 0) graph.onEdgesChange(rest)
        return
      }
    }
    if (!apiDesign) {
      graph.onEdgesChange(changes)
      return
    }
    const removals = changes
      .filter((change) => change.type === 'remove')
      .map((change) => edges.find((edge) => edge.id === change.id))
      .filter((edge): edge is CanvasFlowEdge => Boolean(edge))
      .filter((edge) => {
        const meta = edge.data?.raw ? getEdgeMeta(edge.data.raw) : undefined
        return meta?.managed && (meta.relationType === 'accepts' || meta.relationType === 'returns')
      })
    if (removals.length > 0) {
      for (const edge of removals) {
        const meta = getEdgeMeta(edge.data!.raw!)
        const target = nodes.find((node) => node.id === edge.target)
        const modelName = target?.data.entity?.fields.name
        if (!modelName) continue
        const operation = JSON.parse(nodeField(edge.source, 'operation') || '{}')
        if (meta?.relationType === 'returns' && meta.status && responseHasOtherContent(operation, meta.status, meta.mediaType)) {
          if (!window.confirm(`Response ${meta.status} also has other content. Remove ${modelName}?`)) return
        }
        if (meta?.relationType) {
          const next = removeModelReference(operation, meta.relationType, String(modelName), meta.status, meta.mediaType)
          graph.updateEntityField(edge.source, 'operation', JSON.stringify(next, null, 2))
        }
      }
    }
    graph.onEdgesChange(changes)
  }

  return (
    <div
      className={`canvas-flow${graph.connectNodeId ? ' connect-mode' : ''}`}
      ref={flowRef}
      onDoubleClick={graph.handleDoubleClick}
    >
      <CanvasBackdrop />
      <ReactFlow
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={graph.onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={() => {
          graph.setPendingConnection(null)
          graph.setEdgeLabelEditor(null)
          graph.setAlignmentGuides([])
        }}
        onConnectEnd={graph.onConnectEnd}
        onEdgeDoubleClick={(event, edge) => {
          graph.openEdgeLabelEditor(edge.id, event.clientX, event.clientY)
        }}
        onReconnect={graph.onReconnect}
        edgesReconnectable
        reconnectRadius={26}
        onNodeDragStart={() => graph.setAlignmentGuides([])}
        onNodeDragStop={() => graph.setAlignmentGuides([])}
        onMoveStart={() => graph.setAlignmentGuides([])}
        onNodeClick={(_, node) => {
          if (!graph.connectNodeId || node.id === graph.connectNodeId) return
          if (node.type === 'group') {
            setNotice('Groups cannot be connection endpoints.')
            return
          }
          graph.connectNodes(graph.connectNodeId, node.id)
        }}
        onPaneClick={() => {
          if (graph.connectNodeId) graph.setConnectNodeId(null)
        }}
        connectionMode={ConnectionMode.Loose}
        fitView={shouldFitInitial}
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
        elevateNodesOnSelect={profile.id !== 'api'}
        defaultViewport={savedViewport ?? undefined}
        onMoveEnd={(_, viewport: Viewport) => writeViewport(documentId, viewport, viewportLayout)}
        minZoom={isMobile ? 0.08 : 0.2}
        maxZoom={2.5}
        zoomOnDoubleClick={false}
        panOnScroll
        panActivationKeyCode="Space"
        zoomActivationKeyCode={['Meta', 'Control']}
        multiSelectionKeyCode="Shift"
        panOnDrag={isMobile ? true : [1, 2]}
        selectionOnDrag={!isMobile}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--ui-pattern)" />
        <Controls showInteractive={false} />
        {graph.pendingConnection && (
          <ConnectionPreview nodes={nodes} pending={graph.pendingConnection} />
        )}
        <ViewportPortal>
          {graph.alignmentGuides.map((guide, index) => (
            <div
              key={`${guide.axis}-${guide.position}-${index}`}
              className={`alignment-guide ${guide.axis}`}
              style={guide.axis === 'x'
                ? { left: guide.position, top: guide.start, height: guide.end - guide.start }
                : { top: guide.position, left: guide.start, width: guide.end - guide.start }}
            />
          ))}
          {graph.layoutPreview && <LayoutPreviewGhosts preview={graph.layoutPreview} />}
        </ViewportPortal>
      </ReactFlow>
      {graph.layoutPreview && (
        <LayoutPreviewBar
          preview={graph.layoutPreview}
          onApply={graph.applyLayoutPreview}
          onCancel={graph.cancelLayoutPreview}
        />
      )}
      {capture.areaMode && (
        <div
          className="screenshot-selection-layer"
          onPointerDown={capture.onAreaPointerDown}
          onPointerMove={capture.onAreaPointerMove}
          onPointerUp={(event) => { void capture.onAreaPointerUp(event) }}
          onPointerCancel={capture.cancelAreaSelection}
        >
          <div
            className="screenshot-selection-hint"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>Drag to select an area</span>
            <button className="button" onClick={capture.cancelAreaSelection}>Cancel</button>
          </div>
          {capture.dragBox && (
            <div
              className="screenshot-selection-box"
              style={{
                left: capture.dragBox.x,
                top: capture.dragBox.y,
                width: capture.dragBox.width,
                height: capture.dragBox.height,
              }}
            />
          )}
        </div>
      )}
      <button
        className="canvas-help-hint"
        onClick={onOpenHelp}
        aria-label="Show shortcuts help"
      >
        ? Shortcuts
      </button>
      {!graph.pendingConnection && !graph.cardMenu && !graph.edgeLabelEditor && (
        <SelectionToolbar
          selectedNodes={graph.selectedNodes.length}
          selectedEdges={graph.selectedEdges.length}
          canGroup={graph.selectedNodes.some((node) => node.type !== 'group')}
          canConnect={(profile.id === 'raw' || profile.id === 'systems') && Boolean(graph.singleSelectedNode) && graph.singleSelectedNode?.type !== 'group'}
          connectMode={graph.connectNodeId !== null}
          coarsePointer={coarsePointer}
          onConnect={() => graph.setConnectNodeId((current) => current ? null : graph.singleSelectedNode?.id ?? null)}
          canResize={Boolean(graph.singleSelectedNode)}
          onResize={() => graph.setSizeDialogOpen(true)}
          cardTypeValue={profile.id === 'api' ? undefined : graph.cardTypeValue}
          allowText={!isSystems}
          entityTypeIds={availableEntityTypes.map((entityType) => entityType.id)}
          onCardTypeChange={profile.id === 'api' ? undefined : graph.changeCardType}
          onGroup={graph.groupSelected}
          onReverse={graph.reverseSelectedEdges}
          relationValue={graph.selectedRelationValue}
          relationTypes={profileRelationTypes.map((relation) => ({ id: relation.id, label: relation.label }))}
          allowUnspecified={isSystems}
          onRelationChange={graph.changeRelation}
          canManageMembership={graph.canManageMembership}
          membershipLabel={graph.allSelectedCardsAreMembers ? 'Remove from group' : 'Add to group'}
          onToggleMembership={graph.toggleGroupMembership}
          onDuplicate={graph.duplicateSelection}
          onDelete={graph.deleteSelected}
          onClear={graph.clearSelection}
          onColor={graph.applyColor}
          edgeOrigin={selectedOrigin?.origin as EdgeOrigin | undefined}
          edgeOriginCardName={selectedOrigin?.originCardName as string | undefined}
          onOpenOriginCard={selectedOrigin?.originCardId
            ? () => actions.openNodeEditor(String(selectedOrigin.originCardId))
            : undefined}
        />
      )}
      {graph.pendingConnection && (
        <ConnectionTemplateMenu
          x={graph.pendingConnection.screen.x}
          y={graph.pendingConnection.screen.y}
          profile={profile}
          onSelect={graph.insertConnectedNode}
          onClose={() => graph.setPendingConnection(null)}
        />
      )}
      {graph.cardMenu && (
        <ConnectionTemplateMenu
          x={graph.cardMenu.screen.x}
          y={graph.cardMenu.screen.y}
          profile={profile}
          mode="card"
          onSelect={graph.insertCardFromMenu}
          onClose={() => graph.setCardMenu(null)}
        />
      )}
      {graph.edgeLabelEditor && (
        <EdgeLabelEditor
          x={graph.edgeLabelEditor.x}
          y={graph.edgeLabelEditor.y}
          initialValue={graph.edgeLabelEditor.label}
          origin={editorOrigin?.origin as EdgeOrigin | undefined}
          originCardName={editorOrigin?.originCardName as string | undefined}
          onOpenOriginCard={editorOrigin?.originCardId
            ? () => {
              graph.setEdgeLabelEditor(null)
              actions.openNodeEditor(String(editorOrigin.originCardId))
            }
            : undefined}
          onSave={graph.saveEdgeLabel}
          onCancel={() => graph.setEdgeLabelEditor(null)}
        />
      )}
      {managedConnection && (
        <ManagedEdgeChooser
          sourceLabel={managedConnection.sourceLabel}
          modelName={managedConnection.modelName}
          onChoose={chooseManagedConnection}
          onClose={() => setManagedConnection(null)}
        />
      )}
      {isSystems && validation.reviewOpen && (
        <ReviewPanel
          tab={validation.reviewTab}
          onTabChange={validation.setReviewTab}
          issues={validation.prioritizedIssues}
          ignoredIssues={validation.ignoredPrioritizedIssues}
          suggestions={validation.suggestions}
          nodes={nodes}
          edges={edges}
          profile={profile}
          ontology={ontology}
          reviewMode={reviewMode}
          hiddenByModeCount={validation.hiddenByModeCount}
          levelReadiness={validation.levelReadiness}
          ignoredReasons={validation.ignoredReasons}
          focusRequest={validation.validationFocusRequest}
          onClose={validation.closeReview}
          onReviewModeChange={onReviewModeChange}
          onOpenLevel={onOpenLevel}
          onFocus={validation.focusValidationIssue}
          onIgnore={validation.ignoreValidationIssue}
          onRestore={validation.restoreValidationIssue}
          onPreviewSuggestion={validation.focusSuggestion}
          onApplySuggestion={validation.applySuggestion}
        />
      )}
    </div>
  )
}
