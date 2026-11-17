import type { ApiCheckFix, CanvasProfileIssue } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'
import { validationIssueKey } from '../editor/validationIdentity'
import { semanticSuggestionForIssue } from '../semantics/semanticSuggestion'

interface AddCardFix {
  targetId: string
  entityType: string
  relationType: string
  nameSuffix: string
}

type SuggestionAction =
  | { kind: 'add-cards'; fixes: AddCardFix[] }
  | { kind: 'api-fix'; targetId: string; fix: ApiCheckFix }

interface CanvasSuggestionItem {
  id: string
  title: string
  action: SuggestionAction
}

export interface CanvasSuggestion {
  id: string
  title: string
  description: string
  count: number
  items: CanvasSuggestionItem[]
}

const TITLES: Partial<Record<CanvasProfileIssue['code'], string>> = {
  artifact_without_producer: 'Add missing artifact producers',
  process_without_runner: 'Add missing process runners',
}

const SOURCE_TYPES: Partial<Record<CanvasProfileIssue['code'], string[]>> = {
  artifact_without_producer: ['system', 'repository', 'process', 'api'],
  process_without_runner: ['actor', 'system'],
}

const API_FIXES: Partial<Record<CanvasProfileIssue['code'], {
  title: string
  description: string
  fix: ApiCheckFix
}>> = {
  path_parameter_mismatch: {
    title: 'Add missing path parameters',
    description: 'Add the path parameters named in the endpoint path.',
    fix: 'missing_path_parameter',
  },
  mutation_errors_missing: {
    title: 'Attach standard errors',
    description: 'Add 4XX and 5XX Problem Details responses.',
    fix: 'standard_errors',
  },
  list_pagination_missing: {
    title: 'Add pagination parameters',
    description: 'Add limit and cursor query parameters.',
    fix: 'pagination',
  },
  endpoint_without_resource: {
    title: 'Add Resource tags',
    description: 'Tag each endpoint with its first static path segment.',
    fix: 'tag',
  },
}

function nodeLabel(node: CanvasFlowNode | undefined): string {
  if (!node) return 'Missing card'
  const fields = node.data.entity?.fields ?? {}
  const name = String(fields.name ?? fields.title ?? '').trim()
  if (name) return name
  if (node.data.label) return node.data.label
  const type = node.data.entity?.entityType
  return type ? `Untitled ${type}` : 'Untitled card'
}

function hasUnrelatedIncoming(
  nodeId: string,
  edges: CanvasFlowEdge[],
  nodesById: Map<string, CanvasFlowNode>,
  sourceTypes: string[],
): boolean {
  return edges.some((edge) => {
    if (edge.target !== nodeId || edge.data?.relationType) return false
    const source = nodesById.get(edge.source)
    const type = source?.data.entity?.entityType
    return type ? sourceTypes.includes(type) : false
  })
}

export function buildSuggestions(
  issues: CanvasProfileIssue[],
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
): CanvasSuggestion[] {
  const suggestions: CanvasSuggestion[] = []
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  for (const issue of issues) {
    const apiFix = API_FIXES[issue.code]
    if (apiFix && issue.nodeId) {
      if (issue.code === 'path_parameter_mismatch' && !issue.message.includes('Missing path parameter')) continue
      const item: CanvasSuggestionItem = {
        id: validationIssueKey(issue),
        title: nodeLabel(nodesById.get(issue.nodeId)),
        action: { kind: 'api-fix', targetId: issue.nodeId, fix: apiFix.fix },
      }
      const existing = suggestions.find((suggestion) => suggestion.id === `api:${issue.code}`)
      if (existing) {
        existing.count += 1
        existing.items.push(item)
      } else {
        suggestions.push({
          id: `api:${issue.code}`,
          title: apiFix.title,
          description: apiFix.description,
          count: 1,
          items: [item],
        })
      }
      continue
    }
    const fixConfig = semanticSuggestionForIssue(issue)
    const title = TITLES[issue.code]
    if (!fixConfig || !title || !issue.nodeId) continue
    const sourceTypes = SOURCE_TYPES[issue.code] ?? []
    if (hasUnrelatedIncoming(issue.nodeId, edges, nodesById, sourceTypes)) {
      continue
    }

    const fix: AddCardFix = {
      targetId: issue.nodeId,
      entityType: fixConfig.entityType,
      relationType: fixConfig.relationType,
      nameSuffix: fixConfig.nameSuffix,
    }
    const item: CanvasSuggestionItem = {
      id: validationIssueKey(issue),
      title: nodeLabel(nodesById.get(issue.nodeId)),
      action: { kind: 'add-cards', fixes: [fix] },
    }
    const existing = suggestions.find((suggestion) => suggestion.id === `add:${issue.code}`)
    if (existing) {
      existing.count += 1
      existing.items.push(item)
    } else {
      suggestions.push({
        id: `add:${issue.code}`,
        title,
        description: fixConfig.description,
        count: 1,
        items: [item],
      })
    }
  }

  return suggestions
}
