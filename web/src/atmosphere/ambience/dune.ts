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

function composeDune(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.88, 0.4, 0.5)
  const shimmer = echo(context, master, 0.44, 0.35, 0.35)
  const ambience = noiseBuffer(context)
  const bar = (60 / 52) * 4
  const chords = [[45, 52, 57], [41, 48, 53], [43, 50, 55], [40, 47, 52]]
  const sparkle = [81, 79, 77, 79, 84, 81, 79, 77]

  // Evolving desert wind: the filter slowly sweeps across the full loop.
  const wind = context.createBufferSource()
  wind.buffer = ambience
  wind.loop = true
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.Q.value = 0.5
  windFilter.frequency.setValueAtTime(420, 0)
  windFilter.frequency.linearRampToValueAtTime(900, bar * 2.5)
  windFilter.frequency.linearRampToValueAtTime(520, bar * 5)
  windFilter.frequency.linearRampToValueAtTime(760, bar * 8)
  const windLevel = context.createGain()
  windLevel.gain.setValueAtTime(0, 0)
  windLevel.gain.linearRampToValueAtTime(0.05, 1.2)
  windLevel.gain.setValueAtTime(0.05, Math.max(1.2, bar * 8 - 1.2))
  windLevel.gain.linearRampToValueAtTime(0, bar * 8)
  const windPan = context.createStereoPanner()
  windPan.pan.value = -0.35
  wind.connect(windFilter)
  windFilter.connect(windLevel)
  windLevel.connect(windPan)
  windPan.connect(master)
  wind.start(0)
  wind.stop(bar * 8 + 0.05)
  // Fine sand hiss riding above the wind.
  noise(context, master, ambience, 0, bar * 8, 'highpass', 3200, 0.006, 0.15)

  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 1.9, {
        type: index === 0 ? 'sine' : 'triangle',
        gain: index === 0 ? 0.045 : 0.018,
        attack: 1.8,
        release: 2.8,
        detune: index * 3,
        pan: (index - 1) * 0.4,
      })
    }
    // Sub drone an octave below the root.
    tone(context, master, chord[0]! - 12, start, bar * 1.85, {
      type: 'sine',
      gain: 0.05,
      attack: 1.5,
      release: 2.5,
    })
    // Octave shimmer above the fifth.
    tone(context, shimmer, chord[1]! + 24, start + bar * 0.4, 0.6, {
      type: 'sine',
      gain: 0.012,
      attack: 0.05,
      release: 2.2,
      pan: -0.3,
    })
    tone(context, send, chord[2]! + 24, start + bar * 1.15, 0.5, {
      type: 'triangle',
      gain: 0.02,
      attack: 0.02,
      release: 2.4,
      detune: 4,
      pan: 0.35,
    })
    tone(context, send, chord[1]! + 31, start + bar * 1.7, 0.3, {
      type: 'sine',
      gain: 0.012,
      attack: 0.01,
      release: 2,
      detune: -4,
      pan: -0.3,
    })
  }

  for (let barIndex = 0; barIndex < 8; barIndex += 1) {
    const start = barIndex * bar
    // Soft frame-drum pulse on every downbeat, breathing in and out.
    const drum = context.createOscillator()
    const drumLevel = context.createGain()
    drum.type = 'sine'
    drum.frequency.setValueAtTime(90, start)
    drum.frequency.exponentialRampToValueAtTime(48, start + 0.35)
    drumLevel.gain.setValueAtTime(barIndex % 2 === 0 ? 0.05 : 0.032, start)
    drumLevel.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
    drum.connect(drumLevel)
    drumLevel.connect(master)
    drum.start(start)
    drum.stop(start + 0.55)
    // Sparse metallic motif, two notes per bar.
    for (let note = 0; note < 2; note += 1) {
      tone(
        context,
        shimmer,
        sparkle[(barIndex * 2 + note) % sparkle.length]!,
        start + bar * (note === 0 ? 0.25 : 0.75),
        0.35,
        {
          type: 'triangle',
          gain: 0.02,
          attack: 0.01,
          release: 1.6,
          pan: note === 0 ? 0.3 : -0.2,
        },
      )
    }
  }
}

function duneEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.88, 0.4, 0.5)
  const stops = [
    every(context, 7, 16, (at) => {
      liveBurst(context, master, buffer, at, 4 + Math.random() * 3, 'bandpass', 300 + Math.random() * 400, 0.02, (Math.random() - 0.5) * 0.8, 1.5)
    }),
    every(context, 20, 40, (at) => {
      bell(context, send, at, [88, 91, 86][Math.floor(Math.random() * 3)]!, 0.014)
    }),
    every(context, 5, 12, (at) => {
      const count = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i += 1) {
        liveBurst(context, master, buffer, at + i * (0.07 + Math.random() * 0.05), 0.06, 'highpass', 5000, 0.008, 0.2)
      }
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

export const duneSpec: AmbienceSpec = {
  seconds: (60 / 52) * 4 * 8,
  compose: composeDune,
  env: duneEnv,
}
