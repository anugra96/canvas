import { Music2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  AMBIENCES,
  isAmbienceId,
  readVolume,
  setAmbienceVolume,
  startAmbience,
  stopAmbience,
  type AmbienceId,
} from './ambience/ambience'

export function AmbiencePicker() {
  const [active, setActive] = useState<AmbienceId | ''>('')
  const [volume, setVolume] = useState(readVolume)

  useEffect(() => stopAmbience, [])

  function changeVolume(value: number) {
    setVolume(value)
    setAmbienceVolume(value)
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
    <span className="ambience-picker" title="Background ambience">
      <label className="ambience-select">
        <Music2 size={14} aria-hidden="true" />
        <select
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
      </label>
      <label className="ambience-volume" title="Ambience volume">
        <span aria-hidden="true">Vol</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Ambience volume"
          onChange={(event) => changeVolume(Number(event.target.value) / 100)}
        />
      </label>
    </span>
  )
}
