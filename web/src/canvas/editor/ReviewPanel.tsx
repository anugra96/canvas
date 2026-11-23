import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'

import {
  REVIEW_MODES,
  REVIEW_MODE_LABELS,
  type CanvasProfile,
  type CanvasProfileIssue,
  type LevelReadiness,
  type Ontology,
  type ReviewMode,
} from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'
import type { CanvasSuggestion } from '../suggestions/suggestionEngine'
import { CanvasIntelligencePanel } from './CanvasIntelligencePanel'
import { ProfileValidationTray } from './ProfileValidationTray'
import type { PrioritizedValidationIssue } from './prioritizeIssues'
import type { IgnoreReason } from './validationSuppressions'

export type ReviewTab = 'issues' | 'fixes'

export function ReviewPanel({
  tab,
  onTabChange,
  issues,
  ignoredIssues,
  suggestions,
  nodes,
  edges,
  profile,
  ontology,
  reviewMode,
  hiddenByModeCount,
  levelReadiness,
  ignoredReasons,
  focusRequest,
  onClose,
  onReviewModeChange,
  districtsEnabled,
  onDistrictsEnabledChange,
  onOpenLevel,
  onFocus,
  onIgnore,
  onRestore,
  onPreviewSuggestion,
  onApplySuggestion,
}: {
  tab: ReviewTab
  onTabChange: (tab: ReviewTab) => void
  issues: PrioritizedValidationIssue[]
  ignoredIssues: PrioritizedValidationIssue[]
  suggestions: CanvasSuggestion[]
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  profile: CanvasProfile
  ontology: Ontology
  reviewMode: ReviewMode
  hiddenByModeCount: number
  levelReadiness: LevelReadiness[]
  ignoredReasons: Map<string, string>
  focusRequest: { key: string; requestId: number } | null
  onClose: () => void
  onReviewModeChange: (mode: ReviewMode) => void
  districtsEnabled: boolean
  onDistrictsEnabledChange: (enabled: boolean) => void
  onOpenLevel: (level: LevelReadiness['level']) => void
  onFocus: (issue: CanvasProfileIssue) => void
  onIgnore: (issue: CanvasProfileIssue, reason: IgnoreReason) => void
  onRestore: (issue: CanvasProfileIssue) => void
  onPreviewSuggestion: (suggestion: CanvasSuggestion) => void
  onApplySuggestion: (suggestion: CanvasSuggestion) => void
}) {
  const issuesRef = useRef<HTMLButtonElement>(null)
  const fixesRef = useRef<HTMLButtonElement>(null)
  const tabOrder: ReviewTab[] = ['issues', 'fixes']
  const reviewModesAvailable = profile.id !== 'raw'

  function selectTab(next: ReviewTab) {
    onTabChange(next)
    const target = next === 'issues' ? issuesRef.current : fixesRef.current
    target?.focus()
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabOrder.indexOf(tab)
    let next: ReviewTab | undefined
    if (event.key === 'ArrowRight') next = tabOrder[(index + 1) % tabOrder.length]
    else if (event.key === 'ArrowLeft') next = tabOrder[(index - 1 + tabOrder.length) % tabOrder.length]
    else if (event.key === 'Home') next = tabOrder[0]
    else if (event.key === 'End') next = tabOrder.at(-1)
    if (!next) return
    event.preventDefault()
    event.stopPropagation()
    selectTab(next)
  }

  return (
    <aside className="validation-tray validation-panel review-panel" aria-label="Review">
      <header className="validation-panel-head review-head">
        <div>
          <span className="validation-panel-kicker">Architecture</span>
          <h2>Review</h2>
        </div>
        <div className="review-head-controls">
          {reviewModesAvailable && (
            <label className="review-mode">
              <span>Mode</span>
              <select
                aria-label="Review mode"
                value={reviewMode}
                onChange={(event) => onReviewModeChange(event.target.value as ReviewMode)}
              >
                {REVIEW_MODES.map((mode) => (
                  <option key={mode} value={mode}>{REVIEW_MODE_LABELS[mode]}</option>
                ))}
              </select>
            </label>
          )}
          {profile.id === 'systems' && (
            <button
              type="button"
              className="review-districts"
              aria-pressed={districtsEnabled}
              title={districtsEnabled
                ? 'Turn off districts: hide district controls and zoning checks on this canvas'
                : 'Turn on districts: district controls and zoning checks'}
              onClick={() => onDistrictsEnabledChange(!districtsEnabled)}
            >
              Districts
            </button>
          )}
          {hiddenByModeCount > 0 && (
            <span className="review-hidden">
              {hiddenByModeCount} hidden by {REVIEW_MODE_LABELS[reviewMode]}
            </span>
          )}
          <button className="icon-button" onClick={onClose} aria-label="Close review">
            <X size={16} />
          </button>
        </div>
      </header>
      {levelReadiness.some((entry) => entry.available) && (
        <section className="review-views" aria-label="View readiness">
          <h3>Views</h3>
          {levelReadiness.filter((entry) => entry.available).map((entry) => (
            <button
              key={entry.level}
              type="button"
              className={`review-view-level ${entry.ready ? 'ready' : 'unready'}`}
              onClick={() => onOpenLevel(entry.level)}
            >
              {entry.ready
                ? <CheckCircle2 size={15} />
                : <AlertTriangle size={15} />}
              <span>Level {entry.level} {entry.name}</span>
              <small>
                {entry.ready
                  ? 'Ready'
                  : `${entry.unassigned.length} ${entry.unassigned.length === 1 ? 'card' : 'cards'} unassigned`}
              </small>
            </button>
          ))}
        </section>
      )}
      <div className="review-tabs" role="tablist" aria-label="Review sections">
        <button
          ref={issuesRef}
          type="button"
          role="tab"
          aria-selected={tab === 'issues'}
          tabIndex={tab === 'issues' ? 0 : -1}
          className={tab === 'issues' ? 'active' : ''}
          onClick={() => onTabChange('issues')}
          onKeyDown={handleTabKeyDown}
        >
          Issues <span>{issues.length}</span>
        </button>
        <button
          ref={fixesRef}
          type="button"
          role="tab"
          aria-selected={tab === 'fixes'}
          tabIndex={tab === 'fixes' ? 0 : -1}
          className={tab === 'fixes' ? 'active' : ''}
          onClick={() => onTabChange('fixes')}
          onKeyDown={handleTabKeyDown}
        >
          Fixes <span>{suggestions.length}</span>
        </button>
      </div>
      {tab === 'issues' ? (
        <ProfileValidationTray
          key={focusRequest?.requestId ?? 'issues'}
          issues={issues}
          ignoredIssues={ignoredIssues}
          nodes={nodes}
          edges={edges}
          profile={profile}
          ontology={ontology}
          ignoredReasons={ignoredReasons}
          focusRequest={focusRequest}
          embedded
          onFocus={onFocus}
          onIgnore={onIgnore}
          onRestore={onRestore}
        />
      ) : (
        <CanvasIntelligencePanel
          suggestions={suggestions}
          embedded
          onPreviewSuggestion={onPreviewSuggestion}
          onApplySuggestion={onApplySuggestion}
          onClose={() => {}}
        />
      )}
    </aside>
  )
}
