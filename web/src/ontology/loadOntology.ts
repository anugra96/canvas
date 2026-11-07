import {
  ontologySchema,
  type Ontology,
} from '@canvas/contract'

export async function loadOntology(idToken: string): Promise<Ontology> {
  const baseUrl = (import.meta.env.VITE_CANVAS_API_BASE_URL ?? '').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/v1/ontology`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${idToken}` },
  })
  if (!response.ok) {
    throw new Error(`Ontology request failed with ${response.status}.`)
  }
  const parsed = ontologySchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error('The runtime ontology is invalid.')
  }
  return parsed.data
}
