export interface Star {
  x: number
  y: number
  phase: number
  speed: number
  mag: number
}

export interface StarOptions {
  maxAlpha?: number
  brightThreshold?: number
}

export function makeStars(count: number, w: number, maxY: number, rng: () => number): Star[] {
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

export function drawStars(
  g: CanvasRenderingContext2D,
  stars: Star[],
  t: number,
  color: string,
  options: StarOptions = {},
): void {
  const maxAlpha = options.maxAlpha ?? 0.9
  const brightThreshold = options.brightThreshold ?? 0.9
  g.fillStyle = color
  for (const star of stars) {
    const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase))
    const bright = star.mag * twinkle
    if (bright < 0.25) continue
    g.globalAlpha = Math.min(maxAlpha, bright)
    if (star.mag > brightThreshold) {
      g.fillRect(star.x - 1, star.y, 3, 1)
      g.fillRect(star.x, star.y - 1, 1, 3)
    } else {
      g.fillRect(star.x, star.y, 1, 1)
    }
  }
  g.globalAlpha = 1
}
