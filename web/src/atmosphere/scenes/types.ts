export type BackdropSceneId = 'dune-night' | 'dune-day' | 'tide' | 'ember' | 'void' | 'aurora-shore'

interface SceneCam {
  x: number
  y: number
}

export interface BackdropScene {
  id: BackdropSceneId
  init: (w: number, h: number, rng: () => number) => unknown
  paintStatic: (g: CanvasRenderingContext2D, w: number, h: number, rng: () => number) => void
  paintDynamic: (g: CanvasRenderingContext2D, w: number, h: number, t: number, cam: SceneCam, state: unknown) => void
}
