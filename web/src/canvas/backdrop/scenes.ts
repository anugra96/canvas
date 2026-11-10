export type BackdropSceneId = 'dune-night' | 'dune-day' | 'tide' | 'ember'

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

interface City {
  silhouette: Array<{ x: number; w: number; h: number; spire: boolean }>
  windows: LitWindow[]
  beacons: Beacon[]
  baseY: number
}

function makeCity(rng: () => number, w: number, baseY: number, maxH: number, litRatio: number): City {
  const silhouette: City['silhouette'] = []
  const windows: LitWindow[] = []
  const beacons: Beacon[] = []
  let x = Math.floor(w * 0.04)
  while (x < w * 0.96) {
    const bw = 4 + Math.floor(rng() * 8)
    const bh = 4 + Math.floor(rng() * maxH)
    const spire = rng() < 0.22
    silhouette.push({ x, w: bw, h: bh, spire })
    const cols = Math.floor(bw / 2)
    const rows = Math.floor(bh / 3)
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (rng() < litRatio) {
          windows.push({ x: x + 1 + cx * 2, y: baseY - bh + 1 + cy * 3, warm: rng() < 0.8 })
        }
      }
    }
    if (spire && rng() < 0.6) {
      beacons.push({
        x: x + Math.floor(bw / 2),
        y: baseY - bh - 4,
        period: 2 + rng() * 4,
        phase: rng() * Math.PI * 2,
        color: rng() < 0.6 ? '#ff5a4a' : '#ffe9c4',
      })
    }
    x += bw + 1 + Math.floor(rng() * 4)
  }
  return { silhouette, windows, beacons, baseY }
}

function drawCity(g: CanvasRenderingContext2D, city: City, body: string, lit: string, dim: string): void {
  g.fillStyle = body
  for (const block of city.silhouette) {
    g.fillRect(block.x, city.baseY - block.h, block.w, block.h)
    if (block.spire) {
      g.fillRect(block.x + Math.floor(block.w / 2), city.baseY - block.h - 3, 1, 3)
    }
  }
  for (const window of city.windows) {
    g.fillStyle = window.warm ? lit : dim
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
    // Layered dune field in front of the city.
    drawDuneField(g, w, h, s.ridges)
    drawCrestFlow(g, s.flow, s.ridges, w, 1 / 60, 'rgb(255,200,130)')
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
}

const tide: BackdropScene = {
  id: 'tide',
  init(w, h, rng) {
    void w
    void h
    return { stars: makeStars(80, w, h, Math.floor(h * 0.4), rng), buoyPhase: rng() * Math.PI * 2 } satisfies TideState as TideState
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
  },
}

interface EmberState {
  embers: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number }>
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
    return { embers } satisfies EmberState as EmberState
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
  },
}

export const SCENES: Record<BackdropSceneId, BackdropScene> = {
  'dune-night': duneNight,
  'dune-day': duneDay,
  tide,
  ember,
}
