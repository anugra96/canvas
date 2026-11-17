import { midiToHz } from './engine'

export type FocusTone = 'off' | 'alpha' | 'beta' | 'gamma'
export type FocusDelivery = 'binaural' | 'isochronic'
export type Tuning = 440 | 432

export const FOCUS_PEAK_GAIN = 10 ** (-24 / 20)
export const FOCUS_BED_SHARE = 0.1
export const ISOCHRONIC_DEPTH = 0.7

const BINAURAL_CARRIER_SHARE = 0.45
const ISOCHRONIC_CARRIER_SHARE = 0.9
const FOCUS_LOWPASS_HZ = 1500

const TONE_SPECS = {
  alpha: { beatHz: 10, note: 57 },
  beta: { beatHz: 16, note: 57 },
  gamma: { beatHz: 40, note: 69 },
} as const

export interface FocusToneParams {
  tone: Exclude<FocusTone, 'off'>
  delivery: FocusDelivery
  tuning: Tuning
  beatHz: number
  leftHz: number
  rightHz: number
  isochronicDepth: number
  peakGain: number
  carrierGain: number
  bedGain: number
}

export function focusToneParams(
  tone: FocusTone,
  delivery: FocusDelivery,
  tuning: Tuning,
): FocusToneParams | null {
  if (tone === 'off') return null
  const spec = TONE_SPECS[tone]
  const leftHz = midiToHz(spec.note, tuning)
  const carrierShare = delivery === 'binaural' ? BINAURAL_CARRIER_SHARE : ISOCHRONIC_CARRIER_SHARE
  return {
    tone,
    delivery,
    tuning,
    beatHz: spec.beatHz,
    leftHz,
    rightHz: leftHz + spec.beatHz,
    isochronicDepth: delivery === 'isochronic' ? ISOCHRONIC_DEPTH : 0,
    peakGain: FOCUS_PEAK_GAIN,
    carrierGain: FOCUS_PEAK_GAIN * carrierShare,
    bedGain: FOCUS_PEAK_GAIN * FOCUS_BED_SHARE,
  }
}

export interface FocusLayer {
  setLevel(level: number, seconds: number): void
  stop(seconds: number): void
}

function pinkNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * 2)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  return buffer
}

export function startFocusLayer(
  context: AudioContext,
  destination: AudioNode,
  params: FocusToneParams,
  level: number,
  fadeIn: number,
): FocusLayer {
  const bus = context.createGain()
  const fade = context.createGain()
  const lowpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = FOCUS_LOWPASS_HZ
  lowpass.Q.value = 0.7
  bus.connect(fade)
  fade.connect(lowpass)
  lowpass.connect(destination)

  const sources: { stop(when: number): void }[] = []

  const bed = context.createBufferSource()
  const bedLevel = context.createGain()
  bed.buffer = pinkNoiseBuffer(context)
  bed.loop = true
  bedLevel.gain.value = params.bedGain
  bed.connect(bedLevel)
  bedLevel.connect(bus)
  bed.start()
  sources.push(bed)

  if (params.delivery === 'binaural') {
    for (const [frequency, pan] of [
      [params.leftHz, -1],
      [params.rightHz, 1],
    ] as const) {
      const osc = context.createOscillator()
      const carrier = context.createGain()
      const panner = context.createStereoPanner()
      osc.type = 'sine'
      osc.frequency.value = frequency
      carrier.gain.value = params.carrierGain
      panner.pan.value = pan
      osc.connect(carrier)
      carrier.connect(panner)
      panner.connect(bus)
      osc.start()
      sources.push(osc)
    }
  } else {
    const osc = context.createOscillator()
    const carrier = context.createGain()
    const lfo = context.createOscillator()
    const depth = context.createGain()
    const panner = context.createStereoPanner()
    osc.type = 'sine'
    osc.frequency.value = params.leftHz
    lfo.type = 'sine'
    lfo.frequency.value = params.beatHz
    carrier.gain.value = params.carrierGain * (1 - params.isochronicDepth / 2)
    depth.gain.value = params.carrierGain * (params.isochronicDepth / 2)
    panner.pan.value = 0
    lfo.connect(depth)
    depth.connect(carrier.gain)
    osc.connect(carrier)
    carrier.connect(panner)
    panner.connect(bus)
    osc.start()
    lfo.start()
    sources.push(osc, lfo)
  }

  const now = context.currentTime
  fade.gain.setValueAtTime(0, now)
  fade.gain.linearRampToValueAtTime(level, now + Math.max(0.05, fadeIn))

  return {
    setLevel(next: number, seconds: number) {
      const at = context.currentTime
      fade.gain.cancelScheduledValues(at)
      fade.gain.setValueAtTime(fade.gain.value, at)
      fade.gain.linearRampToValueAtTime(next, at + Math.max(0.05, seconds))
    },
    stop(seconds: number) {
      const at = context.currentTime
      fade.gain.cancelScheduledValues(at)
      fade.gain.setValueAtTime(fade.gain.value, at)
      fade.gain.linearRampToValueAtTime(0, at + Math.max(0.05, seconds))
      for (const source of sources) {
        try {
          source.stop(at + Math.max(0.05, seconds) + 0.1)
        } catch {
          // A source that already stopped needs no further scheduling.
        }
      }
    },
  }
}
