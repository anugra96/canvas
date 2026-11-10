import { ChevronDown, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

import type { CanvasSuggestion } from '../suggestions/suggestionEngine'

export function CanvasIntelligencePanel({
  suggestions,
  onClose,
  onPreviewSuggestion,
  onApplySuggestion,
}: {
  suggestions: CanvasSuggestion[]
  onClose: () => void
  onPreviewSuggestion: (suggestion: CanvasSuggestion) => void
  onApplySuggestion: (suggestion: CanvasSuggestion) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <aside className="validation-tray validation-panel intelligence-panel" aria-label="Canvas intelligence">
      <header className="validation-panel-head">
        <div>
          <span className="validation-panel-kicker">Canvas intelligence</span>
          <h2>Suggested fixes</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close canvas intelligence">
          <X size={16} />
        </button>
      </header>

      <div className="validation-panel-body validation-suggestions-body">
        {suggestions.length === 0 ? (
          <div className="validation-empty">
            <Sparkles size={26} />
            <strong>No suggested fixes</strong>
            <span>Use Warnings to review the remaining checks.</span>
          </div>
        ) : suggestions.map((suggestion) => {
          const isOpen = expanded[suggestion.id] ?? false
          return (
            <div className="validation-suggestion-card" key={suggestion.id}>
              <button
                className="validation-suggestion-toggle"
                onClick={() => setExpanded((current) => ({
                  ...current,
                  [suggestion.id]: !isOpen,
                }))}
                aria-expanded={isOpen}
              >
                <span className="validation-suggestion-icon">
                  <Sparkles size={18} />
                </span>
                <span className="validation-suggestion-copy">
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.description}</span>
                </span>
                <span className="validation-suggestion-count">{suggestion.count}</span>
                <ChevronDown className={isOpen ? 'expanded' : ''} size={18} />
              </button>

              {isOpen && (
                <div className="validation-suggestion-items">
                  {suggestion.items.map((item) => (
                    <div className="validation-suggestion-item" key={item.id}>
                      <span className="validation-suggestion-item-title">{item.title}</span>
                      <div className="validation-suggestion-actions">
                        <button
                          className="validation-show-button"
                          onClick={() => onPreviewSuggestion({
                            ...suggestion,
                            items: [item],
                          })}
                        >
                          Show
                        </button>
                        <button
                          className="button primary validation-apply"
                          onClick={() => onApplySuggestion({
                            ...suggestion,
                            items: [item],
                          })}
                        >
                          Fix
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
