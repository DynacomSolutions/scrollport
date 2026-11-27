import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountScrollportNativeFind } from './embed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounts: Array<{ host: HTMLElement; dispose: () => void }> = []
const styleLinks = (href: string) => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')].filter((link) => link.href === href)

function mount(href: string) {
  const host = document.body.appendChild(document.createElement('div'))
  let dispose!: () => void
  act(() => {
    dispose = mountScrollportNativeFind(host, {
      includeGrid: false,
      includeTable: false,
      stylesheets: [href],
    })
  })
  mounts.push({ host, dispose })
  return dispose
}

afterEach(() => {
  for (const mount of mounts.splice(0)) {
    act(() => mount.dispose())
    mount.host.remove()
  }
  document.querySelectorAll('link[data-scrollport-embed-style]').forEach((link) => link.remove())
  vi.unstubAllGlobals()
})

describe('Scrollport embed stylesheet ownership', () => {
  it('keeps the stylesheet until the final A-then-B mount unmounts', () => {
    const href = new URL('/scrollport-a-b.css', document.baseURI).href
    const disposeA = mount(href)
    const disposeB = mount(href)

    act(() => disposeA())
    expect(styleLinks(href)).toHaveLength(1)
    act(() => disposeA())
    expect(styleLinks(href)).toHaveLength(1)

    act(() => disposeB())
    expect(styleLinks(href)).toHaveLength(0)
  })

  it('keeps the stylesheet until the final B-then-A mount unmounts', () => {
    const href = new URL('/scrollport-b-a.css', document.baseURI).href
    const disposeA = mount(href)
    const disposeB = mount(href)

    act(() => disposeB())
    expect(styleLinks(href)).toHaveLength(1)
    act(() => disposeA())
    expect(styleLinks(href)).toHaveLength(0)
  })

  it('preserves a matching stylesheet owned by the host page', () => {
    const href = new URL('/scrollport-host.css', document.baseURI).href
    const hostLink = document.head.appendChild(document.createElement('link'))
    hostLink.rel = 'stylesheet'
    hostLink.href = href

    const dispose = mount(href)
    expect(styleLinks(href)).toHaveLength(1)
    act(() => dispose())
    expect(styleLinks(href)).toHaveLength(1)
    expect(styleLinks(href)[0]).toBe(hostLink)
    hostLink.remove()
  })
})
