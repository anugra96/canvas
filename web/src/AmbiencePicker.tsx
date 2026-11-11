import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  AMBIENCES,
  currentAmbience,
  isAmbienceId,
  readVolume,
  setAmbienceVolume,
  startAmbience,
  stopAmbience,
  type AmbienceId,
} from './atmosphere/ambience'

export function AmbiencePicker() {
  const [active, setActive] = useState<AmbienceId | ''>(currentAmbience)
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(volume === 0)
  const lastVolume = useRef(volume > 0 ? volume : 0.8)

  useEffect(() => stopAmbience, [])

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
      setActive('')
      return
    }
    if (!isAmbienceId(value)) return
    setActive(value)
    try {
      await startAmbience(value)
    } catch {
      setActive('')
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
        onChange={(event) => changeVolume(Number(event.target.value) / 100)}
      />
    </div>
  )
}
