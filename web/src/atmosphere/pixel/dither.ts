import { rgb, type Rgb } from './color'

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export function dither(x: number, y: number, amount: number): boolean {
  return BAYER4[(y & 3) * 4 + (x & 3)]! < amount * 16
}

export function fillDithered(
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
