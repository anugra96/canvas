export interface CodeEditResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

const INDENT = '  '

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1
}

function lineEnd(text: string, index: number): number {
  const next = text.indexOf('\n', index)
  return next === -1 ? text.length : next
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? ''
}

function removedIndent(line: string): number {
  return Math.min(2, leadingWhitespace(line).length)
}

export function indentCode(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
): CodeEditResult | null {
  if (selectionStart === selectionEnd) {
    const start = lineStart(text, selectionStart)
    if (!outdent) {
      const next = text.slice(0, selectionStart) + INDENT + text.slice(selectionStart)
      return {
        text: next,
        selectionStart: selectionStart + INDENT.length,
        selectionEnd: selectionStart + INDENT.length,
      }
    }
    const before = text.slice(start, selectionStart)
    if (!/^[ \t]{1,2}$/.test(before)) return null
    const remove = Math.min(2, before.length)
    return {
      text: text.slice(0, start) + text.slice(start + remove),
      selectionStart: selectionStart - remove,
      selectionEnd: selectionEnd - remove,
    }
  }

  const firstLineStart = lineStart(text, selectionStart)
  const lastLineEnd = lineEnd(text, selectionEnd)
  const lines = text.slice(firstLineStart, lastLineEnd).split('\n')
  let removedFirst = 0
  let removedTotal = 0
  const nextLines = lines.map((line, index) => {
    if (outdent) {
      const remove = removedIndent(line)
      if (index === 0) removedFirst = remove
      removedTotal += remove
      return line.slice(remove)
    }
    return INDENT + line
  })
  const nextText = text.slice(0, firstLineStart) + nextLines.join('\n') + text.slice(lastLineEnd)
  if (outdent) {
    return {
      text: nextText,
      selectionStart: Math.max(firstLineStart, selectionStart - removedFirst),
      selectionEnd: Math.max(firstLineStart, selectionEnd - removedTotal),
    }
  }
  return {
    text: nextText,
    selectionStart: selectionStart + INDENT.length,
    selectionEnd: selectionEnd + INDENT.length * lines.length,
  }
}

export function smartEnter(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): CodeEditResult {
  const start = lineStart(text, selectionStart)
  const baseIndent = leadingWhitespace(text.slice(start, selectionStart))
  const before = text.slice(0, selectionStart)
  const after = text.slice(selectionEnd)
  const trimmedBefore = before.replace(/[ \t]+$/, '')
  const nextChar = after[0]
  const matching: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const lastChar = trimmedBefore.slice(-1)

  if (nextChar && matching[lastChar] === nextChar) {
    const inner = baseIndent + INDENT
    const insert = `\n${inner}\n${baseIndent}`
    const cursor = before.length + 1 + inner.length
    return {
      text: before + insert + after,
      selectionStart: cursor,
      selectionEnd: cursor,
    }
  }

  const opensBlock = /[({[]$/.test(trimmedBefore) || /:$/.test(trimmedBefore) || /=>$/.test(trimmedBefore)
  const insert = `\n${baseIndent}${opensBlock ? INDENT : ''}`
  const cursor = before.length + insert.length
  return {
    text: before + insert + after,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}

export function autoClosePair(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  open: string,
  close: string,
): CodeEditResult {
  if (selectionStart !== selectionEnd) {
    const selected = text.slice(selectionStart, selectionEnd)
    const next = text.slice(0, selectionStart) + open + selected + close + text.slice(selectionEnd)
    return {
      text: next,
      selectionStart: selectionStart + open.length,
      selectionEnd: selectionEnd + open.length,
    }
  }
  const cursor = selectionStart + open.length
  return {
    text: text.slice(0, selectionStart) + open + close + text.slice(selectionEnd),
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}

export function skipClosingChar(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  character: string,
): CodeEditResult | null {
  if (selectionStart !== selectionEnd || text[selectionStart] !== character) return null
  return {
    text,
    selectionStart: selectionStart + 1,
    selectionEnd: selectionStart + 1,
  }
}

export function smartBackspace(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): CodeEditResult | null {
  if (selectionStart !== selectionEnd || selectionStart === 0) return null
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
  const previous = text[selectionStart - 1]
  const next = text[selectionStart]
  if (!previous || !next || pairs[previous] !== next) return null
  return {
    text: text.slice(0, selectionStart - 1) + text.slice(selectionStart + 1),
    selectionStart: selectionStart - 1,
    selectionEnd: selectionStart - 1,
  }
}

export function lineCommentToken(language: string): string | null {
  const tokens: Record<string, string> = {
    typescript: '//',
    javascript: '//',
    tsx: '//',
    jsx: '//',
    go: '//',
    rust: '//',
    cpp: '//',
    python: '#',
    yaml: '#',
    sql: '--',
  }
  return tokens[language.toLowerCase()] ?? null
}

export function toggleLineComment(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  token: string,
): CodeEditResult {
  const firstLineStart = lineStart(text, selectionStart)
  const lastLineEnd = lineEnd(text, selectionEnd)
  const lines = text.slice(firstLineStart, lastLineEnd).split('\n')
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  const allCommented = nonEmpty.length > 0 && nonEmpty.every((line) => {
    const indent = leadingWhitespace(line)
    return line.slice(indent.length).startsWith(token)
  })

  let firstDelta = 0
  let totalDelta = 0
  const nextLines = lines.map((line, index) => {
    if (line.trim() === '') return line
    const indent = leadingWhitespace(line)
    const body = line.slice(indent.length)
    if (allCommented) {
      const remove = body.startsWith(`${token} `) ? token.length + 1 : token.length
      if (index === 0) firstDelta = -remove
      totalDelta -= remove
      return indent + body.slice(remove)
    }
    const add = `${token} `
    if (index === 0) firstDelta = add.length
    totalDelta += add.length
    return indent + add + body
  })

  return {
    text: text.slice(0, firstLineStart) + nextLines.join('\n') + text.slice(lastLineEnd),
    selectionStart: Math.max(firstLineStart, selectionStart + firstDelta),
    selectionEnd: Math.max(firstLineStart, selectionEnd + totalDelta),
  }
}
