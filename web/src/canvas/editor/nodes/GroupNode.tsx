import type { NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

import { getDistrict } from '@canvas/contract'

import type { CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { useCanvasNodeIndex } from '../CanvasNodeIndexContext'
import { NodeShell } from './NodeShell'

export function GroupNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const nodeIndex = useCanvasNodeIndex()
  const district = getDistrict(data.raw)
  const owner = district?.ownerId ? nodeIndex.get(district.ownerId) : undefined
  const ownerName = owner?.data.entity?.entityType === 'actor'
    ? String(owner.data.entity.fields.name ?? '').trim() || 'Untitled Actor'
    : ''
  const label = data.label || 'Group'
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) return
    function onPointerDown(event: PointerEvent) {
      if (!inputRef.current?.contains(event.target as Node)) setEditing(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [editing])

  function startEditing() {
    setValue(data.label ?? '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
  }

  return (
    <NodeShell
      node={{ id, data, selected } as CanvasFlowNode}
      selected={Boolean(selected)}
      className={`group-node${district ? ' district-node' : ''}`}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="group-label-input nodrag"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            actions.updateLabel(id, event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              commit()
            }
          }}
        />
      ) : (
        <button className="group-label" onDoubleClick={startEditing}>
          {label}{district && ownerName ? <span className="group-owner">{` · ${ownerName}`}</span> : null}
        </button>
      )}
    </NodeShell>
  )
}
