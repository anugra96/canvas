import {
  EDGE_STYLES,
  setEdgeStyle,
  useEdgeStyle,
  type EdgeStyle,
} from './canvas/model/edgeStyle'
import { sceneForTheme } from './atmosphere/registry'
import { setBackdropEnabled, useBackdropEnabled } from './atmosphere/backdropPreference'
import { useTheme } from './themes'
import { ThemePicker } from './ThemePicker'
import { AmbiencePicker } from './AmbiencePicker'

export function AppearanceControls() {
  const theme = useTheme()
  const edgeStyle = useEdgeStyle()
  const backdropEnabled = useBackdropEnabled()
  const hasBackdrop = sceneForTheme(theme) !== null

  return (
    <div className="appearance-controls">
      <ThemePicker />
      {hasBackdrop && (
        <label className="appearance-toggle">
          <input
            type="checkbox"
            checked={backdropEnabled}
            onChange={(event) => setBackdropEnabled(event.target.checked)}
          />
          <span>Backdrop</span>
        </label>
      )}
      <AmbiencePicker />
      <label className="appearance-field">
        <span>Edge path</span>
        <select
          className="template-select"
          aria-label="Edge path style"
          value={edgeStyle}
          onChange={(event) => setEdgeStyle(event.target.value as EdgeStyle)}
        >
          {EDGE_STYLES.map((style) => (
            <option key={style.id} value={style.id}>{style.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
