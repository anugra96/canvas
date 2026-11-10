import { drawGlow, fillDithered } from '../pixel'
import {
  drawBeacons,
  drawSmoke,
  makeSmoke,
  skyBands,
  type Beacon,
  type Smoke,
} from './kit'
import type { BackdropScene } from './types'

interface EmberState {
  embers: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number }>
  blinkers: Beacon[]
  smoke: Smoke
  flare: { x: number; topY: number }
}

function drawTank(g: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number, body: string): void {
  g.fillStyle = body
  g.fillRect(x, baseY - h, w, h)
  g.beginPath()
  g.arc(x + w / 2, baseY - h, w / 2, Math.PI, 0)
  g.fill()
  // Walkway ring.
  g.fillRect(x - 1, baseY - Math.floor(h * 0.55), w + 2, 1)
}

function drawPylon(g: CanvasRenderingContext2D, x: number, baseY: number, h: number, body: string): void {
  g.strokeStyle = body
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(x - 3, baseY)
  g.lineTo(x - 1, baseY - h)
  g.lineTo(x + 1, baseY - h)
  g.lineTo(x + 3, baseY)
  g.moveTo(x - 2, baseY - Math.floor(h * 0.45))
  g.lineTo(x + 2, baseY - Math.floor(h * 0.45))
  g.stroke()
  g.fillStyle = body
  g.fillRect(x - 2, baseY - h - 1, 4, 1)
}

function drawFlareStack(g: CanvasRenderingContext2D, x: number, baseY: number, h: number, body: string): void {
  g.fillStyle = body
  g.fillRect(x - 1, baseY - h, 2, h)
  // Ladder rungs.
  g.globalAlpha = 0.5
  for (let y = baseY - h + 2; y < baseY; y += 3) {
    g.fillRect(x - 2, y, 1, 1)
  }
  g.globalAlpha = 1
}

export const ember: BackdropScene = {
  id: 'ember',
  init(w, h, rng) {
    const embers: EmberState['embers'] = []
    for (let i = 0; i < 42; i += 1) {
      embers.push({
        x: rng() * w,
        y: rng() * h,
        vy: 3 + rng() * 7,
        sway: 2 + rng() * 5,
        phase: rng() * Math.PI * 2,
        size: rng() < 0.85 ? 1 : 2,
      })
    }
    const blinkers: Beacon[] = [
      { x: Math.floor(w * 0.12), y: Math.floor(h * 0.74) - Math.floor(h * 0.16) - 2, period: 1.7, phase: 0.3, color: '#ff3b30', glow: [255, 59, 48] },
      { x: Math.floor(w * 0.84), y: Math.floor(h * 0.74) - Math.floor(h * 0.13) - 2, period: 2.3, phase: 2.4, color: '#ff3b30', glow: [255, 59, 48] },
      { x: Math.floor(w * 0.58), y: Math.floor(h * 0.74) - 4, period: 1.2, phase: 1.1, color: '#ffe9c4', glow: [255, 233, 196] },
    ]
    return {
      embers,
      blinkers,
      smoke: makeSmoke(),
      flare: { x: Math.floor(w * 0.45), topY: Math.floor(h * 0.74) - Math.floor(h * 0.22) },
    } satisfies EmberState as EmberState
  },
  paintStatic(g, w, h, rng) {
    skyBands(g, w, h, [
      [0, [8, 4, 3]],
      [0.5, [22, 10, 6]],
      [0.8, [42, 15, 8]],
      [1, [10, 6, 5]],
    ])
    // Cloud band lit from below by the works.
    const cloudY = Math.floor(h * 0.3)
    for (let i = 0; i < 30; i += 1) {
      const x = Math.floor(rng() * w)
      const y = cloudY + Math.floor((rng() + rng()) * h * 0.12)
      const width = 6 + Math.floor(rng() * 14)
      fillDithered(g, x, y, width, 2, [38, 20, 12], [58, 30, 16], 0.5)
    }
    const base = Math.floor(h * 0.74)
    const body = '#0a0605'
    // Refinery silhouette: tanks, stacks, towers, pipe rack.
    drawFlareStack(g, Math.floor(w * 0.45), base, Math.floor(h * 0.22), body)
    drawTank(g, Math.floor(w * 0.08), base, 8, Math.floor(h * 0.08), body)
    drawTank(g, Math.floor(w * 0.16), base, 6, Math.floor(h * 0.06), body)
    drawTank(g, Math.floor(w * 0.78), base, 7, Math.floor(h * 0.07), body)
    drawPylon(g, Math.floor(w * 0.62), base, Math.floor(h * 0.12), body)
    drawPylon(g, Math.floor(w * 0.9), base, Math.floor(h * 0.1), body)
    for (let x = Math.floor(w * 0.24); x < Math.floor(w * 0.4); x += 3) {
      g.fillStyle = body
      g.fillRect(x, base - 4, 3, 1)
      if (x % 6 === 0) g.fillRect(x, base - 4, 1, 4)
    }
    // Ground with dithered ember wash.
    fillDithered(g, 0, base, w, h - base, [6, 4, 3], [26, 10, 5], 0.35)
    void rng
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as EmberState
    void cam
    const dt = 1 / 60
    for (const emberPart of s.embers) {
      emberPart.y -= emberPart.vy * dt
      if (emberPart.y < -2) {
        emberPart.y = h + 2
        emberPart.x = Math.random() * w
      }
      const flicker = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 + emberPart.phase))
      const swayX = Math.sin(t * 1.3 + emberPart.phase) * emberPart.sway * 0.15
      g.fillStyle = emberPart.size === 2 ? '#ffb45e' : '#ff7a2e'
      g.globalAlpha = Math.min(1, flicker)
      g.fillRect(Math.floor(emberPart.x + swayX), Math.floor(emberPart.y), emberPart.size, emberPart.size)
      if (emberPart.size === 2) {
        drawGlow(g, emberPart.x + swayX, emberPart.y, 2, [255, 180, 94], flicker * 0.3)
      }
    }
    g.globalAlpha = 1
    drawBeacons(g, s.blinkers, t)
    // Flare flame with heat glow.
    const burn = 0.6 + 0.4 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1)
    const flameH = 2 + Math.floor(burn * 3)
    drawGlow(g, s.flare.x, s.flare.topY - 2, 10, [255, 150, 60], 0.45 * burn)
    g.fillStyle = '#ff7a2e'
    g.fillRect(s.flare.x - 1, s.flare.topY - flameH, 2, flameH)
    g.fillStyle = '#ffd9a0'
    g.fillRect(s.flare.x, s.flare.topY - Math.max(1, flameH - 1), 1, Math.max(1, flameH - 1))
    drawSmoke(g, s.smoke, [{ x: s.flare.x, topY: s.flare.topY - flameH }], 1 / 60, 'rgb(90,80,75)')
    // Ground glow flicker from the flare.
    g.fillStyle = 'rgba(255,120,50,0.05)'
    g.fillRect(Math.floor(s.flare.x - w * 0.1), Math.floor(h * 0.74), Math.floor(w * 0.2), h)
  },
}
