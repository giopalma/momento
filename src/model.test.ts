import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceSession,
  cycleRepeat,
  normalizePreferences,
  parseYouTubeUrl,
  remainingMs,
  switchMode,
} from './model.ts'

test('a completed fourth focus starts a long break and resets the cycle count', () => {
  assert.deepEqual(advanceSession('focus', 3, 4), {
    mode: 'long',
    completedFocuses: 0,
  })
})

test('leaving focus manually for either break advances the cycle once', () => {
  assert.deepEqual(switchMode('focus', 'short', 1, 4), {
    mode: 'short',
    completedFocuses: 2,
  })
  assert.deepEqual(switchMode('focus', 'long', 3, 4), {
    mode: 'long',
    completedFocuses: 0,
  })
  assert.deepEqual(switchMode('short', 'long', 2, 4), {
    mode: 'long',
    completedFocuses: 2,
  })
})

test('remaining time is derived from the deadline and never becomes negative', () => {
  assert.equal(remainingMs(110_000, 50_000), 60_000)
  assert.equal(remainingMs(49_000, 50_000), 0)
})

test('YouTube video and playlist URLs are parsed without accepting lookalike hosts', () => {
  assert.deepEqual(
    parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123'),
    { videoId: 'dQw4w9WgXcQ', playlistId: 'PL123' },
  )
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), {
    videoId: 'dQw4w9WgXcQ',
  })
  assert.equal(parseYouTubeUrl('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), null)
})

test('the repeat button cycles off, queue, track, then off', () => {
  assert.equal(cycleRepeat('off'), 'queue')
  assert.equal(cycleRepeat('queue'), 'track')
  assert.equal(cycleRepeat('track'), 'off')
})

test('stored preferences are validated field by field', () => {
  assert.deepEqual(
    normalizePreferences({
      focusMinutes: 0,
      shortMinutes: 8,
      focusTarget: 10,
      volume: 2,
      muted: true,
      reducedMotion: true,
    }),
    {
      focusMinutes: 25,
      shortMinutes: 8,
      longMinutes: 15,
      focusTarget: 4,
      autoBreaks: false,
      autoFocus: false,
      volume: 0.55,
      muted: true,
      alertVolume: 0.7,
      reducedMotion: true,
      notificationAttempted: false,
      lastSource: 'local',
    },
  )
})
