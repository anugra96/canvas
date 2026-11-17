import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

import type { CanvasProfileIssue } from '@canvas/contract'

import { IGNORE_REASONS, type IgnoreReason } from './validationSuppressions'

function BlockedIssue({
  issue,
  onShow,
  onIgnore,
}: {
  issue: CanvasProfileIssue
  onShow: () => void
  onIgnore: (reason: IgnoreReason) => void
}) {
  const [reason, setReason] = useState<IgnoreReason>(IGNORE_REASONS[0])
  return (
    <div className="publish-blocked-issue">
      <div>
        <strong>{issue.message}</strong>
        <span>{issue.code.replaceAll('_', ' ')} · {issue.severity}</span>
      </div>
      <div className="publish-blocked-actions">
        <button type="button" className="button" onClick={onShow}>Show</button>
        <select
          aria-label={`Ignore reason for ${issue.code}`}
          value={reason}
          onChange={(event) => setReason(event.target.value as IgnoreReason)}
        >
          {IGNORE_REASONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <button type="button" className="button primary" onClick={() => onIgnore(reason)}>
          Ignore
        </button>
      </div>
    </div>
  )
}

export function PublishBlockedDialog({
  label,
  issues,
  onShow,
  onIgnore,
  onClose,
}: {
  label: string
  issues: CanvasProfileIssue[]
  onShow: (issue: CanvasProfileIssue) => void
  onIgnore: (issue: CanvasProfileIssue, reason: IgnoreReason) => void
  onClose: () => void
}) {
  return (
    <div
      className="publish-blocked-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="publish-blocked-dialog" role="dialog" aria-modal="true" aria-label="Publish blocked">
        <header>
          <div>
            <span className="validation-panel-kicker">Publish</span>
            <h2>Export blocked</h2>
            <p>{label} is blocked while these issues are open. Ignore one with a reason or show it on the canvas.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close export block">
            <X size={16} />
          </button>
        </header>
        <div className="publish-blocked-list">
          {issues.map((issue) => (
            <BlockedIssue
              key={`${issue.code}:${issue.nodeId ?? issue.edgeId ?? 'canvas'}:${issue.fieldKey ?? ''}`}
              issue={issue}
              onShow={() => onShow(issue)}
              onIgnore={(reason) => onIgnore(issue, reason)}
            />
          ))}
          {issues.length === 0 && (
            <div className="publish-blocked-empty">
              <AlertTriangle size={18} />
              <span>No open issues. Try the export again.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
