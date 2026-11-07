export function normalizeImportedCanvas(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const canvas = value as Record<string, unknown>
  if (!Array.isArray(canvas.nodes)) return value

  const nodes = canvas.nodes.map((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node
    const record = node as Record<string, unknown>
    if (record.type !== 'file') return node

    const file = typeof record.file === 'string' && record.file ? record.file : 'File'
    const subpath = typeof record.subpath === 'string' ? record.subpath : ''
    const text = subpath ? `**${file}**\n\n${subpath}` : `**${file}**`
    const next: Record<string, unknown> = {
      ...record,
      type: 'text',
      text,
      app: {
        ...(record.app && typeof record.app === 'object'
          ? record.app as Record<string, unknown>
          : {}),
        importedFile: { file, subpath },
      },
    }
    delete next.file
    delete next.subpath
    delete next.ratio
    return next
  })

  return { ...canvas, nodes }
}
