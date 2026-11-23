import type { CanvasNode, JsonCanvas } from './jsonCanvas'
import { groupParents, type Sizes } from './layout/planLayout'
import { getDistrict } from './ontology'

export function isDistrict(node: CanvasNode | undefined): boolean {
  return Boolean(node && node.type === 'group' && getDistrict(node) !== undefined)
}

export function districtNodes(canvas: Pick<JsonCanvas, 'nodes'>): CanvasNode[] {
  return (canvas.nodes ?? []).filter((node) => isDistrict(node))
}

// A card's district is the nearest ancestor group that is a district,
// using the same membership rule as the planner.
export function districtOf(canvas: JsonCanvas, sizes?: Sizes): Map<string, string> {
  const parents = groupParents(canvas, sizes)
  const nodeById = new Map((canvas.nodes ?? []).map((node) => [node.id, node]))
  const districts = new Map<string, string>()

  for (const node of canvas.nodes ?? []) {
    if (node.type === 'group') continue
    let current = parents.get(node.id)
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      if (isDistrict(nodeById.get(current))) {
        districts.set(node.id, current)
        break
      }
      current = parents.get(current)
    }
  }

  return districts
}
