export type Mode = 'focus' | 'short' | 'long'
export type RepeatMode = 'off' | 'queue' | 'track'
export type MusicSource = 'local' | 'youtube'

export interface Preferences {
  focusMinutes: number
  shortMinutes: number
  longMinutes: number
  focusTarget: number
  autoBreaks: boolean
  autoFocus: boolean
  volume: number
  maxVolume: number
  muted: boolean
  alertVolume: number
  reducedMotion: boolean
  notificationAttempted: boolean
  lastSource: MusicSource
}

export const defaultPreferences: Preferences = {
  focusMinutes: 25,
  shortMinutes: 5,
  longMinutes: 15,
  focusTarget: 4,
  autoBreaks: false,
  autoFocus: false,
  volume: 0.55,
  maxVolume: 0.7,
  muted: false,
  alertVolume: 0.7,
  reducedMotion: false,
  notificationAttempted: false,
  lastSource: 'local',
}

/** General volume ceiling for the bell: half of the full level. */
export const BELL_GENERAL_CEILING = 0.5

/**
 * Music volume (0–1) after the general volume and mute are applied. It stays linear and uncapped: YouTube only
 * takes whole levels, so a loudness curve or a ceiling left whole stretches of a slider on the same level.
 * Lower the system or browser volume instead when full volume is too loud.
 */
export const musicVolume = (preferences: Preferences, factor = 1) =>
  preferences.muted ? 0 : preferences.volume * preferences.maxVolume * factor

/** YouTube's integer 0–100 volume; an audible volume never rounds down to 0. */
export const youtubeVolume = (volume: number) =>
  volume === 0 ? 0 : Math.max(1, Math.round(volume * 100))

/** True when the music must be hard-muted: mute is on, or the music or general slider is all the way left. */
export const musicSilenced = (preferences: Preferences) => musicVolume(preferences) === 0

/** Peak bell gain: the general volume scales the bell too, like a master control. */
export const bellGain = (preferences: Preferences) =>
  preferences.alertVolume * preferences.maxVolume * BELL_GENERAL_CEILING * 0.22

export interface SessionChange {
  mode: Mode
  completedFocuses: number
}

export function advanceSession(
  mode: Mode,
  completedFocuses: number,
  focusTarget: number,
): SessionChange {
  if (mode !== 'focus') return { mode: 'focus', completedFocuses }

  const nextCount = completedFocuses + 1
  return nextCount >= focusTarget
    ? { mode: 'long', completedFocuses: 0 }
    : { mode: 'short', completedFocuses: nextCount }
}

export function switchMode(
  current: Mode,
  target: Mode,
  completedFocuses: number,
  focusTarget: number,
): SessionChange {
  if (current === target) return { mode: current, completedFocuses }
  if (current !== 'focus' || target === 'focus') {
    return { mode: target, completedFocuses }
  }

  return {
    mode: target,
    completedFocuses: (completedFocuses + 1) % focusTarget,
  }
}

export const remainingMs = (deadline: number, now = Date.now()) =>
  Math.max(0, deadline - now)

export function parseYouTubeUrl(value: string) {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.replace(/^www\./, '')
    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtu.be') {
      return null
    }

    const videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
    const playlistId = url.searchParams.get('list') ?? undefined

    if (!videoId && !playlistId) return null
    return {
      ...(videoId ? { videoId } : {}),
      ...(playlistId ? { playlistId } : {}),
    }
  } catch {
    return null
  }
}

export const cycleRepeat = (mode: RepeatMode): RepeatMode =>
  mode === 'off' ? 'queue' : mode === 'queue' ? 'track' : 'off'

export function normalizePreferences(value: unknown): Preferences {
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const number = (key: string, fallback: number, min: number, max: number) => {
    const candidate = input[key]
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= min && candidate <= max
      ? candidate
      : fallback
  }
  const boolean = (key: string, fallback: boolean) =>
    typeof input[key] === 'boolean' ? input[key] : fallback
  
  return {
    focusMinutes: number('focusMinutes', 25, 1, 120),
    shortMinutes: number('shortMinutes', 5, 1, 60),
    longMinutes: number('longMinutes', 15, 1, 90),
    focusTarget: number('focusTarget', 4, 1, 8),
    autoBreaks: boolean('autoBreaks', false),
    autoFocus: boolean('autoFocus', false),
    volume: number('volume', 0.55, 0, 1),
    maxVolume: number('maxVolume', 0.7, 0, 1),
    muted: boolean('muted', false),
    alertVolume: number('alertVolume', 0.7, 0, 1),
    reducedMotion: boolean('reducedMotion', false),
    notificationAttempted: boolean('notificationAttempted', false),
    lastSource: input.lastSource === 'youtube' ? 'youtube' : 'local',
  }
}
