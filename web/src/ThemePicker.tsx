import { Palette } from 'lucide-react'
import { setTheme, THEMES, useTheme, type ThemeId } from './themes'

export function ThemePicker() {
  const theme = useTheme()

  return (
    <label className="theme-picker" title="Color theme">
      <Palette size={14} aria-hidden="true" />
      <select
        aria-label="Color theme"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeId)}
      >
        {THEMES.map((candidate) => (
          <option key={candidate.id} value={candidate.id} title={candidate.description}>{candidate.label}</option>
        ))}
      </select>
    </label>
  )
}
