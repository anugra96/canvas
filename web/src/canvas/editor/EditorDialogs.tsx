import { getCanvasLinks, type MergeConflict } from '@canvas/contract'
import type { CanvasGraphState } from './graph/useCanvasGraph'
import type { CanvasCaptureState } from './capture/useCanvasCapture'
import type { CanvasLinksState } from './links/useCanvasLinks'
import { CanvasLinksDialog } from './CanvasLinksDialog'
import { CanvasNameDialog } from '../../CanvasNameDialog'
import { DerivedViewsDialog } from './DerivedViewsDialog'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { NodeSizeDialog } from './NodeSizeDialog'
import { ScreenshotDialog } from './ScreenshotDialog'
import { nodeDimensions, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import type { CanvasCommand } from './commands'
import type { Ontology } from '@canvas/contract'

interface EditorDialogsProps {
  documentId: string
  title: string
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  ontology: Ontology
  isSystems: boolean
  trail: Array<{ id: string; label: string }>
  commands: CanvasCommand[]
  conflicts: MergeConflict[]
  onReloadLatest: () => void
  onKeepMine: () => void
  graph: CanvasGraphState
  capture: CanvasCaptureState
  links: CanvasLinksState
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  viewsOpen: boolean
  setViewsOpen: (open: boolean) => void
  renameOpen: boolean
  setRenameOpen: (open: boolean) => void
  renameBusy: boolean
  renameCanvas: (title: string) => Promise<void>
}

export function EditorDialogs({
  documentId,
  title,
  nodes,
  edges,
  ontology,
  isSystems,
  trail,
  commands,
  conflicts,
  onReloadLatest,
  onKeepMine,
  graph,
  capture,
  links,
  helpOpen,
  setHelpOpen,
  viewsOpen,
  setViewsOpen,
  renameOpen,
  setRenameOpen,
  renameBusy,
  renameCanvas,
}: EditorDialogsProps) {
  return (
    <>
      {conflicts.length > 0 && (
        <div className="conflict-bar" role="alertdialog" aria-label="Merge conflict">
          <div>
            <strong>Merge conflict</strong>
            <span>
              {conflicts.length} item{conflicts.length === 1 ? '' : 's'} changed in both places.
            </span>
          </div>
          <button className="button" onClick={onReloadLatest}>Reload latest</button>
          <button className="button primary" onClick={onKeepMine}>Keep my version</button>
        </div>
      )}

      {graph.singleSelectedNode && graph.sizeDialogOpen && (
        <NodeSizeDialog
          key={graph.singleSelectedNode.id}
          label={graph.singleSelectedNode.type === 'group' ? 'group' : 'card'}
          width={nodeDimensions(graph.singleSelectedNode).width}
          height={nodeDimensions(graph.singleSelectedNode).height}
          onApply={(width, height) => {
            graph.resizeNode(graph.singleSelectedNode!.id, width, height)
            graph.setSizeDialogOpen(false)
          }}
          onClose={() => graph.setSizeDialogOpen(false)}
        />
      )}

      <ScreenshotDialog
        open={capture.screenshotOpen}
        busy={capture.screenshotBusy}
        scale={capture.screenshotScale}
        error={capture.screenshotError}
        onScaleChange={capture.setScreenshotScale}
        onFull={() => { void capture.captureFull() }}
        onSelect={capture.beginAreaSelection}
        onClose={capture.closeScreenshot}
      />

      <KeyboardShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} commands={commands} />

      {isSystems && (
        <DerivedViewsDialog
          open={viewsOpen}
          title={title}
          nodes={nodes}
          edges={edges}
          ontology={ontology}
          onClose={() => setViewsOpen(false)}
        />
      )}

      {links.canvasLinkNode && (
        <CanvasLinksDialog
          nodeName={links.canvasLinkNodeName}
          links={getCanvasLinks(links.canvasLinkNode.data.raw)}
          currentCanvasId={documentId}
          trailIds={trail.map((entry) => entry.id)}
          canvases={links.canvasOptions}
          loading={links.canvasOptionsLoading}
          error={links.canvasOptionsError}
          onClose={links.closeCanvasLinks}
          onOpen={links.openLinkedCanvas}
          onLinkExisting={links.linkExistingCanvas}
          onUnlink={links.unlinkCanvas}
          onLabel={links.relabelCanvas}
          onCreateNew={links.createLinkedCanvas}
        />
      )}

      {renameOpen && (
        <CanvasNameDialog
          heading="Rename canvas"
          initialValue={title}
          confirmLabel="Save name"
          busy={renameBusy}
          onConfirm={(nextTitle) => void renameCanvas(nextTitle)}
          onCancel={() => setRenameOpen(false)}
        />
      )}
    </>
  )
}
