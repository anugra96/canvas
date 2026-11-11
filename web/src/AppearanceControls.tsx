import { CornerDownRight, Minus, Spline, Waves, type LucideIcon } from 'lucide-react'

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

const EDGE_ICONS: Record<EdgeStyle, LucideIcon> = {
  bezier: Spline,
  straight: Minus,
  step: CornerDownRight,
  smoothstep: Waves,
}

export function AppearanceControls() {
  const theme = useTheme()
  const edgeStyle = useEdgeStyle()
  const backdropEnabled = useBackdropEnabled()
  const hasBackdrop = sceneForTheme(theme) !== null

  return (
    <div className="appearance-controls">
      <div className="appearance-row">
        <span className="appearance-label">Theme</span>
        <div className="appearance-value">
          <ThemePicker />
        </div>
      </div>
      {hasBackdrop && (
        <div className="appearance-row">
          <span className="appearance-label">Backdrop</span>
          <div className="appearance-value appearance-value-center">
            <button
              type="button"
              className="appearance-switch"
              role="switch"
              aria-label="Backdrop"
              aria-checked={backdropEnabled}
              title={backdropEnabled ? 'Backdrop on' : 'Backdrop off'}
              onClick={() => setBackdropEnabled(!backdropEnabled)}
            />
          </div>
        </div>
      )}
      <div className="appearance-row">
        <span className="appearance-label">Ambience</span>
        <div className="appearance-value">
          <AmbiencePicker />
        </div>
      </div>
      <div className="appearance-row">
        <span className="appearance-label">Edge style</span>
        <div className="appearance-value">
          <div className="edge-style-control" role="group" aria-label="Edge path style">
            {EDGE_STYLES.map((style) => {
              const Icon = EDGE_ICONS[style.id]
              return (
                <button
                  key={style.id}
                  type="button"
                  className="edge-style-option"
                  aria-label={style.label}
                  title={style.label}
                  aria-pressed={edgeStyle === style.id}
                  onClick={() => setEdgeStyle(style.id)}
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
