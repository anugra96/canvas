import {
  bands as pixelBands,
  dither,
  drawGlow as pixelGlow,
  drawStars,
  fbm,
  hash,
  makeStars,
  mix,
  noise,
  rgb,
  smoothstep,
  type Rgb,
  type Star,
} from '../../atmosphere/pixel'
import type { BackdropScene } from './scenes'

// Reynisfjara at night under the aurora, seen from the black sand looking out
// to sea. Reynisfjall rises on the left with the Garðar basalt columns and the
// Hálsanefshellir cave at its foot; the Reynisdrangar stacks stand just off its
// tip; Dyrhólaey and its lighthouse sit on the far horizon. A listening station
// on the plateau, a survey drone, walkers, seabirds, boats, and the occasional
// sneaker wave keep the world alive. Same pixel language as the Dune scenes:
// quantized bands, Bayer dithering, glow sprites, and rim light.

const AURORA_GREEN: Rgb = [110, 255, 175]
const AURORA_MINT: Rgb = [200, 255, 225]
const AURORA_VIOLET: Rgb = [170, 92, 232]
const AURORA_ROSE: Rgb = [236, 92, 150]
const BASALT: Rgb = [8, 10, 12]
const FAR_RIDGE: Rgb = [13, 20, 25]
const MOSS: Rgb = [16, 32, 25]
const FOAM = 'rgb(208,238,232)'
const OVERLAY_ALPHA = 0.5
const WARM = '#ffc27a'
const COOL = '#bfe4ff'

const GLOW_OPTIONS = { size: 16, skipInvisible: true, clampAlpha: true } as const

function drawGlow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: Rgb,
  alpha: number,
): void {
  pixelGlow(g, x, y, radius, color, alpha, GLOW_OPTIONS)
}

function bands(
  g: CanvasRenderingContext2D,
  w: number,
  y0: number,
  h: number,
  stops: Array<[number, Rgb]>,
): void {
  pixelBands(g, w, y0, h, stops, { minBands: 6, seam: 'edge', threshold: 4, amount: 0.5 })
}

function layout(w: number, h: number) {
  return {
    seaY: Math.floor(h * 0.62),
    shoreY: Math.floor(h * 0.81),
    beachBack: Math.floor(h * 0.86),
    stackBase: Math.floor(h * 0.7),
    tipX: Math.floor(w * 0.43),
    footX: Math.floor(w * 0.37),
    columnsX0: Math.floor(w * 0.165),
    columnsX1: Math.floor(w * 0.37),
    caveX: Math.floor(w * 0.085),
    caveW: Math.max(10, Math.floor(w * 0.07)),
  }
}

// Reynisfjall's skyline: a high plateau that falls in crags toward the sea.
function ridgeTop(w: number, h: number, x: number): number {
  const u = x / w
  const points: Array<[number, number]> = [
    [0, 0.2], [0.05, 0.17], [0.12, 0.165], [0.2, 0.18], [0.26, 0.22], [0.3, 0.27],
    [0.33, 0.36], [0.355, 0.47], [0.38, 0.56], [0.41, 0.62], [0.43, 0.67],
  ]
  let base = points[points.length - 1]![1]
  for (let i = 0; i < points.length - 1; i += 1) {
    const [u0, y0] = points[i]!
    const [u1, y1] = points[i + 1]!
    if (u >= u0 && u <= u1) {
      base = y0 + (y1 - y0) * ((u - u0) / (u1 - u0))
      break
    }
  }
  const crag = (fbm(x * 0.09) - 0.5) * 0.035 + (fbm(x * 0.4 + 40) - 0.5) * 0.012
  return Math.floor(h * (base + crag * (0.4 + u * 1.6)))
}

/** One horizontal run of a rock silhouette. */
interface Span {
  y: number
  x0: number
  x1: number
}

// A slender spire with several jagged pinnacles, like the Reynisdrangar.
function stackSpans(cx: number, baseY: number, height: number, width: number, peaks: number[], seed: number): Span[] {
  const spans: Span[] = []
  const top = baseY - height
  for (let y = top; y <= baseY; y += 1) {
    const t = (y - top) / height
    let x0 = Number.POSITIVE_INFINITY
    let x1 = Number.NEGATIVE_INFINITY
    peaks.forEach((peak, index) => {
      if (t < peak) return
      const local = (t - peak) / (1 - peak)
      const half = (width / 2) * (0.08 + 0.92 * local ** 0.9) * (index === 0 ? 1 : 0.7)
      const side = index % 2 === 0 ? 1 : -1
      const offset = side * peak * width * 1.25 + (1 - t) * width * 0.08
      const jagL = (fbm(y * 0.35 + seed + index * 9) - 0.5) * 3.2
      const jagR = (fbm(y * 0.31 + seed + index * 9 + 50) - 0.5) * 3.2
      x0 = Math.min(x0, cx + offset - half + jagL)
      x1 = Math.max(x1, cx + offset + half + jagR)
    })
    if (x1 - x0 >= 0.5) spans.push({ y, x0: Math.round(x0), x1: Math.round(x1) })
  }
  return spans
}

function paintStack(g: CanvasRenderingContext2D, spans: Span[], seed: number, rim: Array<[number, number]>): void {
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]!
    for (let x = span.x0; x <= span.x1; x += 1) {
      // Columnar grain: tone from a slow noise per column, dithered.
      const tone = fbm(x * 0.6 + seed)
      let c = BASALT
      if (x === span.x0) c = [22, 28, 32]
      else if (x === span.x1) c = [4, 5, 6]
      else if (dither(x, span.y, tone * 0.55)) c = [14, 17, 20]
      g.fillStyle = rgb(c)
      g.fillRect(x, span.y, 1, 1)
    }
    // Horizontal fractures.
    if (hash(span.y * 3.1 + seed) > 0.86) {
      g.fillStyle = 'rgb(3,4,5)'
      g.fillRect(span.x0 + 1, span.y, Math.max(1, Math.floor((span.x1 - span.x0) * 0.6)), 1)
    }
    const above = spans[i - 1]
    for (let x = span.x0; x <= span.x1; x += 1) {
      if (!above || x < above.x0 || x > above.x1) rim.push([x, span.y])
    }
  }
}

function paintHeadland(g: CanvasRenderingContext2D, w: number, h: number, rim: Array<[number, number]>): void {
  const L = layout(w, h)
  const bottom = (x: number) => (x < L.footX ? L.beachBack : L.shoreY + 1)
  // A paler far ridge behind the main mass gives the mountain depth.
  g.fillStyle = rgb(FAR_RIDGE)
  for (let x = 0; x < L.tipX - Math.floor(w * 0.04); x += 1) {
    const top = ridgeTop(w, h, x + Math.floor(w * 0.04)) - Math.floor(h * 0.035)
    g.fillRect(x, top, 1, bottom(x) - top)
  }
  // Column groups of uneven width give the cliff its basalt grain.
  const groupOf = new Int16Array(L.tipX + 2)
  let group = 0
  let next = 0
  for (let x = 0; x <= L.tipX + 1; x += 1) {
    if (x >= next) {
      group += 1
      next = x + 2 + Math.floor(hash(group * 3.7) * 4)
    }
    groupOf[x] = group
  }
  for (let x = 0; x <= L.tipX; x += 1) {
    const top = ridgeTop(w, h, x)
    const prevTop = x > 0 ? ridgeTop(w, h, x - 1) : top
    const u = x / w
    const cliff = smoothstep(0.24, 0.32, u)
    const id = groupOf[x]!
    const edge = groupOf[x + 1] !== id
    const groupTone = hash(id * 1.31)
    for (let y = top; y < bottom(x); y += 1) {
      const depth = y - top
      // Broad light and shadow masses: gullies and buttresses.
      const mass = fbm(x * 0.035 + y * 0.06 + 3) - 0.5
      let c: Rgb = mass > 0.08 ? [12, 14, 17] : mass < -0.12 ? [5, 6, 8] : BASALT
      if (depth < 5 + (1 - cliff) * 4 && dither(x, y, (1 - depth / 9) * (1 - cliff * 0.7))) {
        // Moss and grass on the plateau and upper slope.
        c = depth < 2 ? [24, 44, 33] : MOSS
      } else if (cliff > 0.2 || depth > 18) {
        if (edge) c = [3, 4, 5]
        else if (groupTone > 0.45 && dither(x, y, 0.3 + groupTone * 0.3)) c = [14, 17, 20]
        // Joints across the lower columns only.
        if (depth > 30 && !edge && hash(id * 7.1 + Math.floor((y + id * 3) / 9) * 0.37) > 0.95) c = [3, 4, 5]
      }
      // Scree at the foot catches a little light.
      if (y > bottom(x) - 4 && dither(x, y, 0.3)) c = [20, 23, 26]
      g.fillStyle = rgb(c)
      g.fillRect(x, y, 1, 1)
    }
    rim.push([x, top])
    if (top > prevTop + 1) for (let y = prevTop; y < top; y += 1) rim.push([x, y])
  }
  // Ledges where the seabirds nest.
  for (let i = 0; i < 18; i += 1) {
    const x = Math.floor(w * (0.17 + hash(i * 4.3) * 0.24))
    const top = ridgeTop(w, h, x)
    const y = Math.floor(top + 4 + hash(i * 7.9) * (L.beachBack - top - 20))
    const len = 3 + Math.floor(hash(i * 2.2) * 6)
    g.fillStyle = 'rgb(26,31,34)'
    g.fillRect(x, y, len, 1)
    g.fillStyle = 'rgb(3,4,5)'
    g.fillRect(x, y + 1, len, 1)
    for (let dx = 0; dx < len; dx += 1) rim.push([x + dx, y])
  }
}

// Hálsanefshellir: a tall cave arch framed by basalt columns.
function paintCave(g: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number } {
  const L = layout(w, h)
  const caveH = Math.floor(h * 0.17)
  const top = L.beachBack - caveH
  for (let y = top; y <= L.beachBack; y += 1) {
    const t = Math.min(1, (y - top) / (caveH * 0.5))
    const half = Math.floor((L.caveW / 2) * Math.sqrt(t))
    const cx = L.caveX + Math.floor(L.caveW / 2)
    g.fillStyle = 'rgb(1,1,2)'
    g.fillRect(cx - half, y, half * 2, 1)
    // Faint inner wall.
    if (half > 2 && dither(cx - half + 1, y, 0.4)) {
      g.fillStyle = 'rgb(10,12,14)'
      g.fillRect(cx - half + 1, y, 1, 1)
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const x = side < 0 ? L.caveX - 3 - i * 3 : L.caveX + L.caveW + i * 3
      const colTop = top - 4 + i * 3
      paintColumn(g, x, colTop, L.beachBack - colTop)
    }
  }
  return { x: L.caveX + Math.floor(L.caveW / 2), y: L.beachBack - 2 }
}

function paintColumn(g: CanvasRenderingContext2D, x: number, top: number, height: number): void {
  // Hexagonal prism in three facets: lit, mid, shaded, then a dark joint gap.
  g.fillStyle = 'rgb(27,32,35)'
  g.fillRect(x, top, 1, height)
  g.fillStyle = 'rgb(15,18,21)'
  g.fillRect(x + 1, top, 1, height)
  g.fillStyle = 'rgb(7,9,11)'
  g.fillRect(x + 2, top, 1, height)
  g.fillStyle = 'rgb(46,54,57)'
  g.fillRect(x, top, 3, 1)
  // Stacked sections.
  g.fillStyle = 'rgb(4,5,6)'
  for (let y = top + 3 + Math.floor(hash(x * 1.3) * 4); y < top + height - 1; y += 5 + Math.floor(hash(x + y) * 5)) {
    g.fillRect(x + 1, y, 2, 1)
  }
}

// Garðar: basalt columns stepping up the cliff foot like organ pipes.
function paintColumns(g: CanvasRenderingContext2D, w: number, h: number, rim: Array<[number, number]>): void {
  const L = layout(w, h)
  const peakX = Math.floor(w * 0.215)
  const maxH = Math.floor(h * 0.21)
  // Columns come in clusters that share a step height, like a stair.
  let x = L.columnsX0
  let cluster = 0
  while (x < L.columnsX1) {
    const size = 2 + Math.floor(hash(cluster * 5.3) * 3)
    const mid = x + size * 1.5
    const fall = mid < peakX
      ? (peakX - mid) / (peakX - L.columnsX0) * 0.55
      : (mid - peakX) / (L.columnsX1 - peakX)
    const raw = maxH * Math.max(0, 1 - fall) ** 1.1
    const stepH = Math.max(4, Math.floor(raw / 5) * 5 + (hash(cluster * 2.9) > 0.65 ? 5 : 0))
    for (let i = 0; i < size && x < L.columnsX1; i += 1) {
      const height = stepH - (i === size - 1 && hash(cluster + i) > 0.5 ? 2 : 0)
      const top = L.beachBack - height
      paintColumn(g, x, top, height)
      rim.push([x, top], [x + 1, top], [x + 2, top])
      x += 3
    }
    g.fillStyle = 'rgb(2,3,4)'
    g.fillRect(x, L.beachBack - stepH, 1, stepH)
    x += 1
    cluster += 1
  }
  // Fallen column sections on the sand.
  for (let i = 0; i < 9; i += 1) {
    const x = Math.floor(L.columnsX0 + hash(i * 3.3) * (L.columnsX1 - L.columnsX0 + w * 0.06))
    const y = L.beachBack + 1 + Math.floor(hash(i * 5.1) * 4)
    g.fillStyle = 'rgb(30,35,38)'
    g.fillRect(x, y, 3, 1)
    g.fillStyle = 'rgb(12,14,16)'
    g.fillRect(x, y + 1, 3, 2)
  }
}

// Dyrhólaey: a long low headland with its sea arch and lighthouse.
function paintDyrholaey(g: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number } {
  const { seaY } = layout(w, h)
  const x0 = Math.floor(w * 0.79)
  const x1 = w
  const height = Math.max(6, Math.floor(h * 0.06))
  const archX = Math.floor(w * 0.875)
  const archW = Math.max(4, Math.floor(w * 0.025))
  for (let x = x0; x < x1; x += 1) {
    const t = (x - x0) / (x1 - x0)
    const lift = Math.min(1, t * 5) * (0.85 + 0.15 * fbm(x * 0.2 + 3))
    const top = seaY - Math.floor(height * lift * (1 - 0.35 * smoothstep(0.55, 1, t)))
    g.fillStyle = 'rgb(12,20,25)'
    g.fillRect(x, top, 1, seaY - top)
    g.fillStyle = 'rgb(22,36,40)'
    g.fillRect(x, top, 1, 1)
  }
  // Sea showing through the arch.
  const archTop = seaY - Math.floor(height * 0.55)
  for (let y = archTop; y < seaY; y += 1) {
    const t = (y - archTop) / (seaY - archTop)
    const half = Math.floor((archW / 2) * Math.sqrt(Math.min(1, t * 2)))
    g.fillStyle = 'rgb(14,36,40)'
    g.fillRect(archX + Math.floor(archW / 2) - half, y, half * 2, 1)
  }
  // Lighthouse.
  const lx = Math.floor(w * 0.835)
  const ly = seaY - height - 1
  g.fillStyle = 'rgb(70,80,84)'
  g.fillRect(lx - 1, ly - 2, 3, 3)
  g.fillStyle = 'rgb(40,46,50)'
  g.fillRect(lx - 2, ly + 1, 5, 1)
  return { x: lx, y: ly - 3 }
}

interface Station {
  windows: Array<{ x: number; y: number; warm: boolean }>
  beacons: Array<{ x: number; y: number; period: number; phase: number }>
  dish: { x: number; y: number }
  vent: { x: number; y: number }
}

// A listening station on the plateau, where the old radio mast once stood.
function paintStation(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number): Station {
  const body = 'rgb(5,7,9)'
  const edge = 'rgb(30,40,44)'
  const station: Station = { windows: [], beacons: [], dish: { x: 0, y: 0 }, vent: { x: 0, y: 0 } }
  const ground = (x: number) => ridgeTop(w, h, x)
  const block = (x: number, bw: number, bh: number, lit: number) => {
    const base = Math.max(ground(x), ground(x + bw - 1))
    g.fillStyle = body
    g.fillRect(x, base - bh, bw, bh + 2)
    g.fillStyle = edge
    g.fillRect(x, base - bh, bw, 1)
    for (let wx = x + 1; wx < x + bw - 1; wx += 2) {
      for (let wy = base - bh + 2; wy < base; wy += 2) {
        if (rng() < lit) station.windows.push({ x: wx, y: wy, warm: rng() < 0.75 })
      }
    }
    return base - bh
  }
  const x0 = Math.floor(w * 0.035)
  block(x0, 9, 4, 0.55)
  const hallTop = block(x0 + 10, 14, 3, 0.45)
  block(x0 + 25, 6, 5, 0.5)
  // Radome.
  const domeX = x0 + 17
  g.fillStyle = body
  g.beginPath()
  g.arc(domeX, hallTop, 4, Math.PI, 0)
  g.fill()
  g.fillStyle = edge
  g.fillRect(domeX - 2, hallTop - 4, 3, 1)
  // Lattice mast with crossbars.
  const mastX = x0 + 33
  const mastBase = ground(mastX)
  const mastH = Math.max(14, Math.floor(h * 0.07))
  g.fillStyle = body
  g.fillRect(mastX, mastBase - mastH, 1, mastH)
  for (let y = mastBase - mastH + 3; y < mastBase; y += 3) g.fillRect(mastX - 1, y, 3, 1)
  station.beacons.push({ x: mastX, y: mastBase - mastH - 1, period: 2.4, phase: 0 })
  station.beacons.push({ x: mastX, y: mastBase - Math.floor(mastH * 0.5), period: 2.4, phase: Math.PI })
  station.beacons.push({ x: x0 - 1, y: ground(x0) - 5, period: 3.7, phase: 1.3 })
  station.dish = { x: x0 + 4, y: ground(x0 + 4) - 7 }
  station.vent = { x: x0 + 27, y: ground(x0 + 27) - 7 }
  g.fillStyle = body
  g.fillRect(station.dish.x, station.dish.y + 1, 1, 3)
  g.fillRect(station.vent.x, station.vent.y, 1, 2)
  return station
}

function paintMoon(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  drawGlow(g, cx, cy, r * 4, [210, 225, 235], 0.16)
  const shades: Rgb[] = [[22, 26, 34], [96, 104, 112], [176, 184, 188], [226, 232, 230]]
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const d = x * x + y * y
      if (d > r * r) continue
      const nz = Math.sqrt(Math.max(0, r * r - d)) / r
      const light = Math.max(0, (-x * 0.75 - y * 0.35) / r * 0.9 + nz * 0.45)
      const level = Math.min(2.999, light * 3)
      const lo = Math.floor(level)
      const c = dither(cx + x, cy + y, level - lo) ? shades[lo + 1]! : shades[lo]!
      g.fillStyle = rgb(c)
      g.fillRect(cx + x, cy + y, 1, 1)
    }
  }
  g.fillStyle = rgb([120, 128, 134])
  g.fillRect(cx - Math.floor(r * 0.4), cy - Math.floor(r * 0.2), Math.max(1, Math.floor(r * 0.3)), Math.max(1, Math.floor(r * 0.3)))
  g.fillRect(cx - Math.floor(r * 0.1), cy + Math.floor(r * 0.35), 1, 1)
}

function cloudSprite(width: number, height: number, seed: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = width
  sprite.height = height
  const g = sprite.getContext('2d')!
  for (let x = 0; x < width; x += 1) {
    const u = x / width
    const thick = Math.sin(u * Math.PI) * (0.55 + 0.45 * fbm(x * 0.15 + seed)) * height
    const top = Math.floor(height - thick)
    for (let y = top; y < height; y += 1) {
      const edge = (y - top) / Math.max(1, thick)
      if (!dither(x, y, Math.min(1, edge * 2.4 + 0.15))) continue
      // Underside lit by the aurora; tops stay in shadow.
      g.fillStyle = rgb(edge > 0.65 ? [26, 58, 54] : [14, 26, 32])
      g.fillRect(x, y, 1, 1)
    }
  }
  return sprite
}

// Pre-rendered vertical ray: a sharp hem fading upward in quantized steps.
function rayStrip(height: number, stops: Array<[number, Rgb, number]>): HTMLCanvasElement {
  const strip = document.createElement('canvas')
  strip.width = 1
  strip.height = height
  const g = strip.getContext('2d')!
  for (let y = 0; y < height; y += 1) {
    const t = 1 - y / (height - 1)
    let color: Rgb = stops[stops.length - 1]![1]
    let alpha = 0
    for (let i = 0; i < stops.length - 1; i += 1) {
      const [a0, c0, al0] = stops[i]!
      const [a1, c1, al1] = stops[i + 1]!
      if (t >= a0 && t <= a1) {
        const k = (t - a0) / (a1 - a0)
        color = mix(c0, c1, k)
        alpha = al0 + (al1 - al0) * k
        break
      }
    }
    g.fillStyle = rgb(color)
    g.globalAlpha = Math.round(alpha * 8) / 8
    g.fillRect(0, y, 1, 1)
  }
  return strip
}

interface Curtain {
  y0: number
  amp: number
  k: number
  drift: number
  height: number
  seed: number
  span: [number, number]
  strip: HTMLCanvasElement
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

interface Walker {
  x: number
  dir: 1 | -1
  speed: number
  y: number
  pause: number
}

interface Bird {
  angle: number
  speed: number
  rx: number
  ry: number
  cx: number
  cy: number
  phase: number
}

interface AuroraShoreState {
  frame: number
  stars: Star[]
  meteor: { active: boolean; x: number; y: number; vx: number; vy: number; age: number; next: number }
  curtains: Curtain[]
  aurora: HTMLCanvasElement
  intensity: Float32Array
  glow: number
  clouds: Array<{ sprite: HTMLCanvasElement; x: number; y: number; vx: number }>
  foreground: HTMLCanvasElement
  rim: Array<[number, number]>
  seaOpen: Int16Array
  station: Station
  steam: Particle[]
  lamp: { x: number; y: number }
  cave: { x: number; y: number }
  ships: Array<{ x: number; vx: number }>
  walkers: Walker[]
  birds: Bird[]
  drone: { active: boolean; x: number; y: number; vx: number; next: number }
  surge: { start: number; next: number }
  spray: Particle[]
  mist: Array<{ x: number; y: number; vx: number; alpha: number }>
}

function paintForeground(w: number, h: number, rng: () => number) {
  const L = layout(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const rim: Array<[number, number]> = []
  const seaOpen = new Int16Array(w).fill(L.seaY)

  // Sea with a faint horizon line, then the black sand.
  bands(g, w, L.seaY, L.shoreY - L.seaY, [[0, [16, 40, 44]], [0.25, [10, 25, 30]], [1, [5, 12, 15]]])
  g.fillStyle = 'rgb(30,66,64)'
  g.fillRect(0, L.seaY, w, 1)
  // Static swell texture: sparse broken crests, longer toward the beach.
  for (let y = L.seaY + 2; y < L.shoreY; y += 1) {
    const near = (y - L.seaY) / (L.shoreY - L.seaY)
    const rowShift = noise(y * 0.53) * 40
    for (let x = 0; x < w; x += 1) {
      const n = noise(x * (0.16 - near * 0.1) + rowShift + y * 1.7)
      if (n > 0.86 - near * 0.08) {
        g.fillStyle = rgb(mix([16, 38, 42], [28, 56, 58], near))
        g.fillRect(x, y, 1, 1)
      }
    }
  }
  bands(g, w, L.shoreY, h - L.shoreY, [[0, [18, 21, 23]], [0.12, [12, 13, 15]], [1, [3, 4, 5]]])
  for (let i = 0; i < Math.floor(w * (h - L.shoreY) * 0.06); i += 1) {
    const y = L.shoreY + 2 + Math.floor((h - L.shoreY - 2) * Math.sqrt(rng()))
    g.fillStyle = rng() > 0.85 ? 'rgb(46,52,56)' : 'rgb(24,27,30)'
    g.fillRect(Math.floor(rng() * w), y, 1, 1)
  }
  // Wet band at the waterline, then wind ripples that widen toward the camera.
  for (let y = L.shoreY + 1; y < L.shoreY + Math.floor((h - L.shoreY) * 0.3); y += 1) {
    for (let x = L.tipX; x < w; x += 1) {
      if (hash(x * 3.1 + y * 17.3) < 0.3 * (1 - (y - L.shoreY) / ((h - L.shoreY) * 0.3))) {
        g.fillStyle = 'rgb(22,30,32)'
        g.fillRect(x, y, 1, 1)
      }
    }
  }
  for (let y = L.shoreY + 6, gap = 3; y < h; y += gap, gap += 0.6) {
    const row = Math.floor(y)
    for (let x = 0; x < w; x += 1) {
      const n = noise(x * (0.12 - (row - L.shoreY) / h * 0.08) + row * 2.3)
      if (n < 0.66) continue
      g.fillStyle = n > 0.8 ? 'rgb(30,34,37)' : 'rgb(19,22,24)'
      g.fillRect(x, row + Math.round(Math.sin(x * 0.11 + row) * 0.6), 1, 1)
    }
  }
  // Driftwood and kelp washed up on the sand.
  const logX = Math.floor(w * 0.66)
  const logY = Math.floor(L.shoreY + (h - L.shoreY) * 0.82)
  g.fillStyle = 'rgb(46,40,34)'
  g.fillRect(logX, logY, Math.max(8, Math.floor(w * 0.03)), 1)
  g.fillStyle = 'rgb(20,17,14)'
  g.fillRect(logX + 1, logY + 1, Math.max(7, Math.floor(w * 0.03)), 1)
  g.fillRect(logX - 1, logY - 1, 1, 2)
  g.fillStyle = 'rgb(16,30,22)'
  for (let i = 0; i < 14; i += 1) {
    g.fillRect(Math.floor(w * (0.46 + rng() * 0.5)), Math.floor(L.shoreY + 3 + rng() * (h - L.shoreY) * 0.25), 2, 1)
  }
  // Rounded basalt boulders on the sand, lit on top.
  for (let i = 0; i < 7; i += 1) {
    const bx = Math.floor(w * (0.42 + rng() * 0.56))
    const by = Math.floor(L.shoreY + (h - L.shoreY) * (0.35 + rng() * 0.55))
    const bw = 2 + Math.floor(rng() * 4)
    g.fillStyle = 'rgb(7,8,10)'
    g.fillRect(bx, by - 1, bw, 2)
    g.fillRect(bx + 1, by - 2, Math.max(1, bw - 2), 1)
    g.fillStyle = 'rgb(34,40,44)'
    g.fillRect(bx + 1, by - 2, Math.max(1, bw - 2), 1)
  }

  const lamp = paintDyrholaey(g, w, h)

  const stacks: Array<[number, number, number, number[], number]> = [
    [Math.floor(w * 0.468), Math.floor(h * 0.35), Math.max(10, Math.floor(w * 0.05)), [0, 0.16, 0.38], 11],
    [Math.floor(w * 0.53), Math.floor(h * 0.25), Math.max(8, Math.floor(w * 0.045)), [0, 0.22], 23],
    [Math.floor(w * 0.578), Math.floor(h * 0.15), Math.max(6, Math.floor(w * 0.032)), [0, 0.3], 37],
    [Math.floor(w * 0.606), Math.floor(h * 0.05), Math.max(4, Math.floor(w * 0.018)), [0], 41],
  ]
  for (const [cx, height, width, peaks, seed] of stacks) {
    const spans = stackSpans(cx, L.stackBase, height, width, peaks, seed)
    // Broken dark reflection on the water below each stack.
    for (const span of spans) {
      const ry = L.stackBase + Math.floor((L.stackBase - span.y) * 0.45)
      if (ry >= L.shoreY - 1) continue
      for (let rx = span.x0; rx <= span.x1; rx += 1) {
        if (!dither(rx, ry, 0.55) || noise(rx * 0.5 + ry) < 0.3) continue
        g.fillStyle = 'rgb(4,9,12)'
        g.fillRect(rx + Math.round(Math.sin(ry * 1.3) * 1), ry, 1, 1)
      }
    }
    paintStack(g, spans, seed, rim)
    for (const span of spans) {
      for (let x = Math.max(0, span.x0); x <= Math.min(w - 1, span.x1); x += 1) seaOpen[x] = Math.max(seaOpen[x]!, L.stackBase + 1)
    }
  }

  paintHeadland(g, w, h, rim)
  const cave = paintCave(g, w, h)
  paintColumns(g, w, h, rim)
  const station = paintStation(g, w, h, rng)
  for (let x = 0; x <= Math.min(w - 1, L.tipX + 1); x += 1) seaOpen[x] = L.shoreY

  return { canvas, rim, seaOpen, lamp, cave, station }
}

function updateAurora(s: AuroraShoreState, w: number, h: number, t: number): void {
  const g = s.aurora.getContext('2d')!
  g.clearRect(0, 0, w, h)
  g.imageSmoothingEnabled = false
  s.intensity.fill(0)
  let total = 0
  for (const curtain of s.curtains) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w
      // Curtains cover part of the sky and slowly wander across it.
      const shift = Math.sin(t * 0.017 * curtain.drift + curtain.seed) * 0.12
      const envelope = smoothstep(curtain.span[0] + shift, curtain.span[0] + shift + 0.14, u)
        * (1 - smoothstep(curtain.span[1] + shift - 0.14, curtain.span[1] + shift, u))
      if (envelope <= 0) continue
      const fold = 0.25 + 0.75 * Math.sin(u * 9 + curtain.seed + t * 0.09 * curtain.drift) ** 4
      const rays = 0.15 + 0.85 * noise(x * 0.45 + t * 0.9 * curtain.drift + curtain.seed * 17) ** 2.2
      const gaps = 0.3 + 0.7 * smoothstep(0.25, 0.6, noise(u * 4 + t * 0.03 * curtain.drift + curtain.seed * 5))
      const surge = 0.65 + 0.35 * Math.sin(t * 0.21 + u * 3 + curtain.seed)
      const intensity = Math.min(1, envelope * fold * rays * gaps * surge * 1.6)
      if (intensity < 0.05) continue
      const base = curtain.y0
        + Math.sin(u * curtain.k + t * 0.06 * curtain.drift + curtain.seed) * curtain.amp
        + Math.sin(u * curtain.k * 2.6 - t * 0.045 + curtain.seed * 2) * curtain.amp * 0.35
      const height = curtain.height * (0.45 + 0.75 * noise(x * 0.07 + curtain.seed + t * 0.05))
      g.globalAlpha = Math.min(1, intensity * 1.1)
      g.drawImage(curtain.strip, x, Math.floor(base - height), 1, Math.floor(height))
      // Bright hem with a rose fringe below it in strong bursts.
      g.fillStyle = rgb(AURORA_MINT)
      g.globalAlpha = Math.min(0.85, intensity * 0.9)
      g.fillRect(x, Math.floor(base) - 1, 1, 1)
      if (intensity > 0.55) {
        g.fillStyle = rgb(AURORA_ROSE)
        g.globalAlpha = (intensity - 0.55) * 0.6
        g.fillRect(x, Math.floor(base) + 1, 1, 1)
      }
      s.intensity[x] = Math.max(s.intensity[x]!, intensity)
      total += intensity
    }
  }
  g.globalAlpha = 1
  s.glow = Math.min(1, total / (w * 0.9))
}

function updateSurge(s: AuroraShoreState, t: number): number {
  if (s.surge.start < 0 && t > s.surge.next) {
    s.surge.start = t
  }
  if (s.surge.start < 0) return 0
  const age = t - s.surge.start
  if (age > 11) {
    s.surge.start = -1
    s.surge.next = t + 35 + Math.random() * 40
    return 0
  }
  // Fast run-up, slow drain.
  return age < 3 ? smoothstep(0, 3, age) : 1 - smoothstep(3, 11, age)
}

function burst(s: AuroraShoreState, x: number, y: number, count: number, power: number): void {
  for (let i = 0; i < count && s.spray.length < 160; i += 1) {
    s.spray.push({
      x: x + (Math.random() - 0.5) * 6,
      y,
      vx: (Math.random() - 0.5) * 18,
      vy: -(8 + Math.random() * 16) * power,
      age: 0,
      life: 0.8 + Math.random() * 0.9,
    })
  }
}

function drawSurf(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, h: number, t: number, surge: number): number {
  const L = layout(w, h)
  const swell = L.shoreY - L.seaY
  // Crest lines rolling toward the beach.
  g.fillStyle = FOAM
  for (let line = 0; line < 4; line += 1) {
    const phase = ((t * 0.055 + line / 4) % 1 + 1) % 1
    const y = Math.floor(L.seaY + 3 + phase * (swell - 4))
    for (let x = 0; x < w; x += 1) {
      if (y < s.seaOpen[x]!) continue
      const n = noise(x * 0.13 + line * 31 + t * 0.2)
      if (n < 0.62 - phase * 0.3) continue
      g.globalAlpha = (0.08 + phase * 0.35) * (0.5 + n * 0.5)
      g.fillRect(x, y, 1, 1)
      if (phase > 0.75 && n > 0.8) g.fillRect(x, y - 1, 1, 1)
    }
  }
  // Foam churning around the stacks and the headland tip.
  for (let x = 0; x < w; x += 1) {
    const base = s.seaOpen[x]!
    const atStack = base > L.seaY && base < L.shoreY
    const atTip = x > L.footX - 2 && x <= L.tipX + 1
    if (!atStack && !atTip) continue
    if (noise(x * 0.9 + t * 1.1) < 0.4) continue
    const y = (atStack ? base : L.shoreY - 1) + (noise(x * 0.7 + t * 0.5) > 0.55 ? 1 : 0)
    const churn = 0.5 + 0.5 * Math.sin(t * 2.4 + x * 0.9)
    g.globalAlpha = 0.25 + churn * 0.4 + surge * 0.3
    g.fillRect(x, y, 1, 1)
    if (churn > 0.7) g.fillRect(x + (x % 2 ? 1 : -1), y - 1, 1, 1)
  }
  // Wash on the sand: wet sheen behind a running foam edge.
  const wash = 0.5 + 0.5 * Math.sin(t * 0.3)
  let maxEdge = L.shoreY
  for (let x = L.tipX + 1; x < w; x += 1) {
    const reach = (h - L.shoreY) * (0.07 + wash * 0.12 + surge * 0.6)
    const edge = Math.floor(L.shoreY + reach + (fbm(x * 0.06 + t * 0.12) - 0.5) * 9 * (1 + surge))
    maxEdge = Math.max(maxEdge, edge)
    // Wet sand mirrors the sky, strongest under bright curtains.
    g.fillStyle = rgb(mix([20, 46, 44], AURORA_GREEN, 0.15 + s.intensity[x]! * 0.3))
    g.globalAlpha = 0.1 + s.glow * 0.14
    g.fillRect(x, L.shoreY, 1, edge - L.shoreY)
    // Draining foam lace behind the edge.
    g.fillStyle = FOAM
    for (let y = L.shoreY + 1; y < edge - 1; y += 1) {
      const lace = noise(x * 0.23 + y * 0.81 + t * 0.25)
      if (lace < 0.8 || hash(x * 13.1 + y * 7.7) < 0.5) continue
      g.globalAlpha = (lace - 0.7) * 1.2
      g.fillRect(x, y, 1, 1)
    }
    // A thick, broken leading edge.
    const gap = noise(x * 0.4 + t * 0.6)
    if (gap > 0.22) {
      g.globalAlpha = 0.4 + 0.3 * wash + surge * 0.3
      g.fillRect(x, edge, 1, 1)
      if (gap > 0.5) g.fillRect(x, edge - 1, 1, 1)
      if (surge > 0.2 && gap > 0.6) g.fillRect(x, edge - 2 - Math.floor(surge * 2), 1, 1)
    }
  }
  g.globalAlpha = 1
  return maxEdge
}

function drawSpray(g: CanvasRenderingContext2D, s: AuroraShoreState, dt: number): void {
  g.fillStyle = FOAM
  for (let i = s.spray.length - 1; i >= 0; i -= 1) {
    const p = s.spray[i]!
    p.age += dt
    if (p.age > p.life) {
      s.spray.splice(i, 1)
      continue
    }
    p.vy += 30 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    g.globalAlpha = 0.75 * (1 - p.age / p.life)
    g.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1)
  }
  g.globalAlpha = 1
}

function drawStation(g: CanvasRenderingContext2D, s: AuroraShoreState, t: number, dt: number): void {
  const station = s.station
  station.windows.forEach((win, index) => {
    const off = index % 7 === 3 && (Math.floor(t * 0.6 + index * 3.1) % 5) === 0
    if (off) return
    g.fillStyle = win.warm ? WARM : COOL
    g.fillRect(win.x, win.y, 1, 1)
  })
  for (const beacon of station.beacons) {
    const on = 0.5 + 0.5 * Math.sin((t / beacon.period) * Math.PI * 2 + beacon.phase)
    if (on < 0.55) continue
    const alpha = Math.min(1, (on - 0.55) * 2.5)
    drawGlow(g, beacon.x, beacon.y, 3, [255, 80, 70], alpha * 0.6)
    g.fillStyle = '#ff5a4a'
    g.globalAlpha = alpha
    g.fillRect(beacon.x, beacon.y, 1, 1)
    g.globalAlpha = 1
  }
  // Rotating dish: its face narrows and widens as it turns.
  const turn = Math.cos(t * 0.5)
  const half = Math.round(Math.abs(turn) * 3)
  g.fillStyle = 'rgb(8,11,13)'
  g.fillRect(station.dish.x - half, station.dish.y, half * 2 + 1, 1)
  g.fillStyle = 'rgb(60,74,78)'
  g.fillRect(station.dish.x + (turn > 0 ? half : -half), station.dish.y, 1, 1)
  // Steam from the vent drifting with the sea wind.
  if (s.steam.length < 24 && Math.random() < dt * 2) {
    s.steam.push({ x: station.vent.x, y: station.vent.y, vx: 1.6, vy: -2, age: 0, life: 5 + Math.random() * 3 })
  }
  g.fillStyle = 'rgb(150,170,172)'
  for (let i = s.steam.length - 1; i >= 0; i -= 1) {
    const p = s.steam[i]!
    p.age += dt
    if (p.age > p.life) {
      s.steam.splice(i, 1)
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    const size = 1 + Math.floor(p.age * 0.45)
    g.globalAlpha = 0.16 * (1 - p.age / p.life)
    g.fillRect(Math.floor(p.x), Math.floor(p.y), size, size)
  }
  g.globalAlpha = 1
}

function drawBeam(g: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number): void {
  g.fillStyle = '#fff1cf'
  for (let r = 3; r < length; r += 1) {
    const half = Math.floor(r * 0.045)
    g.globalAlpha = 0.18 * (1 - r / length)
    g.fillRect(Math.floor(x + Math.cos(angle) * r), Math.floor(y + Math.sin(angle) * r * 0.22) - half, 1, half * 2 + 1)
  }
  g.globalAlpha = 1
}

function drawShips(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, h: number, t: number, dt: number): void {
  const { seaY } = layout(w, h)
  for (const ship of s.ships) {
    ship.x += ship.vx * dt
    if (ship.x > w + 6) ship.x = -6
    if (ship.x < -6) ship.x = w + 6
    const x = Math.floor(ship.x)
    if (s.seaOpen[Math.max(0, Math.min(w - 1, x))]! > seaY) continue
    g.fillStyle = 'rgb(4,6,8)'
    g.fillRect(x - 2, seaY - 1, 5, 1)
    g.fillRect(x, seaY - 2, 2, 1)
    g.fillStyle = '#fff4dc'
    g.fillRect(x + 1, seaY - 3, 1, 1)
    g.fillStyle = ship.vx > 0 ? '#5aff8a' : '#ff5a4a'
    g.fillRect(ship.vx > 0 ? x + 2 : x - 2, seaY - 2, 1, 1)
    drawGlow(g, x + 1, seaY - 3, 3, [255, 236, 200], 0.35)
    // Light rippling on the water below.
    g.fillStyle = '#fff4dc'
    for (let r = 1; r < 6; r += 1) {
      if (Math.sin(t * 3 + r * 2.1) < 0) continue
      g.globalAlpha = 0.22 * (1 - r / 6)
      g.fillRect(x + (r % 2), seaY + r, 1, 1)
    }
    g.globalAlpha = 1
  }
}

function drawReflection(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, h: number, t: number): void {
  const { seaY, shoreY } = layout(w, h)
  g.fillStyle = rgb(AURORA_GREEN)
  for (let x = 0; x < w; x += 1) {
    const intensity = s.intensity[x]!
    if (intensity < 0.2) continue
    for (let y = s.seaOpen[x]! + 1; y < shoreY - 1; y += 1) {
      const shimmer = noise(x * 0.5 + y * 0.9 + t * 1.3)
      if (shimmer < 0.62 || !dither(x, y, 0.5)) continue
      g.globalAlpha = intensity * (shimmer - 0.5) * 0.7 * (1 - (y - seaY) / (shoreY - seaY))
      g.fillRect(x, y, 1, 1)
    }
  }
  g.globalAlpha = 1
}

function drawWalkers(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, dt: number, t: number, edge: number, surge: number): void {
  for (const walker of s.walkers) {
    const fleeing = surge > 0.15 && walker.y - edge < 6
    if (walker.pause > 0 && !fleeing) {
      walker.pause -= dt
    } else {
      walker.x += walker.dir * walker.speed * (fleeing ? 3 : 1) * dt
      if (fleeing) walker.y = Math.min(walker.y + dt * 4, edge + 14)
      if (walker.x > w * 0.97 || walker.x < w * 0.47) {
        walker.dir = walker.dir > 0 ? -1 : 1
        walker.pause = 2 + Math.random() * 4
      }
      if (Math.random() < dt * 0.04) walker.pause = 3 + Math.random() * 5
    }
    const x = Math.floor(walker.x)
    const y = Math.floor(walker.y)
    const step = walker.pause > 0 ? 0 : Math.floor(t * 4 + x) % 2
    g.fillStyle = 'rgb(2,3,4)'
    g.fillRect(x, y - 4, 1, 3)
    g.fillRect(x - step, y - 1, 1, 1)
    g.fillRect(x + (1 - step), y - 1, 1, 1)
    g.fillStyle = 'rgb(40,46,50)'
    g.fillRect(x, y - 5, 1, 1)
    // Headlamp and its pool of light on the sand.
    g.fillStyle = WARM
    g.fillRect(x + walker.dir, y - 5, 1, 1)
    drawGlow(g, x + walker.dir, y - 5, 2, [255, 214, 150], 0.5)
    drawGlow(g, x + walker.dir * 5, y, 5, [255, 214, 150], 0.28)
    g.globalAlpha = 0.16
    for (let r = 2; r < 7; r += 1) g.fillRect(x + walker.dir * r, y - 5 + Math.floor(r * 0.7), 1, 1)
    g.globalAlpha = 1
  }
}

function drawBirds(g: CanvasRenderingContext2D, s: AuroraShoreState, t: number, dt: number): void {
  for (const bird of s.birds) {
    bird.angle += bird.speed * dt
    const x = Math.floor(bird.cx + Math.cos(bird.angle) * bird.rx)
    const y = Math.floor(bird.cy + Math.sin(bird.angle * 2) * bird.ry)
    const up = Math.sin(t * 9 + bird.phase) > 0
    g.fillStyle = 'rgb(176,196,196)'
    g.globalAlpha = 0.75
    g.fillRect(x, y, 1, 1)
    g.fillRect(x - 1, y + (up ? -1 : 0), 1, 1)
    g.fillRect(x + 1, y + (up ? -1 : 0), 1, 1)
  }
  g.globalAlpha = 1
}

function drawDrone(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, h: number, t: number, dt: number): void {
  const drone = s.drone
  const L = layout(w, h)
  if (!drone.active) {
    if (t < drone.next) return
    const dir = Math.random() < 0.5 ? 1 : -1
    drone.active = true
    drone.x = dir > 0 ? -10 : w + 10
    drone.vx = dir * (9 + Math.random() * 5)
    drone.y = h * (0.44 + Math.random() * 0.1)
  }
  drone.x += drone.vx * dt
  if (drone.x < -12 || drone.x > w + 12) {
    drone.active = false
    drone.next = t + 40 + Math.random() * 40
    return
  }
  const x = Math.floor(drone.x)
  const y = Math.floor(drone.y + Math.sin(t * 1.7) * 1.2)
  // Searchlight sweeping the beach below.
  const sweep = Math.sin(t * 0.8) * 10
  const groundX = x + sweep
  const groundY = L.shoreY + (h - L.shoreY) * 0.45
  g.fillStyle = '#e8f6ff'
  for (let r = 0; r < groundY - y; r += 1) {
    const k = r / (groundY - y)
    const cx = x + sweep * k
    const half = 1 + Math.floor(k * 9)
    for (let dx = -half; dx <= half; dx += 1) {
      if (!dither(Math.floor(cx) + dx, y + r, 0.35)) continue
      g.globalAlpha = 0.09 * (1 - Math.abs(dx) / (half + 1)) * (0.5 + k * 0.5)
      g.fillRect(Math.floor(cx) + dx, y + r, 1, 1)
    }
  }
  g.globalAlpha = 1
  drawGlow(g, groundX, groundY, 6, [220, 240, 255], 0.28)
  g.fillStyle = 'rgb(6,8,10)'
  g.fillRect(x - 2, y, 5, 1)
  g.fillRect(x - 3, y - 1, 1, 1)
  g.fillRect(x + 3, y - 1, 1, 1)
  if ((t * 1.5) % 1 < 0.2) {
    g.fillStyle = '#ffffff'
    g.fillRect(x, y + 1, 1, 1)
    drawGlow(g, x, y + 1, 2, [255, 255, 255], 0.5)
  }
}

function drawMeteor(g: CanvasRenderingContext2D, s: AuroraShoreState, w: number, h: number, t: number, dt: number): void {
  const m = s.meteor
  if (!m.active) {
    if (t < m.next) return
    m.active = true
    m.x = w * (0.45 + Math.random() * 0.45)
    m.y = h * (0.03 + Math.random() * 0.12)
    m.vx = -(70 + Math.random() * 50)
    m.vy = 22 + Math.random() * 14
    m.age = 0
  }
  m.age += dt
  m.x += m.vx * dt
  m.y += m.vy * dt
  if (m.age > 0.9) {
    m.active = false
    m.next = t + 18 + Math.random() * 30
    return
  }
  g.fillStyle = '#f2fff8'
  for (let i = 0; i < 10; i += 1) {
    g.globalAlpha = (1 - i / 10) * (1 - m.age / 0.9) * 0.8
    g.fillRect(Math.floor(m.x - m.vx * i * 0.006), Math.floor(m.y - m.vy * i * 0.006), 1, 1)
  }
  g.globalAlpha = 1
}

export const auroraShore: BackdropScene = {
  id: 'aurora-shore',
  init(w, h, rng) {
    const fg = paintForeground(w, h, rng)
    const L = layout(w, h)
    const aurora = document.createElement('canvas')
    aurora.width = w
    aurora.height = h
    const greenStrip = rayStrip(64, [
      [0, AURORA_GREEN, 0.95], [0.12, AURORA_GREEN, 0.6], [0.4, [60, 200, 170], 0.22], [0.72, AURORA_VIOLET, 0.1], [1, AURORA_VIOLET, 0],
    ])
    const violetStrip = rayStrip(64, [
      [0, [120, 230, 190], 0.6], [0.3, [130, 140, 230], 0.3], [0.7, AURORA_VIOLET, 0.18], [1, AURORA_ROSE, 0],
    ])
    return {
      frame: 0,
      stars: makeStars(170, w, h * 0.58, rng),
      meteor: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, next: 9 },
      curtains: [
        { y0: h * 0.33, amp: h * 0.07, k: 4.4, drift: 1, height: h * 0.27, seed: 1.7, span: [0.05, 0.95], strip: greenStrip },
        { y0: h * 0.2, amp: h * 0.05, k: 3.2, drift: -0.7, height: h * 0.17, seed: 4.2, span: [0.3, 1.1], strip: violetStrip },
        { y0: h * 0.44, amp: h * 0.05, k: 6.1, drift: 0.5, height: h * 0.15, seed: 7.9, span: [0.05, 0.55], strip: greenStrip },
      ],
      aurora,
      intensity: new Float32Array(w),
      glow: 0,
      clouds: [0, 1, 2, 3].map((i) => ({
        sprite: cloudSprite(Math.floor(w * (0.12 + rng() * 0.12)), Math.max(4, Math.floor(h * 0.025)), i * 13),
        x: rng() * w,
        y: Math.floor(h * (0.5 + rng() * 0.08)),
        vx: 0.6 + rng() * 1.2,
      })),
      foreground: fg.canvas,
      rim: fg.rim,
      seaOpen: fg.seaOpen,
      station: fg.station,
      steam: [],
      lamp: fg.lamp,
      cave: fg.cave,
      ships: [{ x: w * 0.7, vx: 1.1 }, { x: w * 0.2, vx: -0.7 }],
      walkers: [
        { x: w * 0.62, dir: 1, speed: 2.2, y: Math.floor(L.shoreY + (h - L.shoreY) * 0.62), pause: 0 },
        { x: w * 0.78, dir: -1, speed: 1.8, y: Math.floor(L.shoreY + (h - L.shoreY) * 0.74), pause: 3 },
      ],
      birds: Array.from({ length: 7 }, () => ({
        angle: rng() * Math.PI * 2,
        speed: 0.25 + rng() * 0.35,
        rx: w * (0.05 + rng() * 0.08),
        ry: h * (0.03 + rng() * 0.05),
        cx: w * (0.27 + rng() * 0.08),
        cy: h * (0.36 + rng() * 0.12),
        phase: rng() * 6,
      })),
      drone: { active: false, x: 0, y: 0, vx: 0, next: 14 },
      surge: { start: -1, next: 20 },
      spray: [],
      mist: Array.from({ length: 34 }, () => ({
        x: rng() * w,
        y: L.seaY + rng() * (h - L.seaY),
        vx: -(2 + rng() * 5),
        alpha: 0.04 + rng() * 0.1,
      })),
    } satisfies AuroraShoreState as AuroraShoreState
  },
  paintStatic(g, w, h, rng) {
    const { seaY } = layout(w, h)
    bands(g, w, 0, seaY, [
      [0, [2, 3, 9]],
      [0.35, [4, 8, 18]],
      [0.75, [8, 21, 29]],
      [1, [16, 42, 42]],
    ])
    // Faint Milky Way dust behind the aurora.
    for (let i = 0; i < 260; i += 1) {
      const gauss = (rng() + rng() + rng()) / 3
      g.fillStyle = rgb(mix([170, 190, 215], [200, 170, 230], rng() * 0.4))
      g.globalAlpha = 0.06 + rng() * 0.28
      g.fillRect(Math.floor(rng() * w), Math.floor(h * (0.05 + gauss * 0.28) + (rng() - 0.5) * h * 0.04), 1, 1)
    }
    g.globalAlpha = 1
    paintMoon(g, Math.floor(w * 0.875), Math.floor(h * 0.13), Math.max(3, Math.floor(w / 75)))
  },
  paintDynamic(g, w, h, t, cam, state) {
    const s = state as AuroraShoreState
    void cam
    const dt = 1 / 60
    const L = layout(w, h)
    if (s.frame % 2 === 0) updateAurora(s, w, h, t)
    s.frame += 1

    drawStars(g, s.stars, t, '#e4f4f0', { maxAlpha: 0.85, brightThreshold: 0.94 })
    drawMeteor(g, s, w, h, t, dt)
    g.drawImage(s.aurora, 0, 0)
    // Airglow pooling on the horizon under the brightest curtains.
    drawGlow(g, Math.floor(w * 0.55), L.seaY, Math.floor(w * 0.35), AURORA_GREEN, 0.03 + s.glow * 0.12)
    for (const cloud of s.clouds) {
      cloud.x += cloud.vx * dt
      if (cloud.x > w) cloud.x = -cloud.sprite.width
      g.globalAlpha = 0.75
      g.drawImage(cloud.sprite, Math.floor(cloud.x), cloud.y)
    }
    g.globalAlpha = 1

    g.drawImage(s.foreground, 0, 0)
    // Sky-facing rock picks up the aurora.
    g.fillStyle = rgb(mix(AURORA_GREEN, [40, 80, 70], 0.35))
    g.globalAlpha = 0.14 + s.glow * 0.5
    for (const [x, y] of s.rim) g.fillRect(x, y, 1, 1)
    g.globalAlpha = 1

    drawStation(g, s, t, dt)
    drawGlow(g, s.lamp.x, s.lamp.y, 3, [255, 236, 196], 0.8)
    g.fillStyle = '#fff4dc'
    g.fillRect(s.lamp.x, s.lamp.y, 1, 1)
    const sweep = t * 0.35
    if (Math.cos(sweep) < 0.2) drawBeam(g, s.lamp.x, s.lamp.y, Math.PI + Math.sin(sweep) * 0.5, Math.floor(w * 0.22))
    if (Math.cos(sweep) > -0.2) drawBeam(g, s.lamp.x, s.lamp.y, Math.sin(sweep) * 0.3, Math.floor(w * 0.12))
    drawShips(g, s, w, h, t, dt)
    drawReflection(g, s, w, h, t)

    const surge = updateSurge(s, t)
    if (surge > 0 && surge < 0.25 && s.spray.length < 40) {
      for (let x = L.tipX + 2; x < w; x += 1) {
        const base = s.seaOpen[x]!
        if (base > L.seaY && base < L.shoreY && Math.random() < 0.08) burst(s, x, base, 3, 1.3)
      }
      burst(s, L.tipX, L.shoreY - 2, 6, 1.6)
    }
    const edge = drawSurf(g, s, w, h, t, surge)
    drawSpray(g, s, dt)
    drawWalkers(g, s, w, dt, t, edge, surge)

    // Lantern inside the cave.
    const flicker = 0.7 + 0.3 * Math.sin(t * 7.3) * Math.sin(t * 3.1)
    drawGlow(g, s.cave.x, s.cave.y - 1, 5, [255, 170, 90], 0.35 * flicker)
    g.fillStyle = WARM
    g.fillRect(s.cave.x, s.cave.y - 1, 1, 1)

    drawBirds(g, s, t, dt)
    drawDrone(g, s, w, h, t, dt)
    g.fillStyle = FOAM
    for (const part of s.mist) {
      part.x += part.vx * dt
      if (part.x < -4) part.x = w + 4
      g.globalAlpha = part.alpha
      g.fillRect(Math.floor(part.x), Math.floor(part.y), 3, 1)
    }
    // Dark overlay so the scene stays behind the cards.
    g.fillStyle = 'rgb(2,4,6)'
    g.globalAlpha = OVERLAY_ALPHA
    g.fillRect(0, 0, w, h)
    g.globalAlpha = 1
  },
}
