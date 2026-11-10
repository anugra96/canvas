import {
  tone,
  noise,
  noiseBuffer,
  echo,
  gliss,
  liveBurst,
  liveBed,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

function composeCyberpunk(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.18, 0.28, 0.4)
  const ambience = noiseBuffer(context)
  const bar = (60 / 96) * 4
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
  const roots = [45, 41, 36, 43]

  noise(context, master, ambience, 0, bar * 16, 'bandpass', 2600, 0.012, 0.2)
  for (let barIndex = 0; barIndex < 16; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const root = roots[barIndex % roots.length]!
    const start = barIndex * bar
    const lift = barIndex % 4 === 3 ? 12 : 0
    for (const [index, note] of chord.entries()) {
      tone(context, master, note + lift, start, bar * 0.9, {
        type: 'sawtooth',
        gain: 0.012,
        attack: 0.25,
        release: 0.9,
        detune: index === 0 ? -6 : 6,
        pan: (index - 1) * 0.25,
      })
    }
    // Sub bass following the root an octave down.
    tone(context, master, root - 12, start, bar * 0.9, {
      type: 'sine',
      gain: 0.026,
      attack: 0.05,
      release: 0.5,
    })
    for (let eighth = 0; eighth < 8; eighth += 1) {
      const note = eighth % 2 === 0 ? root : root + 12
      tone(context, master, note, start + eighth * (bar / 8), 0.12, {
        type: 'square',
        gain: eighth % 2 === 0 ? 0.018 : 0.013,
        attack: 0.005,
        release: 0.14,
      })
      const arpNote = chord[(barIndex + eighth) % chord.length]! + 12 + lift
      tone(context, send, arpNote, start + eighth * (bar / 8), 0.08, {
        type: 'square',
        gain: 0.009,
        attack: 0.004,
        release: 0.2,
        detune: eighth % 2 === 0 ? 4 : -4,
        pan: eighth % 2 === 0 ? 0.25 : -0.25,
      })
    }
    for (let beat = 0; beat < 4; beat += 1) {
      const kick = context.createOscillator()
      const level = context.createGain()
      kick.type = 'sine'
      kick.frequency.setValueAtTime(95, start + beat * (bar / 4))
      kick.frequency.exponentialRampToValueAtTime(64, start + beat * (bar / 4) + 0.18)
      level.gain.setValueAtTime(0.03, start + beat * (bar / 4))
      level.gain.exponentialRampToValueAtTime(0.0001, start + beat * (bar / 4) + 0.26)
      kick.connect(level)
      level.connect(master)
      kick.start(start + beat * (bar / 4))
      kick.stop(start + beat * (bar / 4) + 0.3)
      if (beat === 1 || beat === 3) {
        noise(context, master, ambience, start + beat * (bar / 4), 0.16, 'bandpass', 1900, 0.02, 0)
      } else {
        noise(context, master, ambience, start + beat * (bar / 4) + 0.02, 0.08, 'highpass', 5200, 0.015, 0.3)
      }
      noise(context, master, ambience, start + beat * (bar / 4) + bar / 8, 0.04, 'highpass', 7500, 0.006, beat % 2 === 0 ? 0.2 : -0.2)
    }
  }
}

function cyberpunkEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [liveBed(context, master, buffer, 'highpass', 6000, 0.007, 0)]
  const stops = [
    every(context, 25, 50, (at) => {
      gliss(context, master, at, 620, 920, 2.2, 'sine', 0.006, -0.4)
      gliss(context, master, at + 2.4, 920, 620, 2.2, 'sine', 0.006, -0.4)
    }),
    every(context, 30, 70, (at) => {
      liveBurst(context, master, buffer, at, 4, 'lowpass', 120, 0.03, -0.1, 1.5)
    }),
    every(context, 6, 14, (at) => {
      tone(context, master, 108, at, 0.05, {
        type: 'sawtooth',
        gain: 0.004,
        attack: 0.01,
        release: 0.2,
        pan: 0.4,
      })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

export const cyberpunkSpec: AmbienceSpec = {
  seconds: (60 / 96) * 4 * 16,
  compose: composeCyberpunk,
  env: cyberpunkEnv,
}
