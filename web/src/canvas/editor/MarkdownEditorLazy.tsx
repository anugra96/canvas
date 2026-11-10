import { lazy, Suspense } from 'react'

import type { MarkdownEditorProps } from './MarkdownEditor'

const LazyMarkdownEditor = lazy(() => import('./MarkdownEditor').then((module) => ({
  default: module.MarkdownEditor,
})))

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<div className="markdown-editor" aria-busy="true" />}>
      <LazyMarkdownEditor {...props} />
    </Suspense>
  )
}
