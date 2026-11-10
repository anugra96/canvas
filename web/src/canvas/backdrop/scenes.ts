import { auroraShore } from './auroraShore'

export type BackdropSceneId = 'dune-night' | 'dune-day' | 'tide' | 'ember' | 'void' | 'aurora-shore'

export interface SceneCam {
  x: number
  y: number
}

export interface BackdropScene {
  id: BackdropSceneId
  init: (w: number, h: number, rng: () => number) => unknown
  paintStatic: (g: CanvasRenderingContext2D, w: number, h: number, rng: () => number) => void
  paintDynamic: (g: CanvasRenderingContext2D, w: number, h: number, t: number, cam: SceneCam, state: unknown) => void
}

export function mulberry(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

type Rgb = [number, number, number]

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function rgb(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function sampleStops(stops: Array<[number, Rgb]>, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t))
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [at0, c0] = stops[i]!
    const [at1, c1] = stops[i + 1]!
    if (clamped >= at0 && clamped <= at1) {
      return mix(c0, c1, (clamped - at0) / Math.max(0.0001, at1 - at0))
    }
  }
  return stops[stops.length - 1]![1]
}

function fillDithered(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  a: Rgb,
  b: Rgb,
  amount: number,
): void {
  g.fillStyle = rgb(a)
  g.fillRect(x, y, w, h)
  if (amount <= 0) return
  if (amount >= 1) {
    g.fillStyle = rgb(b)
    g.fillRect(x, y, w, h)
    return
  }
  g.fillStyle = rgb(b)
  const threshold = amount * 16
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      if (BAYER4[(py % 4) * 4 + (px % 4)]! < threshold) {
        g.fillRect(x + px, y + py, 1, 1)
      }
    }
  }
}

// Dithered vertical gradient: quantized bands with Bayer seams between them.
function skyBands(g: CanvasRenderingContext2D, w: number, h: number, stops: Array<[number, Rgb]>, y0 = 0): void {
  const bands = Math.max(8, Math.floor(h / 2))
  let prev: Rgb | null = null
  for (let band = 0; band < bands; band += 1) {
    const t = (band + 0.5) / bands
    const c = sampleStops(stops, t)
    const y = y0 + Math.floor(band * h / bands)
    const height = Math.floor((band + 1) * h / bands) - Math.floor(band * h / bands)
    if (prev && (Math.abs(prev[0] - c[0]) > 3 || Math.abs(prev[1] - c[1]) > 3 || Math.abs(prev[2] - c[2]) > 3)) {
      fillDithered(g, 0, y, w, height, prev, c, 0.5)
    } else {
      g.fillStyle = rgb(c)
      g.fillRect(0, y, w, height)
    }
    prev = c
  }
}

const glowCache = new Map<string, HTMLCanvasElement>()

function glowSprite(r: number, green: number, blue: number): HTMLCanvasElement {
  const size = Math.max(4, Math.ceil(r / 4) * 4)
  const key = `${size}:${r}:${green}:${blue}`
  const cached = glowCache.get(key)
  if (cached) return cached
  const sprite = document.createElement('canvas')
  sprite.width = size * 2
  sprite.height = size * 2
  const ctx = sprite.getContext('2d')!
  const gradient = ctx.createRadialGradient(size, size, 0, size, size, size)
  gradient.addColorStop(0, `rgba(${r},${green},${blue},0.85)`)
  gradient.addColorStop(0.4, `rgba(${r},${green},${blue},0.32)`)
  gradient.addColorStop(1, `rgba(${r},${green},${blue},0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size * 2, size * 2)
  glowCache.set(key, sprite)
  return sprite
}

function drawGlow(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: [number, number, number], alpha: number): void {
  const sprite = glowSprite(color[0], color[1], color[2])
  g.globalAlpha = alpha
  g.drawImage(sprite, Math.floor(x - radius), Math.floor(y - radius), radius * 2, radius * 2)
  g.globalAlpha = 1
}

function drawSphere(
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

function drawRimLight(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, lightX: number, lightY: number, color: string): void {
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

interface Star {
  x: number
  y: number
  phase: number
  speed: number
  mag: number
}

function makeStars(count: number, w: number, maxY: number, rng: () => number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.floor(rng() * w),
      y: Math.floor(rng() * maxY),
      phase: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 1.2,
      mag: rng(),
    })
  }
  return stars
}

function drawStars(g: CanvasRenderingContext2D, stars: Star[], t: number, color: string): void {
  g.fillStyle = color
  for (const star of stars) {
    const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase))
    const bright = star.mag * twinkle
    if (bright < 0.25) continue
    g.globalAlpha = Math.min(0.9, bright)
    if (star.mag > 0.9) {
      g.fillRect(star.x - 1, star.y, 3, 1)
      g.fillRect(star.x, star.y - 1, 1, 3)
    } else {
      g.fillRect(star.x, star.y, 1, 1)
    }
  }
  g.globalAlpha = 1
}

// Milky Way: dense faint star dust with dithered nebular haze.
function drawMilkyWay(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, tint: Rgb): void {
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

function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number, base: Rgb, glowColor: [number, number, number]): void {
  drawGlow(g, x, y, r * 3, glowColor, 0.2)
  drawSphere(g, x, y, r, -0.6, -0.4, base, mix(base, [8, 8, 12], 0.82), mix(base, [255, 255, 255], 0.5))
  // Craters.
  g.fillStyle = rgb(mix(base, [0, 0, 0], 0.25))
  g.fillRect(x - Math.floor(r * 0.4), y - Math.floor(r * 0.1), Math.max(1, Math.floor(r * 0.28)), Math.max(1, Math.floor(r * 0.28)))
  g.fillRect(x + Math.floor(r * 0.1), y + Math.floor(r * 0.3), Math.max(1, Math.floor(r * 0.2)), Math.max(1, Math.floor(r * 0.2)))
}

interface LitWindow {
  x: number
  y: number
  warm: boolean
}

interface Beacon {
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

interface City {
  silhouette: Block[]
  windows: LitWindow[]
  beacons: Beacon[]
  doors: number[]
  flicker: number[]
  stacks: Array<{ x: number; topY: number }>
  baseY: number
}

function makeCity(rng: () => number, w: number, baseY: number, maxH: number, litRatio: number): City {
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

function drawCity(g: CanvasRenderingContext2D, city: City, body: Rgb, lit: string, dim: string, edge: string): void {
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

function drawFlicker(g: CanvasRenderingContext2D, city: City, body: Rgb, lit: string, cool: string, t: number): void {
  for (const idx of city.flicker) {
    const window = city.windows[idx]
    if (!window) continue
    const on = (Math.floor(t * 0.7 + idx * 13.7) % 4) !== 0
    g.fillStyle = on ? (window.warm ? lit : cool) : rgb(body)
    g.fillRect(window.x, window.y, 1, 1)
  }
}

function drawBeacons(g: CanvasRenderingContext2D, beacons: Beacon[], t: number): void {
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

function drawFarSkyline(g: CanvasRenderingContext2D, w: number, baseY: number, maxH: number, color: Rgb, rng: () => number): void {
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

interface Drift {
  x: number
  y: number
  vx: number
  len: number
  alpha: number
}

function makeDrift(count: number, w: number, y0: number, y1: number, rng: () => number): Drift[] {
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

function drawDrift(g: CanvasRenderingContext2D, parts: Drift[], w: number, dt: number, color: string): void {
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

interface Crawler {
  x: number
  dir: 1 | -1
  speed: number
  rear: boolean
}

function makeCrawlers(count: number, w: number, rng: () => number): Crawler[] {
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

interface SandWorm {
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

function makeWorm(rng: () => number): SandWorm {
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

function drawWorm(
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

function drawCrawlersOnDune(g: CanvasRenderingContext2D, crawlers: Crawler[], ridge: DuneRidge, w: number, dt: number): void {
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

interface Smoke {
  puffs: Puff[]
  acc: number
}

function makeSmoke(): Smoke {
  return { puffs: [], acc: 0 }
}

function drawSmoke(g: CanvasRenderingContext2D, smoke: Smoke, stacks: Array<{ x: number; topY: number }>, dt: number, color: string): void {
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

interface Thopter {
  active: boolean
  x: number
  y: number
  vx: number
  next: number
}

function makeThopter(): Thopter {
  return { active: false, x: 0, y: 0, vx: 0, next: 12 }
}

function drawThopter(g: CanvasRenderingContext2D, thopter: Thopter, w: number, h: number, t: number, dt: number, body: string): void {
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

interface Bird {
  x: number
  y: number
  vx: number
  phase: number
}

function makeBirds(count: number, w: number, h: number, rng: () => number): Bird[] {
  const birds: Bird[] = []
  for (let i = 0; i < count; i += 1) {
    birds.push({ x: rng() * w, y: h * (0.08 + rng() * 0.2), vx: 4 + rng() * 4, phase: rng() * Math.PI * 2 })
  }
  return birds
}

function drawBirds(g: CanvasRenderingContext2D, birds: Bird[], w: number, h: number, t: number, dt: number, color: string): void {
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

function drawGlints(g: CanvasRenderingContext2D, windows: LitWindow[], t: number): void {
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

interface DuneRidge {
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

function duneRidgesNight(w: number, h: number): DuneRidge[] {
  return [
    { baseY: h * 0.8, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: [21, 12, 6], crest: '#6b4423', shadow: [10, 6, 3] },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: [13, 7, 4], crest: '#8a5427', shadow: [6, 3, 2] },
    { baseY: h * 0.96, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: [6, 3, 2], crest: '#a86a2e', shadow: [2, 2, 2] },
  ]
}

function duneRidgesDay(w: number, h: number): DuneRidge[] {
  void w
  return [
    { baseY: h * 0.79, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: [201, 154, 94], crest: '#ffe9bf', shadow: [168, 122, 62] },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: [179, 129, 71], crest: '#ffedc9', shadow: [138, 95, 48] },
    { baseY: h * 0.97, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: [150, 98, 47], crest: '#fff3d9', shadow: [110, 69, 31] },
  ]
}

function drawRidge(g: CanvasRenderingContext2D, w: number, h: number, ridge: DuneRidge, ripples: number): void {
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

function drawDuneField(g: CanvasRenderingContext2D, w: number, h: number, ridges: DuneRidge[], _rng: () => number): void {
  void _rng
  for (const ridge of ridges) {
    drawRidge(g, w, h, ridge, 24)
  }
}

interface CrestFlow {
  x: number
  ridge: number
  speed: number
}

function makeCrestFlow(count: number, w: number, rng: () => number): CrestFlow[] {
  const parts: CrestFlow[] = []
  for (let i = 0; i < count; i += 1) {
    parts.push({ x: rng() * w, ridge: Math.floor(rng() * 3), speed: 4 + rng() * 7 })
  }
  return parts
}

function drawCrestFlow(
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

function drawMesas(g: CanvasRenderingContext2D, w: number, baseY: number, mesas: Mesa[], body: Rgb, lit: string, shadow: Rgb): void {
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

interface Mesa {
  x: number
  w: number
  h: number
}

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

const duneNight: BackdropScene = {
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

interface DuneDayState {
  city: City
  dust: Drift[]
  ridges: DuneRidge[]
  flow: CrestFlow[]
  birds: Bird[]
  thopter: Thopter
  worm: SandWorm
}

const duneDay: BackdropScene = {
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

const tide: BackdropScene = {
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

const ember: BackdropScene = {
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

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  age: number
}

interface DustMote {
  a: number
  rad: number
  speed: number
  lift: number
  alpha: number
}

interface VoidState {
  stars: Star[]
  meteors: Meteor[]
  nextMeteor: number
  hole: { cx: number; cy: number; r: number }
  dust: DustMote[]
  ship: { active: boolean; x: number; y: number; next: number }
  asteroid: { x: number; y: number; vx: number; vy: number; size: number }
  moonPhase: number
  flare: number
  nextFlare: number
  beam: number
}

function drawDistantGalaxy(g: CanvasRenderingContext2D, x: number, y: number, size: number, rng: () => number): void {
  drawGlow(g, x, y, size * 1.8, [130, 145, 205], 0.09)
  // Dithered elliptical core.
  for (let py = -Math.floor(size * 0.3); py <= Math.floor(size * 0.3); py += 1) {
    for (let px = -size; px <= size; px += 1) {
      const d = (px / size) ** 2 + (py / (size * 0.3)) ** 2
      if (d > 1) continue
      const bayer = BAYER4[((py + y) % 4 + 4) % 4 * 4 + (((px + x) % 4) + 4) % 4]! / 16
      const v = (1 - d) * 0.8 + bayer * 0.2
      if (v < 0.42) continue
      g.fillStyle = v > 0.78 ? '#dfe6ff' : v > 0.6 ? '#9fa9d8' : '#5c6699'
      g.fillRect(x + px, y + py, 1, 1)
    }
  }
  // Two spiral arms in faint speckles.
  for (let i = 0; i < 80; i += 1) {
    const arm = rng() < 0.5 ? 1 : -1
    const r = 2 + rng() * size
    const a = rng() * 2.2 + r * 0.5
    const px = Math.cos(a) * r
    const py = Math.sin(a) * r * 0.32 * arm
    g.fillStyle = rng() < 0.3 ? '#c9d4ff' : '#7e89bd'
    g.globalAlpha = 0.18 + rng() * 0.35
    g.fillRect(Math.floor(x + px), Math.floor(y + py), 1, 1)
  }
  g.globalAlpha = 1
}

function drawGasGiant(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lightX: number,
  lightY: number,
): void {
  const palette: Rgb[] = [
    [26, 32, 50],
    [44, 58, 82],
    [78, 96, 124],
    [124, 142, 166],
    [176, 192, 208],
    [224, 234, 242],
  ]
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
      // Banded cloud structure: latitude bands + slight wobble.
      const bandPos = ny * 5.2 + Math.sin(nx * 2.4) * 0.35
      const wrapped = ((bandPos + 3) % palette.length + palette.length) % palette.length
      const bandIdx = Math.floor(wrapped)
      const bandFrac = wrapped % 1
      const c0 = palette[bandIdx]!
      const c1 = palette[Math.min(palette.length - 1, bandIdx + 1)]!
      const bayer = BAYER4[(((py + cy) % 4) + 4) % 4 * 4 + (((px + cx) % 4) + 4) % 4]! / 16
      let c = bayer < bandFrac ? c1 : c0
      if (lambert < 0.34) {
        c = mix(c, [6, 8, 14], 0.86)
      } else if (lambert < 0.52) {
        c = bayer < 0.5 ? mix(c, [6, 8, 14], 0.6) : c
      }
      g.fillStyle = rgb(c)
      g.fillRect(cx + px, cy + py, 1, 1)
    }
  }
  // Ring shadow across the face.
  g.fillStyle = 'rgba(6,8,14,0.35)'
  for (let px = -r; px <= r; px += 1) {
    const y = Math.floor(cy + Math.sin(-0.3) * px * 0.28 - 1)
    if ((px / r) ** 2 < 1) g.fillRect(cx + px, y, 1, 2)
  }
}

function drawRingShip(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const wobble = Math.sin(t * 0.7) * 0.6
  const cy = y + wobble
  // Outer habitat ring, seen at a shallow angle.
  g.strokeStyle = 'rgba(208,222,240,0.6)'
  g.lineWidth = 1
  g.beginPath()
  g.ellipse(x, cy, 5.5, 2, -0.18, 0, Math.PI * 2)
  g.stroke()
  // Inner ring shadow.
  g.strokeStyle = 'rgba(120,140,170,0.4)'
  g.beginPath()
  g.ellipse(x, cy, 3.4, 1.1, -0.18, 0, Math.PI * 2)
  g.stroke()
  // Spine and modules.
  g.fillStyle = 'rgba(232,242,254,0.85)'
  g.fillRect(Math.floor(x - 2), Math.floor(cy), 5, 1)
  g.fillStyle = 'rgba(186,204,228,0.8)'
  g.fillRect(Math.floor(x - 2), Math.floor(cy - 1), 1, 1)
  g.fillRect(Math.floor(x + 2), Math.floor(cy + 1), 1, 1)
  // Engine glow at the stern.
  g.fillStyle = '#ffe0b0'
  g.fillRect(Math.floor(x + 6), Math.floor(cy), 1, 1)
  drawGlow(g, x + 6, cy, 3, [255, 190, 120], 0.4)
}

function drawAsteroid(g: CanvasRenderingContext2D, state: VoidState['asteroid']): void {
  const r = state.size
  drawSphere(g, Math.round(state.x), Math.round(state.y), r, -0.6, -0.5, [86, 82, 78], [26, 24, 22], [148, 142, 132])
  g.fillStyle = 'rgba(20,18,16,0.7)'
  g.fillRect(Math.round(state.x - r * 0.4), Math.round(state.y - r * 0.2), Math.max(1, Math.round(r * 0.4)), Math.max(1, Math.round(r * 0.4)))
  g.fillStyle = 'rgba(190,184,172,0.35)'
  g.fillRect(Math.round(state.x + r * 0.2), Math.round(state.y + r * 0.3), 1, 1)
}

const gargantua: BackdropScene = {
  id: 'void',
  init(w, h, rng) {
    const hole = {
      cx: Math.floor(w * 0.6),
      cy: Math.floor(h * 0.45),
      r: Math.max(6, Math.floor(Math.min(w, h) * 0.12)),
    }
    const dust: DustMote[] = []
    for (let i = 0; i < 90; i += 1) {
      dust.push({
        a: rng() * Math.PI * 2,
        rad: hole.r * (1.6 + rng() * 4.2),
        speed: 0.16 + rng() * 0.3,
        lift: (rng() - 0.5) * 3,
        alpha: 0.12 + rng() * 0.4,
      })
    }
    return {
      stars: makeStars(220, w, h, rng),
      meteors: [],
      nextMeteor: 8 + rng() * 10,
      hole,
      dust,
      ship: { active: false, x: 0, y: 0, next: 14 + rng() * 20 },
      asteroid: {
        x: rng() * w,
        y: h * (0.2 + rng() * 0.5),
        vx: 3 + rng() * 3,
        vy: 0.6 + rng() * 0.8,
        size: 2 + Math.floor(rng() * 2),
      },
      moonPhase: rng() * Math.PI * 2,
      flare: 0,
      nextFlare: 18 + rng() * 20,
      beam: rng() * Math.PI * 2,
    } satisfies VoidState as VoidState
  },
  paintStatic(g, w, h, rng) {
    skyBands(g, w, h, [
      [0, [2, 3, 6]],
      [0.45, [5, 7, 15]],
      [0.8, [8, 12, 24]],
      [1, [4, 6, 13]],
    ], 0)
    // Nebula veils: dithered clouds with warm and cold cores.
    for (let i = 0; i < 7; i += 1) {
      const nx = Math.floor(rng() * w)
      const ny = Math.floor(rng() * h * 0.75)
      const nr = Math.floor(10 + rng() * 26)
      const warm = rng() < 0.45
      drawGlow(g, nx, ny, nr, warm ? [180, 110, 60] : [80, 120, 180], 0.05 + rng() * 0.05)
      for (let j = 0; j < 40; j += 1) {
        const a = rng() * Math.PI * 2
        const d = rng() * nr
        g.fillStyle = warm ? '#3a2418' : '#1e2c44'
        g.globalAlpha = 0.12 + rng() * 0.2
        g.fillRect(Math.floor(nx + Math.cos(a) * d), Math.floor(ny + Math.sin(a) * d * 0.7), 1, 1)
      }
      g.globalAlpha = 1
    }
    drawDistantGalaxy(g, Math.floor(w * 0.17), Math.floor(h * 0.22), Math.max(8, Math.floor(w * 0.05)), rng)
    drawDistantGalaxy(g, Math.floor(w * 0.87), Math.floor(h * 0.13), Math.max(4, Math.floor(w * 0.022)), rng)
    // Galactic dust lane across the disk plane.
    for (let i = 0; i < 220; i += 1) {
      const dx = (rng() + rng() + rng()) / 3 - 0.5
      const dy = (rng() + rng() + rng()) / 3 - 0.5
      const px = Math.floor(w * 0.6 + dx * w * 0.72)
      const py = Math.floor(h * 0.45 + dy * h * 0.16)
      g.fillStyle = rng() < 0.4 ? '#7a5630' : '#4a3220'
      g.globalAlpha = 0.1 + rng() * 0.22
      g.fillRect(px, py, 1, 1)
    }
    g.globalAlpha = 1

    const cx = Math.floor(w * 0.6)
    const cy = Math.floor(h * 0.45)
    const r = Math.max(6, Math.floor(Math.min(w, h) * 0.12))

    // Lensed halo: bright Einstein arcs above, dimmer below.
    for (let i = 0; i < 110; i += 1) {
      const a = Math.PI * 1.08 + (i / 110) * Math.PI * 0.84
      const fade = 1 - Math.abs(a - Math.PI * 1.5) / (Math.PI * 0.42)
      if (fade <= 0) continue
      if (i % 3 === 1) continue
      g.fillStyle = 'rgba(255,225,180,0.55)'
      g.globalAlpha = fade * fade * 0.5
      g.fillRect(Math.floor(cx + Math.cos(a) * r * 1.46), Math.floor(cy + Math.sin(a) * r * 2.08), i % 2 === 0 ? 2 : 1, 1)
      // Outer echo of the lensed ring.
      g.fillStyle = 'rgba(255,205,150,0.3)'
      g.globalAlpha = fade * fade * 0.22
      g.fillRect(Math.floor(cx + Math.cos(a) * r * 1.72), Math.floor(cy + Math.sin(a) * r * 2.4), 1, 1)
    }
    for (let i = 0; i < 90; i += 1) {
      const a = Math.PI * 0.04 + (i / 90) * Math.PI * 0.92
      const fade = 1 - Math.abs(a - Math.PI * 0.5) / (Math.PI * 0.46)
      if (fade <= 0) continue
      g.fillStyle = 'rgba(255,200,150,0.4)'
      g.globalAlpha = fade * fade * 0.32
      g.fillRect(Math.floor(cx + Math.cos(a) * r * 1.34), Math.floor(cy + Math.sin(a) * r * 1.72), 2, 1)
    }
    g.globalAlpha = 1

    // Accretion disk: beamed gradient, brighter on the approaching (left) side.
    const rx = Math.floor(r * 2.7)
    const ry = Math.max(2, Math.floor(r * 0.4))
    g.fillStyle = 'rgba(255,200,140,0.14)'
    g.beginPath()
    g.ellipse(cx, cy, rx, ry + 5, 0, 0, Math.PI * 2)
    g.fill()
    const disk = g.createLinearGradient(cx - rx, 0, cx + rx, 0)
    disk.addColorStop(0, '#fff3dd')
    disk.addColorStop(0.18, '#ffd9a0')
    disk.addColorStop(0.42, '#e8933f')
    disk.addColorStop(0.62, '#8a5220')
    disk.addColorStop(0.85, '#33200f')
    disk.addColorStop(1, '#1c1008')
    g.fillStyle = disk
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
    // Warm haze over the receding half.
    const farHaze = g.createLinearGradient(cx, 0, cx + rx, 0)
    farHaze.addColorStop(0, 'rgba(255,190,120,0)')
    farHaze.addColorStop(0.55, 'rgba(255,180,110,0.1)')
    farHaze.addColorStop(1, 'rgba(230,150,80,0.16)')
    g.fillStyle = farHaze
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
    // Frame-dragging ticks hugging the shadow.
    for (let i = 0; i < 46; i += 1) {
      const a = (i / 46) * Math.PI * 2
      const rr = r * (1.12 + (i % 3) * 0.07)
      g.fillStyle = 'rgba(255,220,180,0.22)'
      g.fillRect(Math.floor(cx + Math.cos(a) * rr), Math.floor(cy + Math.sin(a) * rr), 2, 1)
    }
    // Doppler-brightened inner rim on the left.
    g.strokeStyle = 'rgba(255,248,235,0.75)'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(cx, cy, Math.floor(rx * 0.58), Math.floor(ry * 0.62), 0, Math.PI * 0.62, Math.PI * 1.42)
    g.stroke()
    // Faint orbital streaks in the disk.
    g.fillStyle = 'rgba(255,220,170,0.16)'
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2
      g.fillRect(Math.floor(cx + Math.cos(a) * rx * 0.82), Math.floor(cy + Math.sin(a) * ry * 0.82), 3, 1)
    }

    // Photon ring + event horizon shadow.
    drawGlow(g, cx, cy, r + 5, [255, 235, 200], 0.2)
    g.strokeStyle = '#fff6e6'
    g.lineWidth = 1
    g.beginPath()
    g.arc(cx, cy, r + 1, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#000000'
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()

    // Ringed gas giant.
    const px = Math.floor(w * 0.15)
    const py = Math.floor(h * 0.68)
    const pr = Math.max(5, Math.floor(w / 46))
    const tilt = -0.32
    g.strokeStyle = 'rgba(196,210,228,0.42)'
    g.beginPath()
    g.ellipse(px, py, pr + 6, Math.max(2, Math.floor(pr / 3)), tilt, Math.PI, Math.PI * 2)
    g.stroke()
    g.strokeStyle = 'rgba(150,166,190,0.3)'
    g.beginPath()
    g.ellipse(px, py, pr + 4, Math.max(2, Math.floor(pr / 4)), tilt, Math.PI, Math.PI * 2)
    g.stroke()
    drawGasGiant(g, px, py, pr, -0.55, -0.45)
    drawRimLight(g, px, py, pr, -0.55, -0.45, 'rgba(225,238,252,0.45)')
    g.strokeStyle = 'rgba(206,220,238,0.62)'
    g.beginPath()
    g.ellipse(px, py, pr + 6, Math.max(2, Math.floor(pr / 3)), tilt, 0, Math.PI)
    g.stroke()
    g.strokeStyle = 'rgba(160,176,198,0.4)'
    g.beginPath()
    g.ellipse(px, py, pr + 4, Math.max(2, Math.floor(pr / 4)), tilt, 0, Math.PI)
    g.stroke()

    // A second, distant ice moon low in the frame.
    const mx = Math.floor(w * 0.82)
    const my = Math.floor(h * 0.78)
    const mr = Math.max(2, Math.floor(w / 150))
    drawGlow(g, mx, my, mr * 4, [200, 220, 250], 0.18)
    drawSphere(g, mx, my, mr, -0.5, -0.5, [188, 202, 220], [34, 40, 52], [244, 250, 255])
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as VoidState
    void cam
    const dt = 1 / 60
    drawStars(g, s.stars, t, '#cfe0f4')

    const { cx, cy, r } = s.hole
    const rx = Math.floor(r * 2.7)
    const ry = Math.max(2, Math.floor(r * 0.4))

    // Infalling dust: a slow Keplerian swirl into the disk.
    for (const mote of s.dust) {
      mote.a += mote.speed * dt * (1 + (r / mote.rad) * 1.6)
      mote.rad -= dt * 0.55
      if (mote.rad < r * 1.45) {
        mote.rad = r * (3.4 + Math.random() * 2.4)
        mote.a = Math.random() * Math.PI * 2
        mote.lift = (Math.random() - 0.5) * 3
      }
      const px = cx + Math.cos(mote.a) * mote.rad
      const py = cy + Math.sin(mote.a) * mote.rad * 0.3 + mote.lift
      const closeness = 1 - Math.min(1, (mote.rad - r * 1.45) / (r * 4))
      g.fillStyle = closeness > 0.6 ? '#ffe0b0' : closeness > 0.3 ? '#d79a56' : '#8a6538'
      g.globalAlpha = mote.alpha * (0.35 + closeness * 0.65)
      g.fillRect(Math.floor(px), Math.floor(py), 1, 1)
    }
    g.globalAlpha = 1

    // Disk shimmer: bright arcs orbiting on the near and far plane.
    for (let i = 0; i < 5; i += 1) {
      const a = s.beam + i * ((Math.PI * 2) / 5)
      const dim = Math.sin(a) > 0 ? 1 : 0.45
      g.fillStyle = `rgba(255,232,190,${(0.1 * dim).toFixed(3)})`
      for (let k = 0; k < 10; k += 1) {
        const aa = a + k * 0.04
        g.fillRect(Math.floor(cx + Math.cos(aa) * rx * 0.9), Math.floor(cy + Math.sin(aa) * ry * 0.9), 2, 1)
      }
    }
    s.beam += dt * 0.32

    // Relativistic beaming pulse.
    drawGlow(g, cx - r * 1.5, cy, Math.floor(r * 0.6), [255, 220, 170], 0.1 + 0.05 * Math.sin(t * 0.6))

    // Occasional accretion flare: a hot knot brightening in the disk.
    if (t > s.nextFlare) {
      s.flare = 1
      s.nextFlare = t + 26 + Math.random() * 34
    }
    if (s.flare > 0) {
      s.flare = Math.max(0, s.flare - dt * 0.3)
      const fx = cx - r * 0.75
      drawGlow(g, fx, cy, Math.floor(r * (0.9 + (1 - s.flare) * 1.1)), [255, 245, 220], s.flare * 0.4)
      g.strokeStyle = `rgba(255,240,215,${(0.3 * s.flare).toFixed(3)})`
      g.lineWidth = 1
      g.beginPath()
      g.ellipse(fx, cy, Math.floor(r * (0.5 + (1 - s.flare) * 1.2)), Math.max(1, Math.floor(r * 0.16)), 0, 0, Math.PI * 2)
      g.stroke()
    }

    // Ring ship drifting across the sky.
    if (!s.ship.active && t > s.ship.next) {
      s.ship.active = true
      s.ship.x = Math.random() < 0.5 ? -10 : w + 10
      s.ship.y = h * (0.14 + Math.random() * 0.2)
    }
    if (s.ship.active) {
      const dir = s.ship.x < w / 2 ? 1 : -1
      s.ship.x += dir * 2.2 * dt * 3
      if (s.ship.x < -14 || s.ship.x > w + 14) {
        s.ship.active = false
        s.ship.next = t + 70 + Math.random() * 70
      } else {
        drawRingShip(g, s.ship.x, s.ship.y, t)
      }
    }

    // Asteroid tumbling slowly across the frame.
    s.asteroid.x += s.asteroid.vx * dt
    s.asteroid.y += Math.sin(t * 0.4) * 0.15 + s.asteroid.vy * dt
    if (s.asteroid.x > w + 8) {
      s.asteroid.x = -8
      s.asteroid.y = h * (0.15 + Math.random() * 0.5)
      s.asteroid.vy = (Math.random() - 0.5) * 1.4
    }
    drawAsteroid(g, s.asteroid)

    // Orbiting ice moon around the gas giant.
    const px = Math.floor(w * 0.15)
    const py = Math.floor(h * 0.68)
    const pr = Math.max(5, Math.floor(w / 46))
    const orbR = pr + 11
    const mA = s.moonPhase + t * 0.11
    const mx = px + Math.cos(mA) * orbR
    const my = py + Math.sin(mA) * orbR * 0.34
    const behind = Math.sin(mA) < 0
    if (behind) {
      drawGlow(g, mx, my, 3, [210, 226, 250], 0.25)
      drawSphere(g, Math.round(mx), Math.round(my), 1, -0.5, -0.5, [190, 204, 220], [40, 46, 58], [240, 246, 252])
    }

    // Meteors.
    if (t > s.nextMeteor) {
      const fromLeft = Math.random() < 0.5
      s.meteors.push({
        x: fromLeft ? -4 : w + 4,
        y: Math.random() * h * 0.5,
        vx: (fromLeft ? 1 : -1) * (22 + Math.random() * 18),
        vy: 6 + Math.random() * 6,
        life: 1.4,
        age: 0,
      })
      s.nextMeteor = t + 11 + Math.random() * 16
    }
    for (let i = s.meteors.length - 1; i >= 0; i -= 1) {
      const meteor = s.meteors[i]!
      meteor.age += dt
      if (meteor.age > meteor.life) {
        s.meteors.splice(i, 1)
        continue
      }
      meteor.x += meteor.vx * dt
      meteor.y += meteor.vy * dt
      const fade = 1 - meteor.age / meteor.life
      g.fillStyle = '#ffffff'
      g.globalAlpha = 0.85 * fade
      g.fillRect(Math.floor(meteor.x), Math.floor(meteor.y), 1, 1)
      drawGlow(g, meteor.x, meteor.y, 3, [200, 220, 255], fade * 0.5)
      g.fillStyle = '#8fb8d6'
      g.globalAlpha = 0.4 * fade
      const tail = 3
      for (let k = 1; k <= tail; k += 1) {
        g.fillRect(Math.floor(meteor.x - Math.sign(meteor.vx) * k * 1.5), Math.floor(meteor.y - k * 0.4), 1, 1)
      }
    }
    g.globalAlpha = 1

    // Moon passing in front of the planet last, so it occludes correctly.
    if (!behind) {
      drawGlow(g, mx, my, 3, [210, 226, 250], 0.3)
      drawSphere(g, Math.round(mx), Math.round(my), 1, -0.5, -0.5, [200, 214, 230], [46, 52, 64], [246, 250, 255])
    }
  },
}

export const SCENES: Record<BackdropSceneId, BackdropScene> = {
  'dune-night': duneNight,
  'dune-day': duneDay,
  tide,
  ember,
  void: gargantua,
  'aurora-shore': auroraShore,
}
