import { useRef, useState, type KeyboardEvent } from 'react'

import { findTheme } from './atmosphere/registry'
import { setTheme, THEMES, useTheme, type ThemeId } from './themes'

export function ThemePicker() {
  const theme = useTheme()
  const activeIndex = Math.max(0, THEMES.findIndex((candidate) => candidate.id === theme))
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const rovingIndex = focusIndex ?? activeIndex
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const current = findTheme(theme) ?? THEMES[0]

  function select(index: number) {
    const candidate = THEMES[index]
    if (!candidate) return
    setFocusIndex(index)
    setTheme(candidate.id as ThemeId)
  }

  function moveFocus(index: number) {
    if (index < 0 || index >= THEMES.length) return
    setFocusIndex(index)
    buttons.current[index]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveFocus(Math.min(THEMES.length - 1, index + 1))
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveFocus(Math.max(0, index - 1))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(Math.min(THEMES.length - 1, index + 7))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(Math.max(0, index - 7))
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveFocus(THEMES.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(index)
    }
  }

  return (
    <div className="theme-picker">
      <span className="theme-current">{current.label}</span>
      <div className="theme-grid" role="radiogroup" aria-label="Color theme">
        {THEMES.map((candidate, index) => (
          <button
            key={candidate.id}
            ref={(element) => { buttons.current[index] = element }}
            type="button"
            role="radio"
            aria-checked={candidate.id === theme}
            aria-label={candidate.label}
            title={`${candidate.label} — ${candidate.description}`}
            tabIndex={index === rovingIndex ? 0 : -1}
            className={`theme-swatch${candidate.id === theme ? ' active' : ''}`}
            style={{ backgroundColor: candidate.themeColor }}
            onClick={() => select(index)}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {'scene' in candidate && candidate.scene && (
              <span className="theme-swatch-scenic" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
