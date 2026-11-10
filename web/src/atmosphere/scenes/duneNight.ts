import {
  drawGlow,
  drawStars,
  makeStars,
  type Star,
} from '../pixel'
import {
  drawBeacons,
  drawCity,
  drawCrawlersOnDune,
  drawCrestFlow,
  drawDrift,
  drawDuneField,
  drawFarSkyline,
  drawFlicker,
  drawMesas,
  drawMilkyWay,
  drawRidge,
  drawSmoke,
  drawThopter,
  drawWorm,
  duneRidgesNight,
  makeCity,
  makeCrawlers,
  makeCrestFlow,
  makeDrift,
  makeSmoke,
  makeThopter,
  makeWorm,
  moon,
  skyBands,
  type City,
  type Crawler,
  type CrestFlow,
  type Drift,
  type DuneRidge,
  type Mesa,
  type SandWorm,
  type Smoke,
  type Thopter,
} from './kit'
import type { BackdropScene } from './types'

interface DuneNightState {
  stars: Star[]
  city: City
  mesas: Mesa[]
  sand: Drift[]
  blowX: number
  ridges: DuneRidge[]
  flow: CrestFlow[]
  crawlers: Crawler[]
  smoke: Smoke
  thopter: Thopter
  worm: SandWorm
}

export const duneNight: BackdropScene = {
  id: 'dune-night',
  init(w, h, rng) {
    return {
      stars: makeStars(130, w, Math.floor(h * 0.45), rng),
      city: makeCity(rng, w, Math.floor(h * 0.76), Math.floor(h * 0.16), 0.16),
      mesas: [
        { x: Math.floor(w * 0.06), w: Math.floor(w * 0.2), h: Math.floor(h * 0.07) },
        { x: Math.floor(w * 0.62), w: Math.floor(w * 0.26), h: Math.floor(h * 0.05) },
      ],
      sand: makeDrift(46, w, h * 0.55, h, rng),
      blowX: w * (0.25 + rng() * 0.5),
      ridges: duneRidgesNight(w, h),
      flow: makeCrestFlow(26, w, rng),
      crawlers: makeCrawlers(3, w, rng),
      smoke: makeSmoke(),
      thopter: makeThopter(),
      worm: makeWorm(rng),
    } satisfies DuneNightState as DuneNightState
  },
  paintStatic(g, w, h, rng) {
    skyBands(g, w, h, [
      [0, [4, 3, 8]],
      [0.45, [12, 8, 12]],
      [0.72, [46, 24, 10]],
      [0.9, [74, 36, 8]],
      [1, [18, 9, 3]],
    ])
    drawMilkyWay(g, w, h, rng, [255, 200, 140])
    moon(g, Math.floor(w * 0.78), Math.floor(h * 0.16), Math.max(4, Math.floor(w / 42)), [244, 227, 194], [244, 227, 194])
    moon(g, Math.floor(w * 0.2), Math.floor(h * 0.3), Math.max(2, Math.floor(w / 90)), [217, 201, 168], [217, 201, 168])
    drawMesas(g, w, Math.floor(h * 0.78), [
      { x: Math.floor(w * 0.06), w: Math.floor(w * 0.2), h: Math.floor(h * 0.07) },
      { x: Math.floor(w * 0.62), w: Math.floor(w * 0.26), h: Math.floor(h * 0.05) },
    ], [13, 8, 5], 'rgba(170,120,70,0.5)', [24, 14, 8])
    drawFarSkyline(g, w, Math.floor(h * 0.755), Math.floor(h * 0.05), [20, 14, 10], rng)
    // City glow dome.
    drawGlow(g, Math.floor(w * 0.5), Math.floor(h * 0.74), Math.floor(w * 0.16), [255, 150, 70], 0.08)
    drawDuneField(g, w, h, duneRidgesNight(w, h).slice(0, 2), rng)
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as DuneNightState
    void cam
    drawStars(g, s.stars, t, '#ffe9c4')
    // Rare spice blow: a slow ember glow behind the far dune.
    const cycle = (t % 47) / 47
    if (cycle > 0.7) {
      const glow = Math.sin(((cycle - 0.7) / 0.3) * Math.PI)
      drawGlow(g, s.blowX, h * 0.76, Math.floor(w * 0.09), [255, 140, 60], glow * 0.4)
    }
    drawCity(g, s.city, [15, 11, 7], '#ffb45e', '#5a3a1c', 'rgba(255,200,140,0.35)')
    drawBeacons(g, s.city.beacons, t)
    drawFlicker(g, s.city, [15, 11, 7], '#ffb45e', '#cfe0ee', t)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,200,130)', [0, 1])
    drawSmoke(g, s.smoke, s.city.stacks, 1 / 60, 'rgb(150,130,110)')
    drawCrawlersOnDune(g, s.crawlers, s.ridges[1]!, w, 1 / 60)
    drawWorm(g, s.worm, s.ridges, w, t, 1 / 60, [64, 40, 20], [255, 184, 110], [150, 100, 60])
    // Foreground dune passes in front of the worm for depth.
    drawRidge(g, w, h, s.ridges[2]!, 0)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(210,160,100)', [2])
    drawThopter(g, s.thopter, w, h, t, 1 / 60, '#0a0805')
    drawDrift(g, s.sand, w, 1 / 60, 'rgb(232,180,120)')
  },
}
