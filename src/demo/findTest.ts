import type { NativeFind } from '../scrollport/core'

let builds = 0

/** For tests and tools: the audit and the state of the core, on `window.findTest`. */
export function publishFindTest(find: NativeFind | null, rowCount: number) {
  const w = window as unknown as { findTest?: unknown }
  if (find) builds++
  w.findTest = find
    ? {
        check: find.audit,
        get layerQuery() {
          return find.query
        },
        get mode() {
          return find.mode
        },
        get attachedChunks() {
          return find.attachedChunks
        },
        chunks: find.chunkCount,
        textLength: find.textLength,
        buildMs: find.buildMs,
        // Number of index builds since the page loaded (a sort or a filter builds the index again).
        builds,
        // Names that the proof rig of the old test page reads.
        get prefix() {
          return find.query
        },
        layerComplete: true,
        get layerRows() {
          return find.mode === 'full' ? rowCount : find.attachedChunks * 100
        },
        sentinels: 0,
      }
    : undefined
}
