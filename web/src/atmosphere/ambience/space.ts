import {
  tone,
  noise,
  noiseBuffer,
  echo,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

function composeSpace(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.62, 0.34, 0.55)
  const ambience = noiseBuffer(context)
  const bar = (60 / 58) * 4
  const chords = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55]]
  const melody = [74, 77, 81, 77, 72, 74, 77, 69]

  noise(context, master, ambience, 0, bar * 8, 'lowpass', 720, 0.035, -0.25)
  // Station hum: a constant low bed for the whole loop.
  tone(context, master, 31, 0, bar * 8, {
    type: 'sine',
    gain: 0.008,
    attack: 2.5,
    release: 2.5,
  })
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 1.85, {
        type: 'sine',
        gain: 0.038,
        attack: 1.4,
        release: 2.2,
        detune: index === 1 ? 5 : -4,
        pan: (index - 1) * 0.32,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 1.8, {
      type: 'sine',
      gain: 0.042,
      attack: 0.9,
      release: 2,
    })
    tone(context, master, chord[0]! - 24, start, bar * 1.8, {
      type: 'sine',
      gain: 0.028,
      attack: 1.6,
      release: 2.4,
    })
    for (let beat = 0; beat < 8; beat += 1) {
      const beatStart = start + beat * (bar / 4)
      if (beat === 0) {
        // Soft heartbeat pulse on every downbeat.
        tone(context, master, chord[0]! - 12, beatStart, 0.3, {
          type: 'sine',
          gain: 0.03,
          attack: 0.02,
          release: 0.6,
        })
      }
      if (chordIndex % 2 === 0 && beat === 0) {
        tone(context, send, melody[(chordIndex + beat) % melody.length]!, beatStart, 0.4, {
          type: 'sine',
          gain: 0.025,
          attack: 0.03,
          release: 1.4,
          pan: 0.3,
        })
      }
      if (beat === 2 || beat === 6) {
        tone(context, send, melody[(chordIndex + beat + 3) % melody.length]! + 12, beatStart, 0.25, {
          type: 'triangle',
          gain: 0.012,
          attack: 0.02,
          release: 1.6,
          pan: beat === 2 ? -0.35 : 0.35,
        })
      }
      if (beat === 4) {
        tone(context, send, melody[(chordIndex + beat) % melody.length]! + 24, beatStart, 0.2, {
          type: 'sine',
          gain: 0.009,
          attack: 0.02,
          release: 1.8,
          pan: -0.2,
        })
      }
    }
  }
}

function spaceEnv(context: AudioContext, master: GainNode): () => void {
  const stops = [
    every(context, 3, 9, (at) => {
      tone(context, master, 60 + Math.floor(Math.random() * 24), at, 0.08, {
        type: 'square',
        gain: 0.006,
        attack: 0.005,
        release: 0.3,
        pan: (Math.random() - 0.5) * 0.9,
      })
    }),
    every(context, 12, 24, (at) => {
      tone(context, master, 31, at, 5, {
        type: 'sine',
        gain: 0.012,
        attack: 2,
        release: 3,
      })
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

export const spaceSpec: AmbienceSpec = {
  seconds: (60 / 58) * 4 * 8,
  compose: composeSpace,
  env: spaceEnv,
}
