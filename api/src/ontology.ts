import { readFile, stat } from 'node:fs/promises'

import {
  DEFAULT_ONTOLOGY,
  ontologySchema,
  type Ontology,
} from '@canvas/contract'

let cachedOntology: Ontology | null = null
let cachedMtime = 0

export function resetOntologyCache(): void {
  cachedOntology = null
  cachedMtime = 0
}

export async function loadOntology(): Promise<Ontology> {
  const path = process.env.CANVAS_ONTOLOGY_PATH
  if (!path) return DEFAULT_ONTOLOGY

  try {
    const file = await stat(path)
    if (cachedOntology && file.mtimeMs === cachedMtime) return cachedOntology
    const raw = await readFile(path, 'utf8')
    const parsed = ontologySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      console.warn('Canvas ontology file is invalid. Using the built-in ontology.')
      return DEFAULT_ONTOLOGY
    }
    cachedOntology = parsed.data
    cachedMtime = file.mtimeMs
    return parsed.data
  } catch {
    return DEFAULT_ONTOLOGY
  }
}
