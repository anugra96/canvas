import {
  tone,
  noise,
  noiseBuffer,
  echo,
  bell,
  liveBurst,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

function composeMedieval(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.32, 0.3, 0.42)
  const ambience = noiseBuffer(context)
  const bar = (60 / 84) * 4
  const chords = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]
  const melody = [74, 77, 79, 81, 79, 77, 74, 72, 74, 77, 81, 84]

  noise(context, master, ambience, 0, bar * 12, 'highpass', 1600, 0.008, 0.25)
  for (let barIndex = 0; barIndex < 12; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const start = barIndex * bar
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 0.9, {
        type: 'triangle',
        gain: 0.018,
        attack: 0.35,
        release: 1.2,
        detune: index === 0 ? -5 : 5,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 7, start, bar * 0.9, {
      type: 'sine',
      gain: 0.028,
      attack: 0.5,
      release: 1.4,
    })
    // Low root drone grounding each bar.
    tone(context, master, chord[0]! - 12, start, bar * 0.9, {
      type: 'sine',
      gain: 0.03,
      attack: 0.7,
      release: 1.6,
    })
    for (let beat = 0; beat < 4; beat += 1) {
      if (beat === 0 || beat === 2) {
        // Frame drum: strong downbeat, softer answer.
        const drum = context.createOscillator()
        const drumLevel = context.createGain()
        drum.type = 'sine'
        drum.frequency.setValueAtTime(82, start + beat * (bar / 4))
        drum.frequency.exponentialRampToValueAtTime(46, start + beat * (bar / 4) + 0.3)
        drumLevel.gain.setValueAtTime(beat === 0 ? 0.045 : 0.028, start + beat * (bar / 4))
        drumLevel.gain.exponentialRampToValueAtTime(0.0001, start + beat * (bar / 4) + 0.45)
        drum.connect(drumLevel)
        drumLevel.connect(master)
        drum.start(start + beat * (bar / 4))
        drum.stop(start + beat * (bar / 4) + 0.5)
      }
      if (beat % 2 === 0) {
        tone(context, send, melody[(barIndex * 2 + beat / 2) % melody.length]!, start + beat * (bar / 4), 0.18, {
          type: 'triangle',
          gain: 0.032,
          attack: 0.008,
          release: 0.8,
          pan: 0.25,
        })
      }
      if (beat === 3 && barIndex % 2 === 1) {
        // Counter-melody answering an octave down on odd bars.
        tone(context, send, melody[(barIndex * 2) % melody.length]! - 12, start + beat * (bar / 4), 0.22, {
          type: 'triangle',
          gain: 0.022,
          attack: 0.01,
          release: 1,
          pan: -0.3,
        })
      }
    }
  }
}

function medievalEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.5, 0.35, 0.4)
  const stops = [
    every(context, 0.2, 0.8, (at) => {
      liveBurst(context, master, buffer, at, 0.03 + Math.random() * 0.06, 'bandpass', 1500 + Math.random() * 2000, 0.004 + Math.random() * 0.008, (Math.random() - 0.5) * 0.6)
    }),
    every(context, 10, 22, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 2, 'lowpass', 400, 0.02, 0, 1.5)
    }),
    every(context, 25, 55, (at) => {
      const pan = (Math.random() - 0.5) * 0.8
      tone(context, send, 65, at, 0.25, { type: 'sine', gain: 0.012, attack: 0.03, release: 0.3, pan })
      tone(context, send, 62, at + 0.45, 0.35, { type: 'sine', gain: 0.012, attack: 0.03, release: 0.4, pan })
    }),
    every(context, 40, 80, (at) => {
      bell(context, send, at, [69, 65, 67][Math.floor(Math.random() * 3)]!, 0.012)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

export const medievalSpec: AmbienceSpec = {
  seconds: (60 / 84) * 4 * 12,
  compose: composeMedieval,
  env: medievalEnv,
}
