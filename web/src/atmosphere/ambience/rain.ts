import {
  tone,
  noise,
  noiseBuffer,
  echo,
  liveBurst,
  liveBed,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

function composeRain(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.42, 0.4, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 72) * 4
  const chords = [[45, 52, 57], [41, 48, 55], [43, 50, 57], [40, 47, 53]]
  const plinks = [76, 79, 81, 84, 86, 88]

  noise(context, master, ambience, 0, bar * 12, 'bandpass', 4500, 0.018, -0.2)
  noise(context, master, ambience, 0, bar * 12, 'lowpass', 400, 0.025, 0.2)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 3
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.8, {
        type: 'sine',
        gain: 0.033,
        attack: 1.5,
        release: 2.2,
        detune: index === 1 ? 4 : -4,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 2.8, {
      type: 'sine',
      gain: 0.04,
      attack: 1.2,
      release: 2.4,
    })
  }
  for (let barIndex = 0; barIndex < 12; barIndex += 1) {
    const start = barIndex * bar
    const beats = [0, 1.5, 2.5]
    for (const [pluck, beat] of beats.entries()) {
      tone(context, send, plinks[(barIndex * 3 + pluck * 2) % plinks.length]!, start + beat * (bar / 4), 0.1, {
        type: 'sine',
        gain: 0.014,
        attack: 0.005,
        release: 0.9,
        pan: pluck % 2 === 0 ? 0.3 : -0.3,
      })
    }
  }
}

function rainEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [
    liveBed(context, master, buffer, 'highpass', 5000, 0.012, 0),
    liveBed(context, master, buffer, 'lowpass', 400, 0.02, 0),
  ]
  const stops = [
    every(context, 20, 50, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 3, 'lowpass', 90, 0.05, 0, 0.8)
    }),
    every(context, 2, 7, (at) => {
      tone(context, master, 80 + Math.floor(Math.random() * 12), at, 0.05, {
        type: 'sine',
        gain: 0.01,
        attack: 0.005,
        release: 0.5,
        pan: (Math.random() - 0.5) * 0.9,
      })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

export const rainSpec: AmbienceSpec = {
  seconds: (60 / 72) * 4 * 12,
  compose: composeRain,
  env: rainEnv,
}
