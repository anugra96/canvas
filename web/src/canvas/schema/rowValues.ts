import type { SchemaColumn } from '@canvas/contract'

export function valueAt(row: unknown, path: string[]): unknown {
  if (path.length === 0) return row
  let current: unknown = row
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function assignAt(target: Record<string, unknown>, segments: string[], value: unknown): void {
  const [segment, ...rest] = segments
  if (!segment) return
  if (rest.length === 0) {
    if (value === undefined) delete target[segment]
    else target[segment] = value
    return
  }
  if (value === undefined && !(segment in target)) return
  const child = target[segment]
  const next = child && typeof child === 'object' && !Array.isArray(child)
    ? child as Record<string, unknown>
    : {}
  assignAt(next, rest, value)
  if (Object.keys(next).length === 0) delete target[segment]
  else target[segment] = next
}

export function setAt(row: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value
  const copy = row && typeof row === 'object' && !Array.isArray(row)
    ? structuredClone(row) as Record<string, unknown>
    : {}
  assignAt(copy, path, value)
  return copy
}

export function emptyRow(columns: SchemaColumn[]): unknown {
  return columns.length === 1 && columns[0]?.key === 'value' ? '' : {}
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function localParts(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function dateTimeInputValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return localParts(date)
}

export function rfc3339FromLocalDateTime(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text)
  if (!match) return text
  const [, year, month, day, hour, minute, second = '00', milliseconds] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds ? Number(milliseconds.padEnd(3, '0')) : 0,
  )
  if (Number.isNaN(date.getTime())) return text
  const offset = -date.getTimezoneOffset()
  const sign = offset === 0 ? 'Z' : offset > 0 ? '+' : '-'
  const absolute = Math.abs(offset)
  const suffix = offset === 0 ? '' : `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`
}
