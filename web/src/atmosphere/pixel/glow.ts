import type { Rgb } from './color'

export interface GlowOptions {
  size?: number | 'color'
  skipInvisible?: boolean
  clampAlpha?: boolean
}

const glowCache = new Map<string, HTMLCanvasElement>()

export function drawGlow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: Rgb,
  alpha: number,
  options: GlowOptions = {},
): void {
  if (options.skipInvisible && (alpha <= 0.005 || radius <= 0)) return
  const size = options.size === undefined || options.size === 'color'
    ? Math.max(4, Math.ceil(color[0] / 4) * 4)
    : options.size
  const key = `${size}:${color[0]}:${color[1]}:${color[2]}`
  let sprite = glowCache.get(key)
  if (!sprite) {
    sprite = document.createElement('canvas')
    sprite.width = size * 2
    sprite.height = size * 2
    const ctx = sprite.getContext('2d')!
    const gradient = ctx.createRadialGradient(size, size, 0, size, size, size)
    gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.85)`)
    gradient.addColorStop(0.4, `rgba(${color[0]},${color[1]},${color[2]},0.32)`)
    gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size * 2, size * 2)
    glowCache.set(key, sprite)
  }
  g.globalAlpha = options.clampAlpha ? Math.min(1, alpha) : alpha
  g.drawImage(sprite, Math.floor(x - radius), Math.floor(y - radius), radius * 2, radius * 2)
  g.globalAlpha = 1
}
