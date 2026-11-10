export type Rgb = [number, number, number]

export function rgb(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

export function sampleStops(stops: Array<[number, Rgb]>, t: number): Rgb {
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
