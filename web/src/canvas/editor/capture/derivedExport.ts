import { toPng } from 'html-to-image'

import type { DerivedCard } from '../../views/derivedViews'
import type { DerivedDiagram } from '../../views/diagramLayout'
import { downloadText, downloadUrl, safeFileTitle } from './exportFile'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, Math.max(1, length - 1))}…` : value
}

function accentColor(accent: string | undefined): string {
  return accent?.startsWith('#') ? accent : '#64748b'
}

function cardLines(card: DerivedCard): string[] {
  const lines: string[] = []
  if (card.contents && card.contents.length > 0) {
    lines.push(card.contents.map((chip) => `${chip.count} ${chip.typeLabel.toLowerCase()}${chip.count === 1 ? '' : 's'}`).join(' · '))
  }
  if (card.annotations && card.annotations.length > 0) {
    lines.push(card.annotations.map((badge) => `${badge.count} ${badge.label}`).join(' · '))
  }
  if (card.internalRelations) {
    lines.push(`${card.internalRelations} internal relation${card.internalRelations === 1 ? '' : 's'}`)
  }
  for (const item of card.unassignedItems ?? []) {
    lines.push(item.label)
  }
  return lines
}

function cardSvg(card: DerivedDiagram['nodes'][number]): string {
  const height = card.height ?? 86
  const accent = accentColor(card.accent)
  const lines = cardLines(card)
  const lineHeight = 12
  const text: string[] = [
    `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${height}" rx="7" fill="#ffffff" stroke="#cbd5e1"/>`,
    `<rect x="${card.x}" y="${card.y}" width="4" height="${height}" rx="2" fill="${accent}"/>`,
    `<text x="${card.x + 12}" y="${card.y + 17}" fill="${accent}" font-size="8" font-weight="700" letter-spacing="1">${escapeXml(card.typeLabel.toUpperCase())}</text>`,
    `<text x="${card.x + 12}" y="${card.y + 34}" fill="#0f172a" font-size="12" font-weight="700">${escapeXml(truncate(card.label, Math.max(10, Math.floor(card.width / 7))))}</text>`,
  ]
  if (card.detail) {
    text.push(`<text x="${card.x + 12}" y="${card.y + 48}" fill="#64748b" font-size="9">${escapeXml(truncate(card.detail, Math.floor(card.width / 5)))}</text>`)
  }
  lines.forEach((line, index) => {
    text.push(`<text x="${card.x + 12}" y="${card.y + 62 + index * lineHeight}" fill="${index < (card.contents?.length ?? 0) ? '#475569' : '#64748b'}" font-size="8">${escapeXml(truncate(line, Math.floor(card.width / 4.5)))}</text>`)
  })
  return text.join('\n')
}

export function derivedDiagramSvg(diagram: DerivedDiagram, footer: string): string {
  const footerHeight = 36
  const width = Math.max(320, Math.ceil(diagram.width))
  const height = Math.max(120, Math.ceil(diagram.height + footerHeight))
  const edges = diagram.edges.map((edge) => [
    `<path d="${edge.path}" fill="none" stroke="#94a3b8" stroke-width="1.4" marker-end="url(#arrow)"/>`,
    `<text x="${edge.labelX}" y="${edge.labelY}" text-anchor="middle" fill="#64748b" font-size="9" font-weight="700">${escapeXml(edge.label)}</text>`,
  ].join('')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  ${edges}
  ${diagram.nodes.map(cardSvg).join('\n  ')}
  <line x1="0" y1="${diagram.height + 6}" x2="${width}" y2="${diagram.height + 6}" stroke="#cbd5e1"/>
  <text x="20" y="${diagram.height + 25}" fill="#475569" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10">${escapeXml(footer)}</text>
</svg>`
}

export function derivedExportFilename(
  title: string,
  viewLabel: string,
  levelLabel: string,
  extension: 'png' | 'svg',
): string {
  return `${safeFileTitle(title)}-${safeFileTitle(viewLabel, 'view')}-${safeFileTitle(levelLabel, 'level')}.${extension}`
}

export async function exportDerivedPng(
  surface: HTMLElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const background = getComputedStyle(surface).backgroundColor
  const dataUrl = await toPng(surface, {
    pixelRatio: scale,
    backgroundColor: background && background !== 'rgba(0, 0, 0, 0)' ? background : '#f8fafc',
    cacheBust: true,
  })
  downloadUrl(dataUrl, filename)
}

export function exportDerivedSvg(
  diagram: DerivedDiagram,
  footer: string,
  filename: string,
): void {
  downloadText(derivedDiagramSvg(diagram, footer), filename, 'image/svg+xml')
}
