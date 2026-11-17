import { Volume2, VolumeX } from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'

import {
  AMBIENCES,
  currentAmbience,
  focusPaused,
  isAmbienceId,
  readFocusDelivery,
  readFocusLevel,
  readFocusTone,
  readTuning,
  readVolume,
  resumeFocus,
  setAmbienceTuning,
  setAmbienceVolume,
  setFocusDelivery,
  setFocusLevel,
  setFocusTone,
  startAmbience,
  stopAmbience,
  subscribeAmbience,
} from './atmosphere/ambience'
import type { FocusDelivery, FocusTone, Tuning } from './atmosphere/ambience/focus'

export function AmbiencePicker() {
  const active = useSyncExternalStore(subscribeAmbience, currentAmbience, () => '')
  const paused = useSyncExternalStore(subscribeAmbience, focusPaused, () => false)
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(volume === 0)
  const [focusTone, setFocusToneState] = useState(readFocusTone)
  const [delivery, setDeliveryState] = useState(readFocusDelivery)
  const [focusLevel, setFocusLevelState] = useState(readFocusLevel)
  const [tuning, setTuningState] = useState(readTuning)
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

  function changeFocusTone(value: string) {
    const next: FocusTone = value === 'alpha' || value === 'beta' || value === 'gamma' ? value : 'off'
    setFocusToneState(next)
    setFocusTone(next)
  }

  function changeDelivery(value: string) {
    const next: FocusDelivery = value === 'isochronic' ? 'isochronic' : 'binaural'
    setDeliveryState(next)
    setFocusDelivery(next)
  }

  function changeFocusLevel(value: number) {
    const next = Math.min(1, Math.max(0, value))
    setFocusLevelState(next)
    setFocusLevel(next)
  }

  function changeTuning(value: string) {
    const next: Tuning = value === '432' ? 432 : 440
    setTuningState(next)
    void setAmbienceTuning(next).catch(() => {
      // The previous tuning keeps playing if the scene cannot be re-rendered.
    })
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
      <div className="focus-controls">
        <label className="focus-field">
          <span>Focus tones</span>
          <select
            aria-label="Focus tones"
            value={focusTone}
            onChange={(event) => changeFocusTone(event.target.value)}
          >
            <option value="off">Off</option>
            <option value="alpha">Alpha</option>
            <option value="beta">Beta</option>
            <option value="gamma">Gamma</option>
          </select>
        </label>
        <label className="focus-field">
          <span>Delivery</span>
          <select
            aria-label="Delivery"
            value={delivery}
            onChange={(event) => changeDelivery(event.target.value)}
          >
            <option value="binaural">Headphones (binaural)</option>
            <option value="isochronic">Speakers (isochronic)</option>
          </select>
        </label>
        <div className="focus-level-row">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(focusLevel * 100)}
            aria-label="Focus level"
            aria-valuetext={`${Math.round(focusLevel * 100)}%`}
            onChange={(event) => changeFocusLevel(Number(event.target.value) / 100)}
          />
          <span className="focus-level-value">{Math.round(focusLevel * 100)}%</span>
        </div>
        <label className="focus-field">
          <span>Tuning</span>
          <select
            aria-label="Tuning"
            value={tuning}
            onChange={(event) => changeTuning(event.target.value)}
          >
            <option value="440">Standard (A = 440 Hz)</option>
            <option value="432">432 Hz (A = 432 Hz)</option>
          </select>
        </label>
        {paused && (
          <div className="focus-paused" role="status">
            <span>Focus tones paused after 60 minutes</span>
            <button type="button" onClick={resumeFocus}>Resume</button>
          </div>
        )}
        <p className="focus-caution">
          Avoid if you have epilepsy or a seizure history. Stop if you feel discomfort.
        </p>
        {delivery === 'binaural' && <p className="focus-caution">Keep the volume low.</p>}
        <p className="focus-evidence">Some people find these help them focus. Evidence is mixed.</p>
        {tuning === 432 && <p className="focus-evidence">A slightly lower, warmer tuning.</p>}
      </div>
    </div>
  )
}
