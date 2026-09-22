import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeHistory, type HistoryEntry } from './history.ts'

test('history keeps five unique recent imports, preserves local audio and rejects invalid data', () => {
  const entries: HistoryEntry[] = Array.from({ length: 6 }, (_, index) => ({
    key: `youtube-${index}`, kind: 'youtube', title: `Video ${index}`, videoId: `video-${index}`,
  }))
  const stored = mergeHistory([], entries)
  assert.equal(stored.length, 5)
  const renamed = { ...entries[3], title: 'Resolved title' }
  const recent = mergeHistory(stored, [renamed])
  assert.deepEqual(recent[0], renamed)
  assert.equal(recent.filter((entry) => entry.key === renamed.key).length, 1)
  const local: HistoryEntry = { key: 'local-song', kind: 'local', title: 'Song', file: new Blob(['audio']) }
  assert.deepEqual(mergeHistory(recent, [local])[0], local)
  assert.deepEqual(mergeHistory([null, { key: 'bad', title: 'Bad', kind: 'youtube', videoId: '<bad>' }], []), [])
  assert.deepEqual(mergeHistory(null, []), [])
})
