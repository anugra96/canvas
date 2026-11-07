import { AlertTriangle, X } from 'lucide-react'

import type { CanvasProfileIssue } from '@canvas/contract'

export function ProfileValidationTray({
  issues,
  onClose,
  onFocus,
}: {
  issues: CanvasProfileIssue[]
  onClose: () => void
  onFocus: (issue: CanvasProfileIssue) => void
}) {
  return (
    <aside className="validation-tray" aria-label="Systems validation">
      <header>
        <span>Systems validation</span>
        <button className="icon-button" onClick={onClose} aria-label="Close validation">
          <X size={13} />
        </button>
      </header>
      {issues.length === 0
        ? <p>No architecture warnings.</p>
        : (
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}>
                <button className="validation-issue" onClick={() => onFocus(issue)}>
                  <AlertTriangle size={13} />
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </aside>
  )
}
