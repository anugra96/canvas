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

function sky(g: CanvasRenderingContext2D, w: number, h: number, stops: Array<[number, string]>): void {
  const gradient = g.createLinearGradient(0, 0, 0, h)
  for (const [at, color] of stops) gradient.addColorStop(at, color)
  g.fillStyle = gradient
  g.fillRect(0, 0, w, h)
}

interface Star {
  x: number
  y: number
  phase: number
  speed: number
}

function makeStars(count: number, w: number, h: number, maxY: number, rng: () => number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.floor(rng() * w),
      y: Math.floor(rng() * maxY),
      phase: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 1.2,
    })
  }
  return stars
}

function drawStars(g: CanvasRenderingContext2D, stars: Star[], t: number, color: string): void {
  g.fillStyle = color
  for (const star of stars) {
    const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase))
    g.globalAlpha = twinkle * 0.8
    g.fillRect(star.x, star.y, 1, 1)
  }
  g.globalAlpha = 1
}

function moon(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glow: string): void {
  const gradient = g.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2)
  gradient.addColorStop(0, glow)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gradient
  g.fillRect(Math.floor(x - r * 2.2), Math.floor(y - r * 2.2), Math.ceil(r * 4.4), Math.ceil(r * 4.4))
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

interface Mesa {
  x: number
  w: number
  h: number
}

function drawMesas(g: CanvasRenderingContext2D, w: number, baseY: number, color: string, mesas: Mesa[]): void {
  g.fillStyle = color
  for (const mesa of mesas) {
    const topW = Math.max(2, Math.floor(mesa.w * 0.55))
    const x0 = mesa.x
    g.beginPath()
    g.moveTo(x0, baseY)
    g.lineTo(x0 + Math.floor((mesa.w - topW) / 2), baseY - mesa.h)
    g.lineTo(x0 + Math.floor((mesa.w - topW) / 2) + topW, baseY - mesa.h)
    g.lineTo(x0 + mesa.w, baseY)
    g.closePath()
    g.fill()
  }
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

function pushBeacon(beacons: Beacon[], x: number, y: number, rng: () => number, color?: string): void {
  beacons.push({
    x,
    y,
    period: 2 + rng() * 4,
    phase: rng() * Math.PI * 2,
    color: color ?? (rng() < 0.6 ? '#ff5a4a' : '#ffe9c4'),
  })
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
    if (kind === 'spire') {
      if (rng() < 0.7) pushBeacon(beacons, x + Math.floor(bw / 2), baseY - bh - 4, rng)
    } else if (antenna) {
      if (rng() < 0.7) pushBeacon(beacons, x + Math.floor(bw / 2), baseY - bh - 4, rng)
    } else if (kind === 'pad') {
      const lights = 2 + Math.floor(rng() * 3)
      for (let i = 0; i < lights; i += 1) {
        pushBeacon(beacons, x + 1 + i * 2, baseY - bh - 1, rng, '#ffb45e')
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

function drawCity(g: CanvasRenderingContext2D, city: City, body: string, lit: string, dim: string): void {
  for (const block of city.silhouette) {
    const top = city.baseY - block.h
    g.fillStyle = body
    if (block.kind === 'dome') {
      g.fillRect(block.x, top + 2, block.w, block.h - 2)
      g.beginPath()
      g.arc(block.x + block.w / 2, top + 2, block.w / 2, Math.PI, 0)
      g.fill()
    } else {
      g.fillRect(block.x, top, block.w, block.h)
    }
    if (block.kind === 'spire') {
      g.fillRect(block.x + Math.floor(block.w / 2), top - 3, 1, 3)
    }
    if (block.antenna) {
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

function drawFlicker(g: CanvasRenderingContext2D, city: City, body: string, lit: string, cool: string, t: number): void {
  for (const idx of city.flicker) {
    const window = city.windows[idx]
    if (!window) continue
    const on = (Math.floor(t * 0.7 + idx * 13.7) % 4) !== 0
    g.fillStyle = on ? (window.warm ? lit : cool) : body
    g.fillRect(window.x, window.y, 1, 1)
  }
}

function drawBeacons(g: CanvasRenderingContext2D, beacons: Beacon[], t: number): void {
  for (const beacon of beacons) {
    const on = 0.5 + 0.5 * Math.sin((t / beacon.period) * Math.PI * 2 + beacon.phase)
    if (on > 0.55) {
      g.fillStyle = beacon.color
      g.globalAlpha = Math.min(1, (on - 0.55) * 2.5)
      g.fillRect(beacon.x, beacon.y, 1, 1)
      g.globalAlpha = 1
    }
  }
}

interface Drift {
  x: number
  y: number
  vx: number
  len: number
  alpha: number
}

function makeDrift(count: number, w: number, h: number, y0: number, y1: number, rng: () => number): Drift[] {
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

function drawCrawlersOnDune(g: CanvasRenderingContext2D, crawlers: Crawler[], ridge: DuneRidge, w: number, dt: number): void {
  for (const crawler of crawlers) {
    crawler.x += crawler.dir * crawler.speed * dt
    if (crawler.x > w + 2) crawler.x = -2
    if (crawler.x < -2) crawler.x = w + 2
    const y = Math.floor(duneY(ridge, w, crawler.x)) + 2
    g.fillStyle = '#ffd9a0'
    g.fillRect(Math.floor(crawler.x), y, 1, 1)
    g.fillStyle = crawler.rear ? '#ff5a4a' : '#ffb45e'
    g.fillRect(Math.floor(crawler.x - crawler.dir), y, 1, 1)
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
  const x = Math.floor(thopter.x)
  const y = Math.floor(thopter.y)
  g.fillStyle = body
  g.fillRect(x - 1, y, 3, 1)
  g.fillRect(x - 2, y + (flap ? -1 : 1), 1, 1)
  g.fillRect(x + 2, y + (flap ? -1 : 1), 1, 1)
  if ((t * 2) % 1 < 0.25) {
    g.fillStyle = '#ffffff'
    g.fillRect(x + 1, y, 1, 1)
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

function drawBeam(g: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, color: string): void {
  for (let d = 4; d < len; d += 2) {
    const spread = 1 + Math.floor(d / 10)
    const alpha = 0.09 * (1 - d / len)
    g.fillStyle = color
    g.globalAlpha = alpha
    g.fillRect(Math.floor(x + Math.cos(angle) * d) - Math.floor(spread / 2), Math.floor(y + Math.sin(angle) * d), spread, 1)
  }
  g.globalAlpha = 1
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
  g.fillStyle = '#ffe9c4'
  g.fillRect(x - 1, seaY - 3, 1, 1)
  g.fillStyle = '#ff5a4a'
  g.fillRect(x + (ship.dir > 0 ? 3 : -3), seaY - 2, 1, 1)
}

interface DuneRidge {
  baseY: number
  amp: number
  waves: number
  phase: number
  color: string
  crest: string
  shadow: string
}

function duneY(ridge: DuneRidge, w: number, x: number): number {
  const k = (x / w) * Math.PI * 2 * ridge.waves + ridge.phase
  return ridge.baseY + Math.sin(k) * ridge.amp + Math.sin(k * 2.3 + 1.7) * ridge.amp * 0.35
}

function duneRidgesNight(w: number, h: number): DuneRidge[] {
  return [
    { baseY: h * 0.8, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: '#150c06', crest: '#6b4423', shadow: '#0a0603' },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: '#0d0704', crest: '#8a5427', shadow: '#060302' },
    { baseY: h * 0.96, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: '#060302', crest: '#a86a2e', shadow: '#020202' },
  ]
}

function duneRidgesDay(w: number, h: number): DuneRidge[] {
  void w
  return [
    { baseY: h * 0.79, amp: Math.max(2, h * 0.02), waves: 2.5, phase: 0.6, color: '#c99a5e', crest: '#ffe9bf', shadow: '#a87a3e' },
    { baseY: h * 0.87, amp: Math.max(3, h * 0.03), waves: 1.75, phase: 2.1, color: '#b38147', crest: '#ffedc9', shadow: '#8a5f30' },
    { baseY: h * 0.97, amp: Math.max(4, h * 0.045), waves: 1.25, phase: 4.4, color: '#96622f', crest: '#fff3d9', shadow: '#6e451f' },
  ]
}

function drawDuneField(g: CanvasRenderingContext2D, w: number, h: number, ridges: DuneRidge[]): void {
  for (const ridge of ridges) {
    g.fillStyle = ridge.color
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += 1) {
      g.lineTo(x, duneY(ridge, w, x))
    }
    g.lineTo(w, h)
    g.closePath()
    g.fill()
    // Moonlit crest line.
    g.fillStyle = ridge.crest
    for (let x = 0; x < w; x += 2) {
      g.fillRect(x, Math.floor(duneY(ridge, w, x)), 2, 1)
    }
    // Slip-face shadow on the descending slopes.
    g.fillStyle = ridge.shadow
    for (let x = 0; x < w; x += 2) {
      const slope = duneY(ridge, w, x + 2) - duneY(ridge, w, x - 2)
      if (slope > 0.4) {
        g.fillRect(x, Math.floor(duneY(ridge, w, x)) + 1, 2, 2)
      }
    }
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

function drawCrestFlow(g: CanvasRenderingContext2D, flow: CrestFlow[], ridges: DuneRidge[], w: number, dt: number, color: string): void {
  g.fillStyle = color
  for (const part of flow) {
    part.x += part.speed * dt
    if (part.x > w + 2) part.x = -2
    const ridge = ridges[part.ridge]!
    g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(part.x * 0.3))
    g.fillRect(Math.floor(part.x), Math.floor(duneY(ridge, w, part.x)), 2, 1)
  }
  g.globalAlpha = 1
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
}

const duneNight: BackdropScene = {
  id: 'dune-night',
  init(w, h, rng) {
    return {
      stars: makeStars(90, w, h, Math.floor(h * 0.45), rng),
      city: makeCity(rng, w, Math.floor(h * 0.76), Math.floor(h * 0.16), 0.16),
      mesas: [
        { x: Math.floor(w * 0.06), w: Math.floor(w * 0.2), h: Math.floor(h * 0.07) },
        { x: Math.floor(w * 0.62), w: Math.floor(w * 0.26), h: Math.floor(h * 0.05) },
      ],
      sand: makeDrift(46, w, h, h * 0.55, h, rng),
      blowX: w * (0.25 + rng() * 0.5),
      ridges: duneRidgesNight(w, h),
      flow: makeCrestFlow(26, w, rng),
      crawlers: makeCrawlers(3, w, rng),
      smoke: makeSmoke(),
      thopter: makeThopter(),
    } satisfies DuneNightState as DuneNightState
  },
  paintStatic(g, w, h, rng) {
    void rng
    sky(g, w, h, [[0, '#060503'], [0.55, '#1a0f06'], [0.78, '#4a2408'], [1, '#120903']])
    moon(g, Math.floor(w * 0.78), Math.floor(h * 0.16), Math.max(4, Math.floor(w / 42)), '#f4e3c2', 'rgba(244,227,194,0.22)')
    moon(g, Math.floor(w * 0.2), Math.floor(h * 0.3), Math.max(2, Math.floor(w / 90)), '#d9c9a8', 'rgba(217,201,168,0.14)')
    drawMesas(g, w, Math.floor(h * 0.78), '#0d0805', [
      { x: Math.floor(w * 0.06), w: Math.floor(w * 0.2), h: Math.floor(h * 0.07) },
      { x: Math.floor(w * 0.62), w: Math.floor(w * 0.26), h: Math.floor(h * 0.05) },
    ])
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as DuneNightState
    void cam
    drawStars(g, s.stars, t, '#ffe9c4')
    // Rare spice blow: a slow ember glow behind the far dune.
    const cycle = (t % 47) / 47
    if (cycle > 0.7) {
      const glow = Math.sin(((cycle - 0.7) / 0.3) * Math.PI)
      const gradient = g.createRadialGradient(s.blowX, h * 0.76, 1, s.blowX, h * 0.76, Math.floor(w * 0.09))
      gradient.addColorStop(0, `rgba(255,140,60,${(0.28 * glow).toFixed(3)})`)
      gradient.addColorStop(1, 'rgba(255,140,60,0)')
      g.fillStyle = gradient
      g.fillRect(0, Math.floor(h * 0.5), w, Math.ceil(h * 0.4))
    }
    drawCity(g, s.city, '#0f0b07', '#ffb45e', '#5a3a1c')
    drawBeacons(g, s.city.beacons, t)
    drawFlicker(g, s.city, '#0f0b07', '#ffb45e', '#cfe0ee', t)
    // Layered dune field in front of the city.
    drawDuneField(g, w, h, s.ridges)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,200,130)')
    drawSmoke(g, s.smoke, s.city.stacks, 1 / 60, 'rgb(150,130,110)')
    drawCrawlersOnDune(g, s.crawlers, s.ridges[1]!, w, 1 / 60)
    drawThopter(g, s.thopter, w, h, t, 1 / 60, '#0a0805')
    drawDrift(g, s.sand, w, 1 / 60, 'rgb(232,180,120)')
  },
}

interface Ripple {
  x: number
  y: number
}

interface DuneDayState {
  city: City
  dust: Drift[]
  ridges: DuneRidge[]
  flow: CrestFlow[]
  ripples: Ripple[]
  birds: Bird[]
  thopter: Thopter
}

const duneDay: BackdropScene = {
  id: 'dune-day',
  init(w, h, rng) {
    const ridges = duneRidgesDay(w, h)
    const ripples: Ripple[] = []
    for (let i = 0; i < 44; i += 1) {
      const x = rng() * w
      const ridge = ridges[Math.floor(rng() * ridges.length)]!
      ripples.push({ x, y: duneY(ridge, w, x) + 2 + rng() * 6 })
    }
    return {
      city: makeCity(rng, w, Math.floor(h * 0.74), Math.floor(h * 0.14), 0.05),
      dust: makeDrift(34, w, h, h * 0.4, h, rng),
      ridges,
      flow: makeCrestFlow(22, w, rng),
      ripples,
      birds: makeBirds(4, w, h, rng),
      thopter: makeThopter(),
    } satisfies DuneDayState as DuneDayState
  },
  paintStatic(g, w, h, rng) {
    void rng
    sky(g, w, h, [[0, '#f7e3b0'], [0.6, '#eec687'], [0.8, '#df9f52'], [1, '#c98a3e']])
    // Sun glare.
    const sunX = Math.floor(w * 0.7)
    const sunY = Math.floor(h * 0.2)
    const glare = g.createRadialGradient(sunX, sunY, 1, sunX, sunY, Math.floor(w * 0.12))
    glare.addColorStop(0, 'rgba(255,250,235,0.9)')
    glare.addColorStop(1, 'rgba(255,250,235,0)')
    g.fillStyle = glare
    g.fillRect(0, 0, w, Math.ceil(h * 0.5))
    g.fillStyle = '#fff8e6'
    g.fillRect(sunX - 2, sunY - 2, 4, 4)
    drawMesas(g, w, Math.floor(h * 0.76), '#b98d54', [
      { x: Math.floor(w * 0.1), w: Math.floor(w * 0.22), h: Math.floor(h * 0.08) },
      { x: Math.floor(w * 0.6), w: Math.floor(w * 0.28), h: Math.floor(h * 0.06) },
    ])
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as DuneDayState
    void t
    void cam
    drawCity(g, s.city, '#5a3a1c', '#2c1c0c', '#3a2410')
    drawGlints(g, s.city.windows, t)
    drawBirds(g, s.birds, w, h, t, 1 / 60, '#3a2a16')
    drawThopter(g, s.thopter, w, h, t, 1 / 60, '#2c1c0c')
    // Sunlit dune field in front of the city.
    drawDuneField(g, w, h, s.ridges)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,244,214)')
    // Wind ripple texture on the slip faces.
    g.fillStyle = '#fff8e2'
    g.globalAlpha = 0.5
    for (const ripple of s.ripples) {
      g.fillRect(Math.floor(ripple.x), Math.floor(ripple.y), 2, 1)
    }
    g.globalAlpha = 1
    drawDrift(g, s.dust, w, 1 / 60, 'rgb(120,70,20)')
  },
}

interface TideState {
  stars: Star[]
  buoyPhase: number
  ship: Ship
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
  g.fillStyle = '#ffe9c4'
  g.fillRect(x - 1, seaY - 17, 2, 2)
  return { x, y: seaY - 16 }
}

const tide: BackdropScene = {
  id: 'tide',
  init(w, h, rng) {
    void w
    void h
    return { stars: makeStars(80, w, h, Math.floor(h * 0.4), rng), buoyPhase: rng() * Math.PI * 2, ship: makeShip() } satisfies TideState as TideState
  },
  paintStatic(g, w, h, rng) {
    void rng
    sky(g, w, h, [[0, '#04070d'], [0.5, '#0a1626'], [1, '#0e2233']])
    moon(g, Math.floor(w * 0.68), Math.floor(h * 0.18), Math.max(4, Math.floor(w / 44)), '#e8f0f6', 'rgba(232,240,246,0.2)')
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as TideState
    void cam
    drawStars(g, s.stars, t, '#cfe0ee')
    const seaY = Math.floor(h * 0.52)
    g.fillStyle = '#071523'
    g.fillRect(0, seaY, w, h - seaY)
    const lamp = drawLighthouse(g, w, seaY)
    // Moon glitter: a shimmering reflection column.
    const cx = Math.floor(w * 0.68)
    for (let row = 0; row < h - seaY; row += 2) {
      const spread = 1 + Math.floor(((row / 2) % 4) * (0.6 + 0.4 * Math.sin(t * 1.7 + row)))
      const flicker = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.3 + row * 1.7))
      g.fillStyle = '#e8c87a'
      g.globalAlpha = Math.min(0.7, flicker * (1 - row / (h - seaY)))
      g.fillRect(cx - Math.floor(spread / 2), seaY + row, spread, 1)
    }
    g.globalAlpha = 1
    // Slow wave lines drifting sideways.
    g.fillStyle = '#9fc4de'
    for (let band = 0; band < 4; band += 1) {
      const y = seaY + 4 + band * Math.max(3, Math.floor((h - seaY) / 5))
      const offset = Math.floor(((t * (2 + band)) % w + w) % w)
      g.globalAlpha = 0.1 + band * 0.02
      for (let x = -8; x < w + 8; x += 12) {
        g.fillRect(((x + offset) % (w + 8) + (w + 8)) % (w + 8) - 8, y, 5, 1)
      }
    }
    g.globalAlpha = 1
    // Distant buoy blinking red.
    const on = 0.5 + 0.5 * Math.sin((t / 3.2) * Math.PI * 2 + s.buoyPhase)
    if (on > 0.6) {
      g.fillStyle = '#ff5a4a'
      g.fillRect(Math.floor(w * 0.22), seaY - 3, 1, 1)
    }
    // Rotating lighthouse beam sweeping the water.
    const angle = t * 0.22
    drawBeam(g, lamp.x, lamp.y, angle, Math.floor(w * 0.35), '#ffe9c4')
    drawBeam(g, lamp.x, lamp.y, angle + Math.PI, Math.floor(w * 0.3), '#ffe9c4')
    drawShip(g, s.ship, w, seaY, t, 1 / 60)
  },
}

interface EmberState {
  embers: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number }>
  derricks: Array<{ x: number; h: number }>
  blinkers: Beacon[]
  smoke: Smoke
  flare: { x: number; topY: number }
}

function drawDerrick(g: CanvasRenderingContext2D, x: number, baseY: number, h: number, body: string): void {
  g.strokeStyle = body
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(x - 3, baseY)
  g.lineTo(x, baseY - h)
  g.moveTo(x + 3, baseY)
  g.lineTo(x, baseY - h)
  g.moveTo(x, baseY)
  g.lineTo(x, baseY - h)
  g.stroke()
  g.fillStyle = body
  g.fillRect(x - 2, baseY - Math.floor(h * 0.5), 4, 1)
  g.fillRect(x - 1, baseY - h, 2, 1)
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
    const derricks = [
      { x: Math.floor(w * 0.15), h: Math.floor(h * 0.11) },
      { x: Math.floor(w * 0.72), h: Math.floor(h * 0.13) },
    ]
    const blinkers: Beacon[] = derricks.map((derrick, i) => ({
      x: derrick.x,
      y: Math.floor(h * 0.85) - derrick.h - 1,
      period: 1.4 + i * 0.5,
      phase: i * 2.1,
      color: '#ff3b30',
    }))
    return {
      embers,
      derricks,
      blinkers,
      smoke: makeSmoke(),
      flare: { x: Math.floor(w * 0.45), topY: Math.floor(h * 0.78) },
    } satisfies EmberState as EmberState
  },
  paintStatic(g, w, h, rng) {
    void rng
    sky(g, w, h, [[0, '#080403'], [0.6, '#160a06'], [0.85, '#2a0f08'], [1, '#0a0605']])
    g.fillStyle = '#060403'
    g.beginPath()
    g.moveTo(0, h)
    g.lineTo(0, Math.floor(h * 0.82))
    for (let x = 0; x <= w; x += 8) {
      g.lineTo(x, Math.floor(h * 0.82) - ((x * 7919) % 7))
    }
    g.lineTo(w, h)
    g.closePath()
    g.fill()
    drawDerrick(g, Math.floor(w * 0.15), Math.floor(h * 0.85), Math.floor(h * 0.11), '#0d0805')
    drawDerrick(g, Math.floor(w * 0.72), Math.floor(h * 0.85), Math.floor(h * 0.13), '#0d0805')
    // Flare stack.
    g.fillStyle = '#0d0805'
    g.fillRect(Math.floor(w * 0.45) - 1, Math.floor(h * 0.78), 2, Math.floor(h * 0.1))
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as EmberState
    void cam
    void t
    const dt = 1 / 60
    for (const ember of s.embers) {
      ember.y -= ember.vy * dt
      if (ember.y < -2) {
        ember.y = h + 2
        ember.x = Math.random() * w
      }
      const flicker = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 + ember.phase))
      const swayX = Math.sin(t * 1.3 + ember.phase) * ember.sway * 0.15
      g.fillStyle = ember.size === 2 ? '#ffb45e' : '#ff7a2e'
      g.globalAlpha = Math.min(1, flicker)
      g.fillRect(Math.floor(ember.x + swayX), Math.floor(ember.y), ember.size, ember.size)
    }
    g.globalAlpha = 1
    drawBeacons(g, s.blinkers, t)
    // Flare stack flame with heat glow.
    const burn = 0.6 + 0.4 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1)
    const flameH = 2 + Math.floor(burn * 2)
    const glow = g.createRadialGradient(s.flare.x, s.flare.topY - 2, 1, s.flare.x, s.flare.topY - 2, 9)
    glow.addColorStop(0, `rgba(255,150,60,${(0.22 * burn).toFixed(3)})`)
    glow.addColorStop(1, 'rgba(255,150,60,0)')
    g.fillStyle = glow
    g.fillRect(s.flare.x - 9, s.flare.topY - 11, 18, 13)
    g.fillStyle = '#ff7a2e'
    g.fillRect(s.flare.x - 1, s.flare.topY - flameH, 2, flameH)
    g.fillStyle = '#ffd9a0'
    g.fillRect(s.flare.x, s.flare.topY - Math.max(1, flameH - 1), 1, Math.max(1, flameH - 1))
    drawSmoke(g, s.smoke, [{ x: s.flare.x, topY: s.flare.topY - flameH }], 1 / 60, 'rgb(90,80,75)')
  },
}

interface VoidState {
  stars: Star[]
  meteors: Array<{ x: number; y: number; vx: number; vy: number; life: number; age: number }>
  nextMeteor: number
}

const gargantua: BackdropScene = {
  id: 'void',
  init(w, h, rng) {
    return {
      stars: makeStars(150, w, h, h, rng),
      meteors: [],
      nextMeteor: 6 + rng() * 8,
    } satisfies VoidState as VoidState
  },
  paintStatic(g, w, h, rng) {
    void rng
    sky(g, w, h, [[0, '#020306'], [0.55, '#05070e'], [1, '#0a0f1e']])
    const cx = Math.floor(w * 0.62)
    const cy = Math.floor(h * 0.42)
    const r = Math.max(6, Math.floor(Math.min(w, h) * 0.11))
    // Lensed halo arcs above and below the shadow.
    g.fillStyle = 'rgba(255,220,170,0.16)'
    g.beginPath()
    g.ellipse(cx, cy, Math.floor(r * 1.5), Math.floor(r * 2.1), 0, Math.PI * 1.15, Math.PI * 1.85)
    g.lineWidth = Math.max(1, Math.floor(r / 7))
    g.strokeStyle = 'rgba(255,220,170,0.16)'
    g.stroke()
    g.beginPath()
    g.ellipse(cx, cy, Math.floor(r * 1.5), Math.floor(r * 2.1), 0, Math.PI * 0.15, Math.PI * 0.85)
    g.stroke()
    // Accretion disk: thin bright band, brighter on the approaching side.
    const rx = Math.floor(r * 2.6)
    const ry = Math.max(2, Math.floor(r * 0.45))
    g.fillStyle = '#3a2415'
    g.beginPath()
    g.ellipse(cx, cy, rx, ry + 2, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#e8a34e'
    g.lineWidth = 2
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = '#ffe9c4'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.5, Math.PI * 1.5)
    g.stroke()
    // The shadow itself.
    g.fillStyle = '#000000'
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
    // Photon ring.
    g.strokeStyle = '#fff3dd'
    g.lineWidth = 1
    g.beginPath()
    g.arc(cx, cy, r + 1, 0, Math.PI * 2)
    g.stroke()
    // Ringed planet hanging in the corner.
    const px = Math.floor(w * 0.16)
    const py = Math.floor(h * 0.68)
    const pr = Math.max(3, Math.floor(w / 60))
    g.fillStyle = '#7f96b5'
    g.beginPath()
    g.arc(px, py, pr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#4a5d78'
    g.fillRect(px - pr, py - 1, pr, 2)
    g.strokeStyle = '#c8d4e2'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(px, py, pr + 3, Math.max(1, Math.floor(pr / 3)), -0.3, 0, Math.PI * 2)
    g.stroke()
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as VoidState
    void cam
    drawStars(g, s.stars, t, '#cfe0f4')
    // Occasional meteor streaking past.
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
      s.nextMeteor = t + 9 + Math.random() * 14
    }
    const dt = 1 / 60
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
      g.globalAlpha = 0.8 * fade
      g.fillRect(Math.floor(meteor.x), Math.floor(meteor.y), 1, 1)
      g.fillStyle = '#8fb8d6'
      g.globalAlpha = 0.4 * fade
      g.fillRect(Math.floor(meteor.x - Math.sign(meteor.vx) * 2), Math.floor(meteor.y - 1), 2, 1)
    }
    g.globalAlpha = 1
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
