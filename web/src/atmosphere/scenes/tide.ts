import { drawGlow, drawStars, makeStars, type Star } from '../pixel'
import { moon, skyBands } from './kit'
import type { BackdropScene } from './types'

interface Ship {
  active: boolean
  x: number
  dir: 1 | -1
  next: number
}

function makeShip(): Ship {
  return { active: false, x: 0, dir: 1, next: 20 }
}

function drawShip(g: CanvasRenderingContext2D, ship: Ship, w: number, seaY: number, t: number, dt: number): void {
  if (!ship.active && t > ship.next) {
    ship.dir = Math.random() < 0.5 ? 1 : -1
    ship.active = true
    ship.x = ship.dir > 0 ? -10 : w + 10
  }
  if (!ship.active) return
  ship.x += ship.dir * 3 * dt
  if (ship.x < -12 || ship.x > w + 12) {
    ship.active = false
    ship.next = t + 60 + Math.random() * 40
    return
  }
  const x = Math.floor(ship.x)
  g.fillStyle = '#050a10'
  g.fillRect(x - 3, seaY - 2, 7, 2)
  g.fillRect(x - 1, seaY - 4, 2, 2)
  g.fillStyle = '#ffe9c4'
  g.fillRect(x - 1, seaY - 3, 1, 1)
  drawGlow(g, x - 1, seaY - 3, 2, [255, 233, 196], 0.5)
  g.fillStyle = '#ff5a4a'
  g.fillRect(x + (ship.dir > 0 ? 3 : -3), seaY - 2, 1, 1)
  // Wake.
  g.fillStyle = 'rgba(159,196,222,0.15)'
  g.fillRect(x - ship.dir * 5, seaY - 1, 4, 1)
}

function drawLighthouse(g: CanvasRenderingContext2D, w: number, seaY: number): { x: number; y: number } {
  const x = Math.floor(w * 0.9)
  g.fillStyle = '#050a10'
  g.beginPath()
  g.moveTo(x - 8, seaY)
  g.lineTo(x - 3, seaY - 5)
  g.lineTo(x + 5, seaY)
  g.closePath()
  g.fill()
  for (let row = 0; row < 5; row += 1) {
    g.fillStyle = row % 2 === 0 ? '#0d1826' : '#c8d4de'
    g.fillRect(x - 2, seaY - 5 - (row + 1) * 2, 4, 2)
  }
  return { x, y: seaY - 16 }
}

function drawBeam(g: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, color: string): void {
  for (let d = 4; d < len; d += 2) {
    const spread = 1 + Math.floor(d / 10)
    g.fillStyle = color
    g.globalAlpha = 0.09 * (1 - d / len)
    g.fillRect(Math.floor(x + Math.cos(angle) * d) - Math.floor(spread / 2), Math.floor(y + Math.sin(angle) * d), spread, 1)
  }
  g.globalAlpha = 1
}

interface TideState {
  stars: Star[]
  buoyPhase: number
  ship: Ship
}

export const tide: BackdropScene = {
  id: 'tide',
  init(w, h, rng) {
    return { stars: makeStars(110, w, Math.floor(h * 0.4), rng), buoyPhase: rng() * Math.PI * 2, ship: makeShip() } satisfies TideState as TideState
  },
  paintStatic(g, w, h, rng) {
    skyBands(g, w, h, [
      [0, [4, 7, 13]],
      [0.5, [10, 22, 38]],
      [1, [14, 34, 51]],
    ])
    moon(g, Math.floor(w * 0.68), Math.floor(h * 0.18), Math.max(4, Math.floor(w / 44)), [232, 240, 246], [232, 240, 246])
    const seaY = Math.floor(h * 0.52)
    // Sea depth bands.
    skyBands(g, w, h - seaY, [
      [0, [8, 22, 36]],
      [0.6, [5, 14, 24]],
      [1, [3, 9, 17]],
    ], seaY)
    // Distant headland.
    g.fillStyle = '#050b12'
    g.beginPath()
    g.moveTo(0, seaY)
    g.lineTo(0, seaY - Math.floor(h * 0.05))
    for (let x = 0; x <= Math.floor(w * 0.24); x += 4) {
      g.lineTo(x, seaY - Math.floor(h * 0.05) - Math.sin((x / w) * Math.PI) * Math.floor(h * 0.03))
    }
    g.lineTo(Math.floor(w * 0.24), seaY)
    g.closePath()
    g.fill()
    drawLighthouse(g, w, seaY)
    // Rocks in the foreground.
    g.fillStyle = '#03080e'
    for (const [fx, fw, fh] of [[0.06, 10, 3], [0.14, 7, 2], [0.32, 12, 3], [0.78, 8, 2]] as Array<[number, number, number]>) {
      g.fillRect(Math.floor(w * fx), Math.floor(h * 0.9) - fh, fw, fh)
    }
    void rng
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as TideState
    void cam
    drawStars(g, s.stars, t, '#cfe0ee')
    const seaY = Math.floor(h * 0.52)
    // Moon glitter column.
    const cx = Math.floor(w * 0.68)
    for (let row = 0; row < h - seaY; row += 2) {
      const spread = 1 + Math.floor(((row / 2) % 4) * (0.6 + 0.4 * Math.sin(t * 1.7 + row)))
      const flicker = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.3 + row * 1.7))
      g.fillStyle = '#e8c87a'
      g.globalAlpha = Math.min(0.7, flicker * (1 - row / (h - seaY)))
      g.fillRect(cx - Math.floor(spread / 2), seaY + row, spread, 1)
    }
    g.globalAlpha = 1
    // Wave crest lines drifting.
    g.fillStyle = '#9fc4de'
    for (let band = 0; band < 5; band += 1) {
      const y = seaY + 3 + band * Math.max(3, Math.floor((h - seaY) / 6))
      const offset = Math.floor(((t * (2 + band)) % w + w) % w)
      g.globalAlpha = 0.1 + band * 0.02
      for (let x = -8; x < w + 8; x += 12) {
        g.fillRect(((x + offset) % (w + 8) + (w + 8)) % (w + 8) - 8, y, 5, 1)
      }
    }
    g.globalAlpha = 1
    // Lighthouse: lamp glow + rotating beams.
    const lamp = { x: Math.floor(w * 0.9), y: seaY - 16 }
    drawGlow(g, lamp.x, lamp.y, 4, [255, 233, 196], 0.7)
    const angle = t * 0.22
    drawBeam(g, lamp.x, lamp.y, angle, Math.floor(w * 0.22), '#ffe9c4')
    drawBeam(g, lamp.x, lamp.y, angle + Math.PI, Math.floor(w * 0.18), '#ffe9c4')
    // Buoy blinking with a glint on the water.
    const on = 0.5 + 0.5 * Math.sin((t / 3.2) * Math.PI * 2 + s.buoyPhase)
    if (on > 0.6) {
      g.fillStyle = '#ff5a4a'
      g.fillRect(Math.floor(w * 0.22), seaY - 3, 1, 1)
      drawGlow(g, Math.floor(w * 0.22), seaY - 3, 2, [255, 90, 74], 0.6)
      g.fillStyle = '#ff5a4a'
      g.globalAlpha = 0.3 * (1 - Math.abs(Math.sin(t * 0.9)))
      g.fillRect(Math.floor(w * 0.22), seaY + 2, 1, 3)
      g.globalAlpha = 1
    }
    drawShip(g, s.ship, w, seaY, t, 1 / 60)
  },
}
