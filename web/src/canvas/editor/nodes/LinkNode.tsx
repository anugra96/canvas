import type { NodeProps } from '@xyflow/react'
import { ExternalLink } from 'lucide-react'

import type { CanvasFlowNode } from '../../model/adapter'
import { NodeShell } from './NodeShell'

export function LinkNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="link-node">
      <div className="asset-node-body">
        <ExternalLink size={22} />
        <strong>Web link</strong>
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer noopener"
          className="nodrag"
          onClick={(event) => event.stopPropagation()}
        >
          {data.url}
        </a>
      </div>
    </NodeShell>
  )
}
