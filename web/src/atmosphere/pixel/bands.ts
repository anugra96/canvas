import { rgb, sampleStops, type Rgb } from './color'
import { dither, fillDithered } from './dither'

export interface BandOptions {
  minBands?: number
  seam?: 'band' | 'edge'
  threshold?: number
  amount?: number
}

function channelSpread(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function channelSum(a: Rgb, b: Rgb): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

export function bands(
  g: CanvasRenderingContext2D,
  w: number,
  y0: number,
  h: number,
  stops: Array<[number, Rgb]>,
  options: BandOptions = {},
): void {
  const count = Math.max(options.minBands ?? 6, Math.floor(h / 2))
  const seam = options.seam ?? 'edge'
  const threshold = options.threshold ?? 4
  const amount = options.amount ?? 0.5
  let prev: Rgb | null = null
  for (let band = 0; band < count; band += 1) {
    const c = sampleStops(stops, (band + 0.5) / count)
    const y = y0 + Math.floor(band * h / count)
    const height = Math.floor((band + 1) * h / count) - Math.floor(band * h / count)
    if (seam === 'band') {
      if (prev && channelSpread(prev, c) > threshold) {
        fillDithered(g, 0, y, w, height, prev, c, amount)
      } else {
        g.fillStyle = rgb(c)
        g.fillRect(0, y, w, height)
      }
    } else {
      g.fillStyle = rgb(c)
      g.fillRect(0, y, w, height)
      if (prev && channelSum(prev, c) > threshold) {
        g.fillStyle = rgb(prev)
        for (let px = 0; px < w; px += 1) {
          if (dither(px, y, amount)) g.fillRect(px, y, 1, 1)
        }
      }
    }
    prev = c
  }
}
