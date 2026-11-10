import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { CanvasProfile, CanvasProfileIssue, Ontology } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'
import type { PrioritizedValidationIssue } from './prioritizeIssues'
import {
  buildValidationGroups,
  type ValidationGroup,
  type ValidationIssueView,
} from './validationPresentation'
import { IGNORE_REASONS, type IgnoreReason } from './validationSuppressions'

export function ProfileValidationTray({
  issues,
  ignoredIssues,
  nodes,
  edges,
  profile,
  ontology,
  ignoredReasons,
  focusRequest,
  onClose,
  onFocus,
  onIgnore,
  onRestore,
}: {
  issues: PrioritizedValidationIssue[]
  ignoredIssues: PrioritizedValidationIssue[]
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  profile: CanvasProfile
  ontology: Ontology
  ignoredReasons: Map<string, string>
  focusRequest: { key: string; requestId: number } | null
  onClose: () => void
  onFocus: (issue: CanvasProfileIssue) => void
  onIgnore: (issue: CanvasProfileIssue, reason: IgnoreReason) => void
  onRestore: (issue: CanvasProfileIssue) => void
}) {
  const activeGroups = useMemo(
    () => buildValidationGroups(issues, nodes, edges, profile, ontology, ignoredReasons),
    [edges, ignoredReasons, issues, nodes, ontology, profile],
  )
  const ignoredGroups = useMemo(
    () => buildValidationGroups(ignoredIssues, nodes, edges, profile, ontology, ignoredReasons),
    [edges, ignoredIssues, ignoredReasons, nodes, ontology, profile],
  )
  const focusGroup = focusRequest
    ? activeGroups.find((group) => group.issues.some((view) => view.key === focusRequest.key))
    : undefined
  const [showIgnored, setShowIgnored] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(() => (
    focusGroup && focusRequest ? focusRequest.key : null
  ))
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => (
    focusGroup ? { [focusGroup.key]: true } : {}
  ))
  const [ignoreDraft, setIgnoreDraft] = useState<{ key: string; reason: IgnoreReason } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const groups = showIgnored ? ignoredGroups : activeGroups

  function toggleGroup(group: ValidationGroup) {
    setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))
  }

  function isExpanded(group: ValidationGroup): boolean {
    return expanded[group.key] ?? false
  }

  function focusView(group: ValidationGroup, view: ValidationIssueView) {
    setActiveKey(view.key)
    setExpanded((current) => ({ ...current, [group.key]: true }))
    onFocus(view.issue)
  }

  return (
    <aside className="validation-tray validation-panel" aria-label="Warnings">
      <header className="validation-panel-head">
        <div>
          <span className="validation-panel-kicker">Architecture</span>
          <h2>Warnings</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close warnings">
          <X size={16} />
        </button>
      </header>

      <div className="validation-minimal-bar">
        <span>{activeGroups.reduce((sum, group) => sum + group.issues.length, 0)} open</span>
        {ignoredIssues.length > 0 && (
          <button
            className="validation-link-button"
            onClick={() => {
              setShowIgnored((current) => !current)
              setActiveKey(null)
            }}
          >
            {showIgnored ? 'Back to warnings' : `Ignored ${ignoredIssues.length}`}
          </button>
        )}
      </div>

      <div className="validation-panel-body" ref={bodyRef}>
        {groups.length === 0 ? (
          <div className="validation-empty">
            <CheckCircle2 size={24} />
            <strong>{showIgnored ? 'No ignored warnings' : 'No warnings'}</strong>
          </div>
        ) : groups.map((group) => (
          <section key={group.key} className={`validation-group ${group.severity}`}>
            <button
              className="validation-group-toggle"
              onClick={() => toggleGroup(group)}
              aria-expanded={isExpanded(group)}
            >
              {group.severity === 'error'
                ? <AlertCircle size={17} />
                : <AlertTriangle size={17} />}
              <span className="validation-group-title">
                <strong>{group.label}</strong>
                <span>{group.why}</span>
              </span>
              <span className="validation-group-count">{group.issues.length}</span>
              <ChevronDown className={isExpanded(group) ? 'expanded' : ''} size={17} />
            </button>

            {isExpanded(group) && (
              <div className="validation-group-body">
                {group.issues.map((view) => {
                  const repair = view.relationRepair
                  return (
                    <div
                      key={view.key}
                      className={`validation-item ${view.issue.severity}${activeKey === view.key ? ' active' : ''}`}
                    >
                      <button
                        className="validation-item-main"
                        onClick={() => focusView(group, view)}
                      >
                        <span className="validation-item-icon">
                          {view.issue.severity === 'error'
                            ? <AlertCircle size={17} />
                            : <AlertTriangle size={17} />}
                        </span>
                        <span className="validation-item-copy">
                          <span className="validation-item-meta">{view.meta}</span>
                          <strong>{view.title}</strong>
                          {activeKey === view.key && !repair && (
                            <span className="validation-item-summary">{view.summary}</span>
                          )}
                          {showIgnored && view.ignoredReason && (
                            <span className="validation-item-ignore-reason">
                              Ignored: {view.ignoredReason}
                            </span>
                          )}
                        </span>
                        {activeKey !== view.key && <ChevronRight size={16} />}
                      </button>

                      {showIgnored ? (
                        <div className="validation-item-actions">
                          <button
                            className="validation-link-button"
                            onClick={() => onRestore(view.issue)}
                          >
                            Restore
                          </button>
                        </div>
                      ) : activeKey === view.key ? (
                        <div className="validation-editor">
                          {repair && (
                            <span className="validation-hint">
                              {repair.choices.length === 0 && repair.reverseChoices.length === 0
                                ? 'No legal relation for these card types.'
                                : 'Select the link, then use the relation and reverse controls.'}
                            </span>
                          )}
                          {view.issue.severity === 'warning' && (
                            ignoreDraft?.key === view.key ? (
                              <div className="validation-ignore-form">
                                <select
                                  aria-label={`Ignore reason for ${view.title}`}
                                  value={ignoreDraft.reason}
                                  onChange={(event) => setIgnoreDraft({
                                    key: view.key,
                                    reason: event.target.value as IgnoreReason,
                                  })}
                                >
                                  {IGNORE_REASONS.map((reason) => (
                                    <option key={reason} value={reason}>{reason}</option>
                                  ))}
                                </select>
                                <button
                                  className="validation-link-button"
                                  onClick={() => {
                                    onIgnore(view.issue, ignoreDraft.reason)
                                    setIgnoreDraft(null)
                                  }}
                                >
                                  Ignore
                                </button>
                                <button
                                  className="validation-link-button muted"
                                  onClick={() => setIgnoreDraft(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className="validation-link-button"
                                onClick={() => setIgnoreDraft({
                                  key: view.key,
                                  reason: IGNORE_REASONS[0],
                                })}
                              >
                                Ignore this warning
                              </button>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </aside>
  )
}
