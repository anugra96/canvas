import { Volume2, VolumeX } from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'

import {
  AMBIENCES,
  currentAmbience,
  isAmbienceId,
  readVolume,
  setAmbienceVolume,
  startAmbience,
  stopAmbience,
  subscribeAmbience,
} from './atmosphere/ambience'

export function AmbiencePicker() {
  const active = useSyncExternalStore(subscribeAmbience, currentAmbience, () => '')
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(volume === 0)
  const lastVolume = useRef(volume > 0 ? volume : 0.8)


  function changeVolume(value: number) {
    setVolume(value)
    if (value > 0) {
      lastVolume.current = value
      setMuted(false)
    } else {
      setMuted(true)
    }
    setAmbienceVolume(value)
  }

  function toggleMute() {
    if (muted || volume === 0) changeVolume(lastVolume.current || 0.8)
    else changeVolume(0)
  }

  async function change(value: string) {
    if (!value) {
      stopAmbience()
      return
    }
    if (!isAmbienceId(value)) return
    try {
      await startAmbience(value)
    } catch {
      // The global ambience store remains off when loading fails.
    }
  }

  return (
    <div className="ambience-picker" title="Background ambience">
      <select
        className="ambience-select"
        aria-label="Background ambience"
        value={active}
        onChange={(event) => void change(event.target.value)}
      >
        <option value="">Ambience off</option>
        {AMBIENCES.map((ambience) => (
          <option key={ambience.id} value={ambience.id} title={ambience.description}>
            {ambience.label}
          </option>
        ))}
      </select>
      <div className="ambience-controls-row">
        <button
          type="button"
          className="appearance-icon-button ambience-mute"
          aria-label={muted ? 'Unmute ambience' : 'Mute ambience'}
          title={muted ? 'Unmute ambience' : 'Mute ambience'}
          aria-pressed={muted}
          disabled={!active}
          onClick={toggleMute}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Ambience volume"
          aria-valuetext={`${Math.round(volume * 100)}%`}
          onChange={(event) => changeVolume(Number(event.target.value) / 100)}
        />
        <span className="ambience-volume-value">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  )
}
