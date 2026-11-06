import type { NodeProps } from '@xyflow/react'
import { FileText } from 'lucide-react'

import type { CanvasFlowNode } from '../../model/adapter'
import { NodeShell } from './NodeShell'

export function FileNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="file-node">
      <div className="asset-node-body">
        <FileText size={22} />
        <strong>{data.file || 'Missing file'}</strong>
        <span>Vault file preview is read-only in this build.</span>
      </div>
    </NodeShell>
  )
}
