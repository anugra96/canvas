import {
  BAYER4,
  bands,
  drawGlow,
  mix,
  rgb,
  type Rgb,
} from '../pixel'
import { mulberry } from './random'

export function skyBands(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: Array<[number, Rgb]>,
  y0 = 0,
): void {
  bands(g, w, y0, h, stops, { minBands: 8, seam: 'band', threshold: 3, amount: 0.5 })
}

export function drawSphere(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lightX: number,
  lightY: number,
  base: Rgb,
  dark: Rgb,
  bright: Rgb,
): void {
  const len = Math.hypot(lightX, lightY) || 1
  const lx = lightX / len
  const ly = lightY / len
  for (let py = -r; py <= r; py += 1) {
    for (let px = -r; px <= r; px += 1) {
      const d2 = px * px + py * py
      if (d2 > r * r) continue
      const nx = px / r
      const ny = py / r
      const lambert = (nx * lx + ny * ly) * 0.5 + 0.5
      const bayer = BAYER4[((cy + py) % 4) * 4 + ((cx + px) % 4)]! / 16
      const v = lambert * 0.82 + bayer * 0.18
      let c: Rgb
      if (v < 0.42) c = dark
      else if (v < 0.78) c = base
      else c = bright
      g.fillStyle = rgb(c)
      g.fillRect(cx + px, cy + py, 1, 1)
    }
  }
}

export function drawRimLight(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, lightX: number, lightY: number, color: string): void {
  const len = Math.hypot(lightX, lightY) || 1
  const lx = lightX / len
  const ly = lightY / len
  g.fillStyle = color
  for (let i = 0; i < 26; i += 1) {
    const a = -Math.PI / 3 + (i / 26) * (Math.PI * 2 / 3) + Math.PI
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    if (dx * lx + dy * ly > 0.15) continue
    g.fillRect(Math.floor(cx + dx * r), Math.floor(cy + dy * r), 1, 1)
  }
}

// Milky Way: dense faint star dust with dithered nebular haze.
export function drawMilkyWay(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, tint: Rgb): void {
  const bandY = h * 0.22
  const bandH = Math.max(6, h * 0.16)
  for (let i = 0; i < 240; i += 1) {
    const x = Math.floor(rng() * w)
    const gauss = (rng() + rng() + rng()) / 3
    const y = Math.floor(bandY + (gauss - 0.5) * bandH * 2)
    g.fillStyle = rgb(mix([200, 205, 220], tint, rng() * 0.5))
    g.globalAlpha = 0.12 + rng() * 0.5
    g.fillRect(x, y, 1, 1)
  }
  for (let i = 0; i < 26; i += 1) {
    const x = Math.floor(rng() * w)
    const y = Math.floor(bandY + (rng() - 0.5) * bandH)
    const size = 3 + Math.floor(rng() * 5)
    drawGlow(g, x, y, size, [120, 130, 170], 0.05 + rng() * 0.05)
  }
  g.globalAlpha = 1
}

export function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number, base: Rgb, glowColor: [number, number, number]): void {
  drawGlow(g, x, y, r * 3, glowColor, 0.2)
  drawSphere(g, x, y, r, -0.6, -0.4, base, mix(base, [8, 8, 12], 0.82), mix(base, [255, 255, 255], 0.5))
  // Craters.
  g.fillStyle = rgb(mix(base, [0, 0, 0], 0.25))
  g.fillRect(x - Math.floor(r * 0.4), y - Math.floor(r * 0.1), Math.max(1, Math.floor(r * 0.28)), Math.max(1, Math.floor(r * 0.28)))
  g.fillRect(x + Math.floor(r * 0.1), y + Math.floor(r * 0.3), Math.max(1, Math.floor(r * 0.2)), Math.max(1, Math.floor(r * 0.2)))
}

export interface LitWindow {
  x: number
  y: number
  warm: boolean
}

export interface Beacon {
  x: number
  y: number
  period: number
  phase: number
  color: string
  glow: [number, number, number]
}

type BlockKind = 'tower' | 'dome' | 'spire' | 'wall' | 'pad'

interface Block {
  x: number
  w: number
  h: number
  kind: BlockKind
  antenna: boolean
}

export interface City {
  silhouette: Block[]
  windows: LitWindow[]
  beacons: Beacon[]
  doors: number[]
  flicker: number[]
  stacks: Array<{ x: number; topY: number }>
  baseY: number
}

export function makeCity(rng: () => number, w: number, baseY: number, maxH: number, litRatio: number): City {
  const silhouette: Block[] = []
  const windows: LitWindow[] = []
  const beacons: Beacon[] = []
  const doors: number[] = []
  const stacks: Array<{ x: number; topY: number }> = []
  let x = Math.floor(w * 0.04)
  while (x < w * 0.96) {
    const roll = rng()
    let bw = 4 + Math.floor(rng() * 8)
    let bh = 4 + Math.floor(rng() * maxH)
    let kind: BlockKind = 'tower'
    if (roll < 0.1) {
      kind = 'pad'
      bw = 10 + Math.floor(rng() * 8)
      bh = 2
    } else if (roll < 0.22) {
      kind = 'wall'
      bw = 8 + Math.floor(rng() * 8)
      bh = 3 + Math.floor(rng() * 3)
    } else if (roll < 0.34) {
      kind = 'dome'
      bw = 6 + Math.floor(rng() * 6)
      bh = 5 + Math.floor(rng() * 6)
    } else if (roll < 0.48) {
      kind = 'spire'
      bw = 2 + Math.floor(rng() * 2)
      bh = 10 + Math.floor(rng() * maxH)
    }
    const antenna = kind === 'tower' && rng() < 0.35
    silhouette.push({ x, w: bw, h: bh, kind, antenna })
    if (kind === 'tower' || kind === 'dome' || kind === 'wall') {
      const cols = Math.floor(bw / 2)
      const rows = Math.floor(bh / 3)
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (rng() < litRatio) {
            windows.push({ x: x + 1 + cx * 2, y: baseY - bh + 1 + cy * 3, warm: rng() < 0.8 })
          }
        }
      }
    }
    for (let dx = x + 1; dx < x + bw - 1; dx += 3) {
      if (rng() < 0.5) doors.push(dx)
    }
    if (kind === 'spire' || antenna) {
      if (rng() < 0.7) {
        beacons.push({
          x: x + Math.floor(bw / 2),
          y: baseY - bh - 4,
          period: 2 + rng() * 4,
          phase: rng() * Math.PI * 2,
          color: rng() < 0.6 ? '#ff5a4a' : '#ffe9c4',
          glow: rng() < 0.6 ? [255, 90, 74] : [255, 233, 196],
        })
      }
    } else if (kind === 'pad') {
      const lights = 2 + Math.floor(rng() * 3)
      for (let i = 0; i < lights; i += 1) {
        beacons.push({
          x: x + 1 + i * 2,
          y: baseY - bh - 1,
          period: 1 + rng() * 2,
          phase: rng() * Math.PI * 2,
          color: '#ffb45e',
          glow: [255, 180, 94],
        })
      }
    }
    if (kind === 'tower' && bw >= 7 && stacks.length < 2 && rng() < 0.5) {
      stacks.push({ x: x + Math.floor(bw / 2), topY: baseY - bh })
    }
    x += bw + 1 + Math.floor(rng() * 4)
  }
  const flicker: number[] = []
  const flickCount = Math.min(10, windows.length)
  for (let i = 0; i < flickCount; i += 1) {
    flicker.push(Math.floor(rng() * windows.length))
  }
  return { silhouette, windows, beacons, doors, flicker, stacks, baseY }
}

export function drawCity(g: CanvasRenderingContext2D, city: City, body: Rgb, lit: string, dim: string, edge: string): void {
  for (const block of city.silhouette) {
    const top = city.baseY - block.h
    g.fillStyle = rgb(body)
    if (block.kind === 'dome') {
      g.fillRect(block.x, top + 2, block.w, block.h - 2)
      g.beginPath()
      g.arc(block.x + block.w / 2, top + 2, block.w / 2, Math.PI, 0)
      g.fill()
    } else {
      g.fillRect(block.x, top, block.w, block.h)
    }
    // Lit edge on the moon-facing side so silhouettes get volume.
    g.fillStyle = edge
    if (block.kind !== 'dome') {
      g.fillRect(block.x + block.w - 1, top, 1, block.h - 1)
    }
    if (block.kind === 'spire' || block.antenna) {
      g.fillRect(block.x + Math.floor(block.w / 2), top - 3, 1, 3)
    }
    if (block.kind === 'pad') {
      g.fillStyle = dim
      for (let dx = block.x + 1; dx < block.x + block.w - 1; dx += 2) {
        g.fillRect(dx, top, 1, 1)
      }
    }
  }
  for (const window of city.windows) {
    g.fillStyle = window.warm ? lit : dim
    g.fillRect(window.x, window.y, 1, 1)
  }
  g.fillStyle = lit
  for (const dx of city.doors) {
    g.fillRect(dx, city.baseY - 2, 1, 2)
  }
}

export function drawFlicker(g: CanvasRenderingContext2D, city: City, body: Rgb, lit: string, cool: string, t: number): void {
  for (const idx of city.flicker) {
    const window = city.windows[idx]
    if (!window) continue
    const on = (Math.floor(t * 0.7 + idx * 13.7) % 4) !== 0
    g.fillStyle = on ? (window.warm ? lit : cool) : rgb(body)
    g.fillRect(window.x, window.y, 1, 1)
  }
}

export function drawBeacons(g: CanvasRenderingContext2D, beacons: Beacon[], t: number): void {
  for (const beacon of beacons) {
    const on = 0.5 + 0.5 * Math.sin((t / beacon.period) * Math.PI * 2 + beacon.phase)
    if (on > 0.55) {
      const alpha = Math.min(1, (on - 0.55) * 2.5)
      drawGlow(g, beacon.x, beacon.y, 3, beacon.glow, alpha * 0.55)
      g.fillStyle = beacon.color
      g.globalAlpha = alpha
      g.fillRect(beacon.x, beacon.y, 1, 1)
      g.globalAlpha = 1
    }
  }
}

export function drawFarSkyline(g: CanvasRenderingContext2D, w: number, baseY: number, maxH: number, color: Rgb, rng: () => number): void {
  let x = 0
  while (x < w) {
    const bw = 3 + Math.floor(rng() * 6)
    const bh = 2 + Math.floor(rng() * maxH)
    g.fillStyle = rgb(color)
    g.fillRect(x, baseY - bh, bw, bh)
    if (rng() < 0.3) {
      g.fillRect(x + Math.floor(bw / 2), baseY - bh - 2, 1, 2)
    }
    x += bw + Math.floor(rng() * 3)
  }
}

export interface Drift {
  x: number
  y: number
  vx: number
  len: number
  alpha: number
}

export function makeDrift(count: number, w: number, y0: number, y1: number, rng: () => number): Drift[] {
  const parts: Drift[] = []
  for (let i = 0; i < count; i += 1) {
    parts.push({
      x: rng() * w,
      y: y0 + rng() * (y1 - y0),
      vx: 2 + rng() * 6,
      len: 2 + Math.floor(rng() * 4),
      alpha: 0.05 + rng() * 0.12,
    })
  }
  return parts
}

export function drawDrift(g: CanvasRenderingContext2D, parts: Drift[], w: number, dt: number, color: string): void {
  g.fillStyle = color
  for (const part of parts) {
    part.x += part.vx * dt
    if (part.x - part.len > w) {
      part.x = -part.len
    }
    g.globalAlpha = part.alpha
    g.fillRect(Math.floor(part.x), Math.floor(part.y), part.len, 1)
  }
  g.globalAlpha = 1
}

export interface Crawler {
  x: number
  dir: 1 | -1
  speed: number
  rear: boolean
}

export function makeCrawlers(count: number, w: number, rng: () => number): Crawler[] {
  const crawlers: Crawler[] = []
  for (let i = 0; i < count; i += 1) {
    const dir = rng() < 0.5 ? 1 : -1
    crawlers.push({ x: rng() * w, dir, speed: 3 + rng() * 5, rear: rng() < 0.5 })
  }
  return crawlers
}

interface SprayParticle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

export interface SandWorm {
  active: boolean
  x: number
  dir: 1 | -1
  speed: number
  humps: number
  spacing: number
  base: number
  width: number
  phase: number
  breach: number
  spray: SprayParticle[]
  nextSpawn: number
  ridgeIdx: number
}

export function makeWorm(rng: () => number): SandWorm {
  return {
    active: false,
    x: 0,
    dir: 1,
    speed: 0,
    humps: 0,
    spacing: 0,
    base: 0,
    width: 0,
    phase: 0,
    breach: 0,
    spray: [],
    nextSpawn: 3 + rng() * 5,
    ridgeIdx: 0,
  }
}

export function drawWorm(
  g: CanvasRenderingContext2D,
  worm: SandWorm,
  ridges: DuneRidge[],
  w: number,
  t: number,
  dt: number,
  body: Rgb,
  lit: Rgb,
  sprayColor: Rgb,
): void {
  if (!worm.active) {
    if (t < worm.nextSpawn) return
    worm.active = true
    worm.ridgeIdx = Math.random() < 0.7 ? 0 : 1
    worm.dir = Math.random() < 0.5 ? 1 : -1
    worm.x = worm.dir > 0 ? -50 : w + 50
    worm.speed = 18 + Math.random() * 8
    worm.humps = 12 + Math.floor(Math.random() * 5)
    worm.spacing = 9 + Math.random() * 4
    worm.base = 7 + Math.random() * 4
    worm.width = 6 + Math.random() * 3
    worm.phase = Math.random() * Math.PI * 2
    worm.breach = 0
    worm.spray = []
  }
  worm.x += worm.dir * worm.speed * dt
  if (worm.x < -70 || worm.x > w + 70) {
    worm.active = false
    worm.nextSpawn = t + 40 + Math.random() * 55
    return
  }
  if (worm.breach <= 0 && Math.random() < dt * 0.05) worm.breach = 1
  worm.breach = Math.max(0, worm.breach - dt * 0.4)

  const ridge = ridges[worm.ridgeIdx] ?? ridges[0]!
  const surfColor = rgb(body)
  const litColor = rgb(lit)
  const humps: Array<{ x: number; surf: number; top: number; rw: number; isHead: boolean }> = []
  for (let i = 0; i < worm.humps; i += 1) {
    const sx = worm.x - worm.dir * i * worm.spacing
    if (sx < -12 || sx > w + 12) continue
    const wave = Math.max(0, Math.sin(t * 1.6 + worm.phase - i * 0.85))
    const rise = worm.base * Math.pow(wave, 1.5) * (1 + worm.breach * 1.8) * (1 - i / (worm.humps + 6))
    const surf = duneY(ridge, w, sx)
    const rw = (i === 0 ? 1.3 : 1) * worm.width * (1 - i / (worm.humps + 3))
    const top = rise < 0.6 ? surf + 0.5 : surf - rise * 0.9
    humps.push({ x: sx, surf, top, rw: Math.max(2, rw), isHead: i === 0 })
  }
  if (humps.length > 0) {
    let x0 = Math.floor(Math.min(...humps.map((hump) => hump.x - hump.rw)))
    let x1 = Math.ceil(Math.max(...humps.map((hump) => hump.x + hump.rw)))
    x0 = Math.max(0, x0)
    x1 = Math.min(w - 1, x1)
    for (let x = x0; x <= x1; x += 1) {
      let top: number | null = null
      for (const hump of humps) {
        const dx = (x - hump.x) / hump.rw
        if (dx < -1 || dx > 1) continue
        const bump = hump.surf - hump.top
        if (bump <= 0.5) continue
        const yy = hump.surf - bump * Math.sqrt(Math.max(0, 1 - dx * dx))
        if (top === null || yy < top) top = yy
      }
      if (top === null) continue
      const surf = duneY(ridge, w, x)
      const bottom = Math.round(surf) + 1
      const ty = Math.round(top)
      if (ty >= bottom) continue
      // Contact shadow under the body.
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(x, bottom, 1, 1)
      // Body column.
      g.fillStyle = surfColor
      g.fillRect(x, ty, 1, bottom - ty)
      // Lit spine only on real hump peaks; troughs stay plain.
      if (surf - top > 1.5) {
        g.fillStyle = litColor
        g.fillRect(x, ty, 1, 1)
      }
    }
    const head = humps[0]
    if (head?.isHead) {
      // Bow wave flicks plus breach glow and spray.
      g.fillStyle = litColor
      g.globalAlpha = 0.7
      g.fillRect(Math.floor(head.x + worm.dir * (head.rw + 1)), Math.floor(head.surf - 1), 1, 1)
      g.fillRect(Math.floor(head.x + worm.dir * (head.rw + 2)), Math.floor(head.surf), 1, 1)
      g.globalAlpha = 1
      if (worm.breach > 0.25) {
        drawGlow(g, head.x, head.top, Math.floor(Math.max(4, (head.surf - head.top) * 2.4)), [232, 160, 84], worm.breach * 0.5)
        for (let s = 0; s < 3; s += 1) {
          worm.spray.push({
            x: head.x + (Math.random() - 0.5) * 4,
            y: head.top,
            vx: (Math.random() - 0.5) * 26 - worm.dir * 8,
            vy: -10 - Math.random() * 18,
            age: 0,
            life: 0.9 + Math.random() * 0.6,
          })
        }
      }
    }
  }
  // Spray falls as sand.
  g.fillStyle = rgb(sprayColor)
  for (let i = worm.spray.length - 1; i >= 0; i -= 1) {
    const p = worm.spray[i]!
    p.age += dt
    if (p.age > p.life || worm.spray.length > 90) {
      worm.spray.splice(i, 1)
      continue
    }
    p.vy += 42 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    g.globalAlpha = 0.7 * (1 - p.age / p.life)
    g.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1)
  }
  g.globalAlpha = 1
}

export function drawCrawlersOnDune(g: CanvasRenderingContext2D, crawlers: Crawler[], ridge: DuneRidge, w: number, dt: number): void {
  for (const crawler of crawlers) {
    crawler.x += crawler.dir * crawler.speed * dt
    if (crawler.x > w + 2) crawler.x = -2
    if (crawler.x < -2) crawler.x = w + 2
    const y = Math.floor(duneY(ridge, w, crawler.x)) + 2
    drawGlow(g, crawler.x, y, 2, [255, 217, 160], 0.5)
    g.fillStyle = '#ffd9a0'
    g.fillRect(Math.floor(crawler.x), y, 1, 1)
    g.fillStyle = crawler.rear ? '#ff5a4a' : '#ffb45e'
    g.fillRect(Math.floor(crawler.x - crawler.dir), y, 1, 1)
    g.fillStyle = 'rgba(255,217,160,0.18)'
    g.fillRect(Math.floor(crawler.x - crawler.dir * 3), y, 2, 1)
  }
}

interface Puff {
  x: number
  y: number
  age: number
  life: number
  size: number
}

export interface Smoke {
  puffs: Puff[]
  acc: number
}

export function makeSmoke(): Smoke {
  return { puffs: [], acc: 0 }
}

export function drawSmoke(g: CanvasRenderingContext2D, smoke: Smoke, stacks: Array<{ x: number; topY: number }>, dt: number, color: string): void {
  smoke.acc += dt
  while (smoke.acc > 0.5) {
    smoke.acc -= 0.5
    if (stacks.length > 0 && smoke.puffs.length < 26) {
      const stack = stacks[Math.floor(Math.random() * stacks.length)]!
      smoke.puffs.push({
        x: stack.x + (Math.random() - 0.5) * 2,
        y: stack.topY,
        age: 0,
        life: 4 + Math.random() * 3,
        size: 1 + Math.floor(Math.random() * 2),
      })
    }
  }
  for (let i = smoke.puffs.length - 1; i >= 0; i -= 1) {
    const puff = smoke.puffs[i]!
    puff.age += dt
    if (puff.age > puff.life) {
      smoke.puffs.splice(i, 1)
      continue
    }
    puff.y -= dt * 2.2
    puff.x += dt * 1.5
    g.fillStyle = color
    g.globalAlpha = 0.16 * (1 - puff.age / puff.life)
    const size = puff.size + Math.floor(puff.age * 0.5)
    g.fillRect(Math.floor(puff.x), Math.floor(puff.y), size, size)
  }
  g.globalAlpha = 1
}

export interface Thopter {
  active: boolean
  x: number
  y: number
  vx: number
  next: number
}

export function makeThopter(): Thopter {
  return { active: false, x: 0, y: 0, vx: 0, next: 12 }
}

export function drawThopter(g: CanvasRenderingContext2D, thopter: Thopter, w: number, h: number, t: number, dt: number, body: string): void {
  if (!thopter.active && t > thopter.next) {
    const dir = Math.random() < 0.5 ? 1 : -1
    thopter.active = true
    thopter.x = dir > 0 ? -8 : w + 8
    thopter.vx = dir * (6 + Math.random() * 5)
    thopter.y = h * (0.1 + Math.random() * 0.18)
  }
  if (!thopter.active) return
  thopter.x += thopter.vx * dt
  if (thopter.x < -10 || thopter.x > w + 10) {
    thopter.active = false
    thopter.next = t + 45 + Math.random() * 40
    return
  }
  const flap = Math.sin(t * 28) > 0
  const bob = Math.sin(t * 2.1) * 0.8
  const x = Math.floor(thopter.x)
  const y = Math.floor(thopter.y + bob)
  g.fillStyle = body
  g.fillRect(x - 1, y, 3, 1)
  g.fillRect(x - 2, y + (flap ? -1 : 1), 1, 1)
  g.fillRect(x + 2, y + (flap ? -1 : 1), 1, 1)
  if ((t * 2) % 1 < 0.25) {
    g.fillStyle = '#ffffff'
    g.fillRect(x + 1, y, 1, 1)
    drawGlow(g, x + 1, y, 2, [255, 255, 255], 0.5)
  }
}

export interface Bird {
  x: number
  y: number
  vx: number
  phase: number
}

export function makeBirds(count: number, w: number, h: number, rng: () => number): Bird[] {
  const birds: Bird[] = []
  for (let i = 0; i < count; i += 1) {
    birds.push({ x: rng() * w, y: h * (0.08 + rng() * 0.2), vx: 4 + rng() * 4, phase: rng() * Math.PI * 2 })
  }
  return birds
}

export function drawBirds(g: CanvasRenderingContext2D, birds: Bird[], w: number, h: number, t: number, dt: number, color: string): void {
  g.fillStyle = color
  for (const bird of birds) {
    bird.x += bird.vx * dt
    if (bird.x > w + 4) {
      bird.x = -4
      bird.y = h * (0.08 + Math.random() * 0.2)
    }
    const up = Math.sin(t * 9 + bird.phase) > 0
    const x = Math.floor(bird.x)
    const y = Math.floor(bird.y)
    g.fillRect(x - 1, y + (up ? -1 : 0), 1, 1)
    g.fillRect(x + 1, y + (up ? -1 : 0), 1, 1)
  }
}

export function drawGlints(g: CanvasRenderingContext2D, windows: LitWindow[], t: number): void {
  g.fillStyle = '#fff8e2'
  const count = Math.min(12, windows.length)
  for (let i = 0; i < count; i += 1) {
    const window = windows[(i * 37) % Math.max(1, windows.length)]
    if (!window) continue
    const sparkle = Math.pow(Math.max(0, Math.sin(t * 0.7 + i * 2.4)), 8)
    if (sparkle > 0.2) {
      g.globalAlpha = sparkle
      g.fillRect(window.x, window.y, 1, 1)
    }
  }
  g.globalAlpha = 1
}

export interface DuneRidge {
  baseY: number
  amp: number
  waves: number
  phase: number
  color: Rgb
  crest: string
  shadow: Rgb
}

function duneY(ridge: DuneRidge, w: number, x: number): number {
  const k = (x / w) * Math.PI * 2 * ridge.waves + ridge.phase
  return ridge.baseY + Math.sin(k) * ridge.amp + Math.sin(k * 2.3 + 1.7) * ridge.amp * 0.35
}

export function duneRidgesNight(w: number, h: number): DuneRidge[] {
  return [
    { baseY: h * 0.8, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: [21, 12, 6], crest: '#6b4423', shadow: [10, 6, 3] },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: [13, 7, 4], crest: '#8a5427', shadow: [6, 3, 2] },
    { baseY: h * 0.96, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: [6, 3, 2], crest: '#a86a2e', shadow: [2, 2, 2] },
  ]
}

export function duneRidgesDay(w: number, h: number): DuneRidge[] {
  void w
  return [
    { baseY: h * 0.79, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: [201, 154, 94], crest: '#ffe9bf', shadow: [168, 122, 62] },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: [179, 129, 71], crest: '#ffedc9', shadow: [138, 95, 48] },
    { baseY: h * 0.97, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: [150, 98, 47], crest: '#fff3d9', shadow: [110, 69, 31] },
  ]
}

export function drawRidge(g: CanvasRenderingContext2D, w: number, h: number, ridge: DuneRidge, ripples: number): void {
  // Body.
  g.fillStyle = rgb(ridge.color)
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 1) {
    g.lineTo(x, duneY(ridge, w, x))
  }
  g.lineTo(w, h)
  g.closePath()
  g.fill()
  // Lit crest line, brighter on windward rise.
  for (let x = 0; x < w; x += 2) {
    const slope = duneY(ridge, w, x) - duneY(ridge, w, x + 2)
    g.fillStyle = slope > 0.25 ? ridge.crest : 'rgba(255,255,255,0.05)'
    g.fillRect(x, Math.floor(duneY(ridge, w, x)), 2, 1)
  }
  // Slip-face shadow with dithered band.
  g.fillStyle = rgb(ridge.shadow)
  for (let x = 0; x < w; x += 2) {
    const slope = duneY(ridge, w, x + 2) - duneY(ridge, w, x - 2)
    if (slope > 0.4) {
      g.fillRect(x, Math.floor(duneY(ridge, w, x)) + 1, 2, 3)
    }
  }
  // Wind ripples: short dashes on the lee slope.
  const rng = mulberry(Math.floor(ridge.phase * 1000) + w)
  for (let i = 0; i < ripples; i += 1) {
    const x = Math.floor(rng() * w)
    const y = duneY(ridge, w, x) + 3 + rng() * 7
    g.globalAlpha = 0.25
    g.fillStyle = ridge.crest
    g.fillRect(x, Math.floor(y), 2 + Math.floor(rng() * 3), 1)
  }
  g.globalAlpha = 1
}

export function drawDuneField(g: CanvasRenderingContext2D, w: number, h: number, ridges: DuneRidge[], _rng: () => number): void {
  void _rng
  for (const ridge of ridges) {
    drawRidge(g, w, h, ridge, 24)
  }
}

export interface CrestFlow {
  x: number
  ridge: number
  speed: number
}

export function makeCrestFlow(count: number, w: number, rng: () => number): CrestFlow[] {
  const parts: CrestFlow[] = []
  for (let i = 0; i < count; i += 1) {
    parts.push({ x: rng() * w, ridge: Math.floor(rng() * 3), speed: 4 + rng() * 7 })
  }
  return parts
}

export function drawCrestFlow(
  g: CanvasRenderingContext2D,
  flow: CrestFlow[],
  ridges: DuneRidge[],
  w: number,
  dt: number,
  color: string,
  allowed: number[],
): void {
  g.fillStyle = color
  for (const part of flow) {
    if (!allowed.includes(part.ridge)) continue
    part.x += part.speed * dt
    if (part.x > w + 2) part.x = -2
    const ridge = ridges[part.ridge]!
    g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(part.x * 0.3))
    g.fillRect(Math.floor(part.x), Math.floor(duneY(ridge, w, part.x)), 2, 1)
  }
  g.globalAlpha = 1
}

export function drawMesas(g: CanvasRenderingContext2D, w: number, baseY: number, mesas: Mesa[], body: Rgb, lit: string, shadow: Rgb): void {
  for (const mesa of mesas) {
    const topW = Math.max(2, Math.floor(mesa.w * 0.55))
    const inset = Math.floor((mesa.w - topW) / 2)
    // Silhouette.
    g.fillStyle = rgb(body)
    g.beginPath()
    g.moveTo(mesa.x, baseY)
    g.lineTo(mesa.x + inset, baseY - mesa.h)
    g.lineTo(mesa.x + inset + topW, baseY - mesa.h)
    g.lineTo(mesa.x + mesa.w, baseY)
    g.closePath()
    g.fill()
    // Sunlit rim along top edge.
    g.fillStyle = lit
    g.fillRect(mesa.x + inset, baseY - mesa.h, topW, 1)
    // Dithered shadow flank.
    g.fillStyle = rgb(shadow)
    for (let y = 0; y < mesa.h; y += 2) {
      const t = y / mesa.h
      const leftEdge = mesa.x + inset * t
      for (let px = 0; px < 3; px += 1) {
        if (BAYER4[(y % 4) * 4 + (px % 4)]! < 6) {
          g.fillRect(Math.floor(leftEdge + px), baseY - mesa.h + y, 1, 2)
        }
      }
    }
  }
}

export interface Mesa {
  x: number
  w: number
  h: number
}
