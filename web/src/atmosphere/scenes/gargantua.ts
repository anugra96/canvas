import {
  BAYER4,
  drawGlow,
  drawStars,
  makeStars,
  mix,
  rgb,
  type Rgb,
  type Star,
} from '../pixel'
import { drawRimLight, drawSphere, skyBands } from './kit'
import type { BackdropScene } from './types'

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

export const gargantua: BackdropScene = {
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
