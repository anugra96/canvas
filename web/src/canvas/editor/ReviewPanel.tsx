import { X } from 'lucide-react'

import type { CanvasProfile, CanvasProfileIssue, Ontology } from '@canvas/contract'

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
  ignoredReasons,
  focusRequest,
  onClose,
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
  ignoredReasons: Map<string, string>
  focusRequest: { key: string; requestId: number } | null
  onClose: () => void
  onFocus: (issue: CanvasProfileIssue) => void
  onIgnore: (issue: CanvasProfileIssue, reason: IgnoreReason) => void
  onRestore: (issue: CanvasProfileIssue) => void
  onPreviewSuggestion: (suggestion: CanvasSuggestion) => void
  onApplySuggestion: (suggestion: CanvasSuggestion) => void
}) {
  return (
    <aside className="validation-tray validation-panel review-panel" aria-label="Review">
      <header className="validation-panel-head review-head">
        <div>
          <span className="validation-panel-kicker">Architecture</span>
          <h2>Review</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close review">
          <X size={16} />
        </button>
      </header>
      <div className="review-tabs" role="tablist" aria-label="Review sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'issues'}
          className={tab === 'issues' ? 'active' : ''}
          onClick={() => onTabChange('issues')}
        >
          Issues <span>{issues.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'fixes'}
          className={tab === 'fixes' ? 'active' : ''}
          onClick={() => onTabChange('fixes')}
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
