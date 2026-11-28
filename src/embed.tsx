import { createRoot } from 'react-dom/client'
import NativeFindTableDemo from './App'
import NativeFindDemo from './demo/NativeFindDemo'

export type NativeFindEmbedOptions = {
  gridRows?: number
  tableRows?: number
  includeGrid?: boolean
  includeTable?: boolean
  nativeFind?: boolean
  tableDisplayMode?: 'table' | 'card' | 'auto'
  stylesheets?: readonly string[]
}

type OwnedStylesheet = {
  link: HTMLLinkElement
  refCount: number
}

const ownedStylesheets = new WeakMap<Document, Map<string, OwnedStylesheet>>()

function acquireStylesheets(doc: Document, hrefs: readonly string[] = []) {
  const entries = ownedStylesheets.get(doc) ?? new Map<string, OwnedStylesheet>()
  if (!ownedStylesheets.has(doc)) ownedStylesheets.set(doc, entries)

  const acquired: OwnedStylesheet[] = []
  for (const href of hrefs) {
    const absoluteHref = new URL(href, doc.baseURI).href
    const existing = entries.get(absoluteHref)
    if (existing) {
      existing.refCount += 1
      acquired.push(existing)
      continue
    }

    const hostOwned = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'))
      .some((link) => link.href === absoluteHref)
    if (hostOwned) continue

    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = absoluteHref
    link.dataset.scrollportEmbedStyle = absoluteHref
    doc.head.append(link)

    const entry = { link, refCount: 1 }
    entries.set(absoluteHref, entry)
    acquired.push(entry)
  }

  let released = false
  return () => {
    if (released) return
    released = true

    for (const entry of acquired) {
      entry.refCount -= 1
      if (entry.refCount === 0) {
        entry.link.remove()
        entries.delete(entry.link.href)
        if (entries.size === 0) ownedStylesheets.delete(doc)
      }
    }
  }
}

function NativeFindEmbed({
  gridRows = 100_000,
  tableRows = 10_000,
  includeGrid = true,
  includeTable = true,
  nativeFind = true,
  tableDisplayMode = 'table',
}: NativeFindEmbedOptions) {
  return (
    <>
      {includeGrid ? <NativeFindDemo rowCount={gridRows} /> : null}
      {includeTable ? <NativeFindTableDemo rowCount={tableRows} nativeFind={nativeFind} tableDisplayMode={tableDisplayMode} /> : null}
    </>
  )
}

/** Mount the real Scrollport cell text in the host document. */
export function mountScrollportNativeFind(target: HTMLElement, options: NativeFindEmbedOptions = {}) {
  const root = createRoot(target)
  const releaseStylesheets = acquireStylesheets(target.ownerDocument, options.stylesheets)
  root.render(<NativeFindEmbed {...options} />)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    try {
      root.unmount()
    } finally {
      releaseStylesheets()
    }
  }
}

if (typeof window !== 'undefined') {
  Object.assign(window, { mountScrollportNativeFind })
}
