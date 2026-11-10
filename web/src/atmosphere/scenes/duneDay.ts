import { drawGlow } from '../pixel'
import {
  drawBirds,
  drawCity,
  drawCrestFlow,
  drawDrift,
  drawDuneField,
  drawFarSkyline,
  drawGlints,
  drawMesas,
  drawRidge,
  drawThopter,
  drawWorm,
  duneRidgesDay,
  makeBirds,
  makeCity,
  makeCrestFlow,
  makeDrift,
  makeThopter,
  makeWorm,
  skyBands,
  type Bird,
  type City,
  type CrestFlow,
  type Drift,
  type DuneRidge,
  type SandWorm,
  type Thopter,
} from './kit'
import type { BackdropScene } from './types'

interface DuneDayState {
  city: City
  dust: Drift[]
  ridges: DuneRidge[]
  flow: CrestFlow[]
  birds: Bird[]
  thopter: Thopter
  worm: SandWorm
}

export const duneDay: BackdropScene = {
  id: 'dune-day',
  init(w, h, rng) {
    return {
      city: makeCity(rng, w, Math.floor(h * 0.74), Math.floor(h * 0.14), 0.05),
      dust: makeDrift(34, w, h * 0.4, h, rng),
      ridges: duneRidgesDay(w, h),
      flow: makeCrestFlow(22, w, rng),
      birds: makeBirds(4, w, h, rng),
      thopter: makeThopter(),
      worm: makeWorm(rng),
    } satisfies DuneDayState as DuneDayState
  },
  paintStatic(g, w, h, rng) {
    skyBands(g, w, h, [
      [0, [242, 216, 158]],
      [0.5, [236, 194, 120]],
      [0.8, [222, 158, 82]],
      [1, [201, 138, 62]],
    ])
    // Sun disc with wide glare.
    const sunX = Math.floor(w * 0.72)
    const sunY = Math.floor(h * 0.18)
    drawGlow(g, sunX, sunY, Math.floor(w * 0.1), [255, 250, 235], 0.5)
    g.fillStyle = '#fffdf2'
    g.fillRect(sunX - 2, sunY - 2, 4, 4)
    // Atmospheric depth: far dunes progressively lighter.
    drawMesas(g, w, Math.floor(h * 0.74), [
      { x: Math.floor(w * 0.1), w: Math.floor(w * 0.22), h: Math.floor(h * 0.08) },
      { x: Math.floor(w * 0.6), w: Math.floor(w * 0.28), h: Math.floor(h * 0.06) },
    ], [180, 140, 96], 'rgba(255,240,205,0.8)', [150, 108, 60])
    drawFarSkyline(g, w, Math.floor(h * 0.72), Math.floor(h * 0.04), [150, 108, 66], rng)
    drawDuneField(g, w, h, duneRidgesDay(w, h).slice(0, 2), rng)
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as DuneDayState
    void cam
    // Heat shimmer: faint drifting highlight bands near the horizon.
    g.fillStyle = 'rgba(255,250,235,0.06)'
    for (let band = 0; band < 3; band += 1) {
      const y = Math.floor(h * (0.62 + band * 0.03) + Math.sin(t * 1.3 + band * 2) * 1.2)
      g.fillRect(0, y, w, 1)
    }
    drawCity(g, s.city, [90, 58, 28], '#2c1c0c', '#3a2410', 'rgba(255,240,205,0.5)')
    drawGlints(g, s.city.windows, t)
    drawBirds(g, s.birds, w, h, t, 1 / 60, '#3a2a16')
    drawThopter(g, s.thopter, w, h, t, 1 / 60, '#2c1c0c')
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,244,214)', [0, 1])
    drawWorm(g, s.worm, s.ridges, w, t, 1 / 60, [92, 58, 26], [255, 244, 214], [220, 180, 120])
    drawRidge(g, w, h, s.ridges[2]!, 0)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,230,180)', [2])
    drawDrift(g, s.dust, w, 1 / 60, 'rgb(120,70,20)')
  },
}
