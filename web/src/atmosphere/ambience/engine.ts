export interface AmbienceSpec {
  seconds: number
  compose: (context: OfflineAudioContext) => void
  env: EnvStarter
}

let tuningReference = 440

export function setTuningReference(reference: number): void {
  tuningReference = reference
}

export function currentTuningReference(): number {
  return tuningReference
}

export function midiToHz(note: number, reference = 440): number {
  return reference * 2 ** ((note - 69) / 12)
}

export interface LimiterParam {
  value: number
}

export interface LimiterLike {
  threshold: LimiterParam
  knee: LimiterParam
  ratio: LimiterParam
  attack: LimiterParam
  release: LimiterParam
}

export const SAFETY_LIMITER = {
  threshold: -6,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
} as const

export function applySafetyLimiter(compressor: LimiterLike): void {
  compressor.threshold.value = SAFETY_LIMITER.threshold
  compressor.knee.value = SAFETY_LIMITER.knee
  compressor.ratio.value = SAFETY_LIMITER.ratio
  compressor.attack.value = SAFETY_LIMITER.attack
  compressor.release.value = SAFETY_LIMITER.release
}

export interface ToneOptions {
  type?: OscillatorType
  gain?: number
  attack?: number
  release?: number
  detune?: number
  pan?: number
}

export function tone(
  context: BaseAudioContext,
  destination: AudioNode,
  note: number,
  start: number,
  hold: number,
  options: ToneOptions = {},
): void {
  const {
    type = 'sine',
    gain = 0.03,
    attack = 0.02,
    release = 0.4,
    detune = 0,
    pan = 0,
  } = options
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.value = midiToHz(note, currentTuningReference())
  osc.detune.value = detune
  panner.pan.value = pan
  level.gain.setValueAtTime(0, start)
  level.gain.linearRampToValueAtTime(gain, start + attack)
  level.gain.setValueAtTime(gain, start + hold)
  level.gain.exponentialRampToValueAtTime(0.0001, start + hold + release)
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start(start)
  osc.stop(start + hold + release + 0.05)
}

export function noise(
  context: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  start: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.6
  level.gain.setValueAtTime(0, start)
  level.gain.linearRampToValueAtTime(gain, start + 0.8)
  level.gain.setValueAtTime(gain, Math.max(start + 0.8, start + duration - 1))
  level.gain.linearRampToValueAtTime(0, start + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start(start)
  source.stop(start + duration + 0.05)
}

export function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * 2)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }
  return buffer
}

export function echo(
  context: BaseAudioContext,
  destination: AudioNode,
  delayTime: number,
  feedback: number,
  wet: number,
): GainNode {
  const input = context.createGain()
  const delay = context.createDelay(2)
  const feedbackGain = context.createGain()
  const wetGain = context.createGain()
  delay.delayTime.value = delayTime
  feedbackGain.gain.value = feedback
  wetGain.gain.value = wet
  input.connect(delay)
  delay.connect(feedbackGain)
  feedbackGain.connect(delay)
  delay.connect(wetGain)
  wetGain.connect(destination)
  return input
}

export type EnvStarter = (context: AudioContext, master: GainNode) => () => void

export function gliss(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  pan = 0,
): void {
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(20, from), at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration)
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + 0.05)
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  panner.pan.value = pan
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}

export function bell(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  note: number,
  gain: number,
): void {
  tone(context, destination, note, at, 1.5, {
    type: 'sine',
    gain,
    attack: 0.01,
    release: 3,
  })
  tone(context, destination, note + 12, at, 1.2, {
    type: 'sine',
    gain: gain * 0.4,
    attack: 0.01,
    release: 2.5,
  })
}

export function liveBurst(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  at: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
  attack = 0.03,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.8
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + attack)
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start(at)
  source.stop(at + duration + 0.1)
}

export function liveBed(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
): () => void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.6
  level.gain.setValueAtTime(0, context.currentTime)
  level.gain.linearRampToValueAtTime(gain, context.currentTime + 2.5)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start()
  return () => {
    const now = context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(0, now + 0.8)
    source.stop(now + 1)
  }
}

export function liveDrone(
  context: AudioContext,
  destination: AudioNode,
  note: number,
  gain: number,
  type: OscillatorType = 'sine',
  pan = 0,
): () => void {
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.value = midiToHz(note, currentTuningReference())
  level.gain.setValueAtTime(0, context.currentTime)
  level.gain.linearRampToValueAtTime(gain, context.currentTime + 3)
  panner.pan.value = pan
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start()
  return () => {
    const now = context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(0, now + 0.8)
    osc.stop(now + 1)
  }
}

export function every(
  context: AudioContext,
  minGap: number,
  maxGap: number,
  voice: (at: number) => void,
): () => void {
  let stopped = false
  let timer = 0
  const schedule = (): void => {
    if (stopped) return
    const delay = minGap + Math.random() * (maxGap - minGap)
    timer = window.setTimeout(() => {
      if (stopped) return
      voice(context.currentTime + 0.05)
      schedule()
    }, delay * 1000)
  }
  schedule()
  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}

export function createMaster(context: BaseAudioContext): GainNode {
  const master = context.createGain()
  const highpass = context.createBiquadFilter()
  const compressor = context.createDynamicsCompressor()
  master.gain.value = 0.52
  highpass.type = 'highpass'
  highpass.frequency.value = 58
  highpass.Q.value = 0.7
  compressor.threshold.value = -22
  compressor.knee.value = 24
  compressor.ratio.value = 2
  compressor.attack.value = 0.01
  compressor.release.value = 0.3
  master.connect(highpass)
  highpass.connect(compressor)
  compressor.connect(context.destination)
  return master
}

export function passingVehicle(
  context: AudioContext,
  master: GainNode,
  buffer: AudioBuffer,
  at: number,
  peak: number,
  duration: number,
  gain: number,
  pan: number,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(peak * 0.3, at)
  filter.frequency.linearRampToValueAtTime(peak, at + duration / 2)
  filter.frequency.linearRampToValueAtTime(peak * 0.3, at + duration)
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + duration / 2)
  level.gain.linearRampToValueAtTime(0, at + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(master)
  source.start(at)
  source.stop(at + duration + 0.1)
}

