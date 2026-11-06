export interface EditResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

function lineBounds(text: string, cursor: number): { start: number; end: number; line: string } {
  const start = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextBreak = text.indexOf('\n', cursor)
  const end = nextBreak === -1 ? text.length : nextBreak
  return { start, end, line: text.slice(start, end) }
}

function replaceLine(text: string, start: number, end: number, replacement: string, cursorOffset = 0): EditResult {
  const next = text.slice(0, start) + replacement + text.slice(end)
  const cursor = start + replacement.length + cursorOffset
  return { text: next, selectionStart: cursor, selectionEnd: cursor }
}

export function continueMarkdownList(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): EditResult | null {
  if (selectionStart !== selectionEnd) return null
  const { start, end, line } = lineBounds(text, selectionStart)

  const task = /^(\s*)([-*+])\s+\[[ xX]\]\s*(.*)$/.exec(line)
  if (task) {
    const [, indent = '', bullet = '-', content = ''] = task
    if (content.trim() === '') return replaceLine(text, start, end, '')
    const insertion = `\n${indent}${bullet} [ ] `
    const cursor = selectionStart + insertion.length
    return {
      text: text.slice(0, selectionStart) + insertion + text.slice(selectionStart),
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  const bullet = /^(\s*)([-*+])\s+(.*)$/.exec(line)
  if (bullet) {
    const [, indent = '', marker = '-', content = ''] = bullet
    if (content.trim() === '') return replaceLine(text, start, end, '')
    const insertion = `\n${indent}${marker} `
    const cursor = selectionStart + insertion.length
    return {
      text: text.slice(0, selectionStart) + insertion + text.slice(selectionStart),
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  const ordered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(line)
  if (ordered) {
    const [, indent = '', number = '1', delimiter = '.', content = ''] = ordered
    if (content.trim() === '') return replaceLine(text, start, end, '')
    const insertion = `\n${indent}${Number(number) + 1}${delimiter} `
    const cursor = selectionStart + insertion.length
    return {
      text: text.slice(0, selectionStart) + insertion + text.slice(selectionStart),
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  const quote = /^(\s*)>\s?(.*)$/.exec(line)
  if (quote) {
    const [, indent = '', content = ''] = quote
    if (content.trim() === '') return replaceLine(text, start, end, '')
    const insertion = `\n${indent}> `
    const cursor = selectionStart + insertion.length
    return {
      text: text.slice(0, selectionStart) + insertion + text.slice(selectionStart),
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  return null
}

export function indentMarkdownList(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
): EditResult | null {
  const { start, line } = lineBounds(text, selectionStart)
  const isList = /^(\s*)([-*+]|\d+[.)]|>)\s+/.test(line)
  if (!isList) return null

  if (outdent) {
    const leading = /^ {1,2}/.exec(line)?.[0].length ?? 0
    if (leading === 0) return null
    const next = text.slice(0, start) + text.slice(start + leading)
    return {
      text: next,
      selectionStart: Math.max(start, selectionStart - leading),
      selectionEnd: Math.max(start, selectionEnd - leading),
    }
  }

  const next = text.slice(0, start) + '  ' + text.slice(start)
  return {
    text: next,
    selectionStart: selectionStart + 2,
    selectionEnd: selectionEnd + 2,
  }
}

export function toggleInlineWrap(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): EditResult {
  const before = text.slice(Math.max(0, selectionStart - marker.length), selectionStart)
  const after = text.slice(selectionEnd, selectionEnd + marker.length)
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, selectionStart - marker.length) + text.slice(selectionStart, selectionEnd) + text.slice(selectionEnd + marker.length),
      selectionStart: selectionStart - marker.length,
      selectionEnd: selectionEnd - marker.length,
    }
  }

  const selected = text.slice(selectionStart, selectionEnd)
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    return {
      text: text.slice(0, selectionStart) + selected.slice(marker.length, -marker.length) + text.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionEnd - marker.length * 2,
    }
  }

  if (selectionStart === selectionEnd) {
    const cursor = selectionStart + marker.length
    return {
      text: text.slice(0, selectionStart) + marker + marker + text.slice(selectionEnd),
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  return {
    text: text.slice(0, selectionStart) + marker + selected + marker + text.slice(selectionEnd),
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionEnd + marker.length,
  }
}
