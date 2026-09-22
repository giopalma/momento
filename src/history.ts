export type HistoryEntry = { key: string; title: string } & (
  | { kind: 'local'; file: Blob }
  | { kind: 'youtube'; videoId?: string; playlistId?: string }
)

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  if (typeof entry.key !== 'string' || typeof entry.title !== 'string') return false
  if (entry.kind === 'local') return entry.file instanceof Blob
  const validId = (id: unknown) => typeof id === 'string' && /^[\w-]+$/.test(id)
  return entry.kind === 'youtube'
    && (validId(entry.videoId) || validId(entry.playlistId))
    && (entry.videoId === undefined || validId(entry.videoId))
    && (entry.playlistId === undefined || validId(entry.playlistId))
}

export function mergeHistory(stored: unknown, additions: HistoryEntry[]) {
  const entries = [...additions, ...(Array.isArray(stored) ? stored : [])].filter(isEntry)
  return entries.filter((entry, index) => entries.findIndex((other) => other.key === entry.key) === index).slice(0, 5)
}

// One transaction keeps concurrent imports from overwriting each other.
export function accessHistory(additions?: HistoryEntry[]): Promise<HistoryEntry[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('momento-history', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('history')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('history', additions ? 'readwrite' : 'readonly')
      const store = transaction.objectStore('history')
      const read = store.get('recent')
      let entries: HistoryEntry[] = []
      read.onsuccess = () => {
        entries = mergeHistory(read.result, additions ?? [])
        if (additions) store.put(entries, 'recent')
      }
      transaction.oncomplete = () => { db.close(); resolve(entries) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  })
}
