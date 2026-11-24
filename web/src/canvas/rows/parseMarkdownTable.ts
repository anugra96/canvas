export interface MarkdownTable {
  header: string[]
  rows: Array<Array<string | null>>
}

const SEPARATOR_CELL = /^:?-{3,}:?$/

function tableLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function splitRow(line: string): string[] {
  const trimmed = line.trim()
  const cells: string[] = []
  let cell = ''
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]!
    if (character === '\\' && trimmed[index + 1] === '|') {
      cell += '|'
      index += 1
    } else if (character === '|') {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell)
  if (trimmed.startsWith('|')) cells.shift()
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) cells.pop()
  return cells.map((value) => value.trim())
}

function separatorCells(text: string): string[] | undefined {
  const lines = tableLines(text)
  if (lines.length < 2) return undefined
  const cells = splitRow(lines[1]!)
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell))
    ? cells
    : undefined
}

export function isMarkdownTable(text: string): boolean {
  return separatorCells(text) !== undefined
}

export function parseMarkdownTable(text: string): MarkdownTable {
  const lines = tableLines(text)
  const separator = separatorCells(text)
  if (!separator || lines.length === 0) throw new Error('Not a markdown table.')
  const header = splitRow(lines[0]!)
  if (header.length !== separator.length) throw new Error('Not a markdown table.')
  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line)
    return header.map((_, index) => {
      const value = cells[index] ?? ''
      return value === '' ? null : value
    })
  })
  return { header, rows }
}
