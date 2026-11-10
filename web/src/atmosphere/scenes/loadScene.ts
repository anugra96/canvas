import type { BackdropScene, BackdropSceneId } from './types'

const loaders: Record<BackdropSceneId, () => Promise<BackdropScene>> = {
  'dune-night': () => import('./duneNight').then((module) => module.duneNight),
  'dune-day': () => import('./duneDay').then((module) => module.duneDay),
  tide: () => import('./tide').then((module) => module.tide),
  ember: () => import('./ember').then((module) => module.ember),
  void: () => import('./gargantua').then((module) => module.gargantua),
  'aurora-shore': () => import('./auroraShore').then((module) => module.auroraShore),
}

export function loadScene(id: BackdropSceneId): Promise<BackdropScene> {
  return loaders[id]()
}
