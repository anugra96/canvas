import {
  tone,
  noise,
  noiseBuffer,
  echo,
  liveBed,
  liveDrone,
  every,
  createMaster,
  passingVehicle,
} from './engine'
import type { AmbienceSpec } from './engine'

function composeNightbus(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.5, 0.35, 0.45)
  const ambience = noiseBuffer(context)
  const bar = (60 / 64) * 4
  const chords = [[41, 48, 53], [39, 46, 53]]

  tone(context, master, 29, 0, bar * 10, {
    type: 'sine',
    gain: 0.02,
    attack: 3,
    release: 3,
  })
  noise(context, master, ambience, 0, bar * 10, 'lowpass', 150, 0.04, 0)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 5
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 4.8, {
        type: 'triangle',
        gain: 0.015,
        attack: 1.2,
        release: 2.4,
        detune: index * 3,
        pan: (index - 1) * 0.3,
      })
    }
  }
  for (let barIndex = 0; barIndex < 10; barIndex += 1) {
    const start = barIndex * bar
    if (barIndex % 2 === 0) {
      tone(context, master, 29, start, 0.3, {
        type: 'sine',
        gain: 0.03,
        attack: 0.02,
        release: 0.5,
      })
    }
    if (barIndex === 2 || barIndex === 7) {
      tone(context, send, 81, start + bar / 4, 0.35, {
        type: 'sine',
        gain: 0.02,
        attack: 0.01,
        release: 1.5,
        pan: 0.2,
      })
      tone(context, send, 76, start + bar / 4 + 0.45, 0.4, {
        type: 'sine',
        gain: 0.02,
        attack: 0.01,
        release: 1.8,
        pan: 0.2,
      })
    }
  }
}

function nightbusEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [
    liveDrone(context, master, 29, 0.018),
    liveBed(context, master, buffer, 'lowpass', 120, 0.035, 0),
    liveBed(context, master, buffer, 'highpass', 7000, 0.004, 0.2),
  ]
  const stops = [
    every(context, 18, 40, (at) => {
      passingVehicle(context, master, buffer, at, 900 + Math.random() * 500, 3.5, 0.02, (Math.random() - 0.5) * 0.9)
    }),
    every(context, 45, 90, (at) => {
      tone(context, master, 81, at, 0.35, { type: 'sine', gain: 0.016, attack: 0.01, release: 1.5, pan: 0.2 })
      tone(context, master, 76, at + 0.5, 0.4, { type: 'sine', gain: 0.016, attack: 0.01, release: 1.8, pan: 0.2 })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

export const nightbusSpec: AmbienceSpec = {
  seconds: (60 / 64) * 4 * 10,
  compose: composeNightbus,
  env: nightbusEnv,
}
