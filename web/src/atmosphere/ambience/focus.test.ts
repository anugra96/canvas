import { describe, expect, it } from 'vitest'

import { applySafetyLimiter, midiToHz, SAFETY_LIMITER } from './engine'
import {
  FOCUS_PEAK_GAIN,
  focusToneParams,
  ISOCHRONIC_DEPTH,
  type FocusDelivery,
  type FocusTone,
  type Tuning,
} from './focus'
import { MAX_PLAYBACK_GAIN } from './index'

const deliveries: FocusDelivery[] = ['binaural', 'isochronic']
const tunings: Tuning[] = [440, 432]

describe('midiToHz', () => {
  const cases: { note: number; reference: number | undefined; expected: number }[] = [
    { note: 69, reference: undefined, expected: 440 },
    { note: 69, reference: 440, expected: 440 },
    { note: 69, reference: 432, expected: 432 },
    { note: 57, reference: 440, expected: 220 },
    { note: 57, reference: 432, expected: 216 },
  ]

  it('follows the selected reference', () => {
    for (const { note, reference, expected } of cases) {
      expect(midiToHz(note, reference)).toBeCloseTo(expected, 6)
    }
  })
})

describe('focusToneParams', () => {
  const cases: {
    tone: Exclude<FocusTone, 'off'>
    beatHz: number
    left440: number
    left432: number
  }[] = [
    { tone: 'alpha', beatHz: 10, left440: 220, left432: 216 },
    { tone: 'beta', beatHz: 16, left440: 220, left432: 216 },
    { tone: 'gamma', beatHz: 40, left440: 440, left432: 432 },
  ]

  it('returns nothing for the off setting', () => {
    expect(focusToneParams('off', 'binaural', 440)).toBeNull()
  })

  it('keeps carriers and beat rates on the spec table', () => {
    for (const tuning of tunings) {
      for (const delivery of deliveries) {
        for (const item of cases) {
          const params = focusToneParams(item.tone, delivery, tuning)
          expect(params).not.toBeNull()
          if (!params) continue
          const left = tuning === 440 ? item.left440 : item.left432
          expect(params.beatHz).toBe(item.beatHz)
          expect(params.leftHz).toBeCloseTo(left, 6)
          expect(params.rightHz).toBeCloseTo(left + item.beatHz, 6)
          expect(params.leftHz).toBeGreaterThanOrEqual(150)
          expect(params.rightHz).toBeGreaterThanOrEqual(150)
          expect(params.leftHz).toBeLessThanOrEqual(500)
          expect(params.rightHz).toBeLessThanOrEqual(500)
        }
      }
    }
  })

  it('caps the isochronic depth', () => {
    for (const tuning of tunings) {
      expect(focusToneParams('alpha', 'binaural', tuning)?.isochronicDepth).toBe(0)
      const params = focusToneParams('alpha', 'isochronic', tuning)
      expect(params?.isochronicDepth).toBeGreaterThan(0)
      expect(params?.isochronicDepth).toBeLessThanOrEqual(0.7)
      expect(params?.isochronicDepth).toBe(ISOCHRONIC_DEPTH)
    }
  })

  it('keeps peak gain inside the hearing-safety ceilings', () => {
    for (const tuning of tunings) {
      for (const delivery of deliveries) {
        for (const item of cases) {
          const params = focusToneParams(item.tone, delivery, tuning)
          expect(params).not.toBeNull()
          if (!params) continue
          const carriers = delivery === 'binaural' ? params.carrierGain * 2 : params.carrierGain
          expect(carriers + params.bedGain).toBeLessThanOrEqual(params.peakGain + 1e-12)
          expect(params.peakGain).toBeCloseTo(FOCUS_PEAK_GAIN, 12)
          expect(params.peakGain).toBeLessThanOrEqual(10 ** (-24 / 20))
          const atFullLevel = params.peakGain * MAX_PLAYBACK_GAIN
          expect(atFullLevel).toBeLessThanOrEqual(MAX_PLAYBACK_GAIN)
          expect(atFullLevel).toBeLessThanOrEqual(10 ** (-6 / 20))
        }
      }
    }
  })
})

describe('safety limiter', () => {
  it('applies the specified settings after the playback gain', () => {
    const limiter = {
      threshold: { value: 0 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0 },
      release: { value: 0 },
    }
    applySafetyLimiter(limiter)
    expect(SAFETY_LIMITER).toEqual({
      threshold: -6,
      knee: 0,
      ratio: 20,
      attack: 0.003,
      release: 0.25,
    })
    expect(limiter.threshold.value).toBe(-6)
    expect(limiter.ratio.value).toBe(20)
    expect(limiter.attack.value).toBe(0.003)
    expect(limiter.release.value).toBe(0.25)
  })
})
