import { useEffect, useRef, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, Settings, X } from 'lucide-preact'
import {
  advanceSession,
  cycleRepeat,
  defaultPreferences,
  normalizePreferences,
  parseYouTubeUrl,
  remainingMs,
  switchMode,
  type Mode,
  type MusicSource,
  type Preferences,
  type RepeatMode,
} from './model.ts'
import { closedSplinePath, createRadialBlobPoints, createRectBlobPoints } from './blob.ts'
import { accessHistory, type HistoryEntry } from './history.ts'
import { addTask, normalizeTasks, removeTask, type Task } from './tasks.ts'
import './app.css'

interface LocalTrack {
  kind: 'local'
  id: string
  title: string
  url: string
}

interface YouTubeTrack {
  kind: 'youtube'
  id: string
  title: string
  videoId?: string
  playlistId?: string
}

type Track = LocalTrack | YouTubeTrack

interface YouTubePlayer {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title?: string }
  mute(): void
  nextVideo(): void
  pauseVideo(): void
  playVideo(): void
  previousVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setLoop(loop: boolean): void
  setShuffle(shuffle: boolean): void
  setVolume(volume: number): void
  unMute(): void
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: {
    height?: string
    width?: string
    videoId?: string
    playerVars: Record<string, string | number>
    events: {
      onReady(event: { target: YouTubePlayer }): void
      onStateChange(event: { data: number; target: YouTubePlayer }): void
      onError(): void
    }
  }) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const STORAGE_KEY = 'momento-preferences'
const TASKS_KEY = 'momento-tasks'
const TASK_EXIT_MS = 1100
const modeLabels: Record<Mode, string> = {
  focus: 'Focus',
  short: 'Pausa breve',
  long: 'Pausa lunga',
}
const modeDurations: Record<Mode, keyof Pick<Preferences, 'focusMinutes' | 'shortMinutes' | 'longMinutes'>> = {
  focus: 'focusMinutes',
  short: 'shortMinutes',
  long: 'longMinutes',
}
let youtubeApiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi() {
  if (window.YT) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-api]')
    const script = existing ?? document.createElement('script')
    window.onYouTubeIframeAPIReady = () => window.YT && resolve(window.YT)
    script.onerror = () => reject(new Error('YouTube non è raggiungibile.'))
    if (!existing) {
      script.src = 'https://www.youtube.com/iframe_api'
      script.dataset.youtubeApi = 'true'
      document.head.append(script)
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = null
    throw error
  })
  return youtubeApiPromise
}

function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const preferences = normalizePreferences(JSON.parse(stored ?? 'null'))
    return stored === null && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? { ...preferences, reducedMotion: true }
      : preferences
  } catch {
    return defaultPreferences
  }
}

function loadTasks() {
  try {
    return normalizeTasks(JSON.parse(localStorage.getItem(TASKS_KEY) ?? 'null'))
  } catch {
    return []
  }
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}

const sessionMs = (mode: Mode, preferences: Preferences) =>
  preferences[modeDurations[mode]] * 60_000

type OrganicVariant = 'timer-panel' | 'music-panel' | 'settings-panel' | 'source' | 'input' | 'flower'

const organicConfig: Record<Exclude<OrganicVariant, 'flower'>, [number, number, number]> = {
  'timer-panel': [600, 720, 22],
  'music-panel': [600, 600, 22],
  'settings-panel': [600, 720, 20],
  source: [320, 180, 8],
  input: [260, 50, 4],
}

function OrganicFrame({ variant, animate = true }: { variant: OrganicVariant; animate?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null)
  const seedRef = useRef(Math.random())
  const dimensions = variant === 'flower' ? [200, 200] : organicConfig[variant]
  const makePath = (time: number) => variant === 'flower'
    ? closedSplinePath(createRadialBlobPoints(200, 200, 68, 18, 10, seedRef.current, time))
    : closedSplinePath(createRectBlobPoints(...organicConfig[variant], seedRef.current, time))
  const initialPath = useRef(makePath(0))

  useEffect(() => {
    if (!animate) return
    let frame = 0
    let previous = 0
    const started = performance.now()
    const tick = (timestamp: number) => {
      if (timestamp - previous >= 40) {
        pathRef.current?.setAttribute('d', makePath((timestamp - started) / 1000))
        previous = timestamp
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, variant])

  return (
    <svg class={`organic-frame organic-${variant}`} viewBox={`0 0 ${dimensions[0]} ${dimensions[1]}`} preserveAspectRatio="none" aria-hidden="true">
      <path ref={pathRef} d={initialPath.current} vectorEffect="non-scaling-stroke" />
      {variant === 'flower' && <path class="flower-core" d="M100 66 C123 63 140 80 135 102 C142 125 119 141 98 134 C75 140 59 119 66 99 C60 77 79 62 100 66 Z" />}
    </svg>
  )
}

function TimerGraphic({ progress, animate }: { progress: number; animate: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const seedRef = useRef(Math.random())
  const makePath = (time: number) => closedSplinePath(createRectBlobPoints(200, 200, 18, seedRef.current, time, .105))
  const initialPath = useRef(makePath(0))

  useEffect(() => {
    if (!animate) return
    let frame = 0
    let previous = 0
    const started = performance.now()
    const tick = (timestamp: number) => {
      if (timestamp - previous >= 40) {
        const path = makePath((timestamp - started) / 1000)
        svgRef.current?.querySelectorAll('path').forEach((node) => node.setAttribute('d', path))
        previous = timestamp
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate])

  return (
    <svg ref={svgRef} class="progress-ring" viewBox="0 0 200 200" aria-hidden="true">
      <path class="timer-blob" d={initialPath.current} />
      <path class="ring-track" pathLength="100" d={initialPath.current} />
      <path class="ring-value" pathLength="100" style={{ strokeDashoffset: 100 * (1 - progress) }} d={initialPath.current} />
    </svg>
  )
}

// A slightly tilted, wobbly line that reads as a hand-drawn pencil mark.
function pencilPath(seed: string, from: number, to: number, baseline: number, tilt: number) {
  let state = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32 - .5
  }
  const points = Array.from({ length: 8 }, (_, index) => {
    const x = from + (to - from) * index / 7
    return [x, baseline + tilt * (x - 50) / 50 + random() * 1.6]
  })
  return points.reduce((path, [x, y], index) => {
    if (index === 0) return `M${x} ${y}`
    const [px, py] = points[index - 1]
    return `${path} Q${px} ${py} ${(px + x) / 2} ${(py + y) / 2}`
  }, '') + ` L${points[7][0]} ${points[7][1]}`
}

function TaskItem({ task, completing, onComplete }: { task: Task; completing: boolean; onComplete: () => void }) {
  const first = pencilPath(task.id, -3, 103, 6.5, -1.2)
  return (
    <li class={`task-item ${completing ? 'completing' : ''}`}>
      <button type="button" class="task-strike" onClick={onComplete} disabled={completing} aria-label={`Segna come completata: ${task.text}`} title={task.text}>
        <i class="task-bullet" aria-hidden="true"></i>
        <span class="task-text">
          {task.text}
          <svg class="pencil-stroke" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
            <path class="pencil-preview" pathLength="1" d={first} />
            <g filter="url(#pencil-grain)">
              <path class="pencil-pass" pathLength="1" d={first} />
              <path class="pencil-pass pencil-return" pathLength="1" d={pencilPath(`${task.id}~`, 101, 6, 7.4, .9)} />
            </g>
          </svg>
        </span>
      </button>
    </li>
  )
}

export function App() {
  const [preferences, setPreferences] = useState(loadPreferences)
  const [mode, setMode] = useState<Mode>('focus')
  const [completedFocuses, setCompletedFocuses] = useState(0)
  const [sessionDuration, setSessionDuration] = useState(() => sessionMs('focus', preferences))
  const [timeLeft, setTimeLeft] = useState(sessionDuration)
  const [running, setRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [queue, setQueue] = useState<Track[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyError, setHistoryError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [trackDuration, setTrackDuration] = useState(0)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [shuffle, setShuffle] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeRetry, setYoutubeRetry] = useState(0)
  const [playerError, setPlayerError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [panelTab, setPanelTab] = useState<'tasks' | 'music'>('tasks')
  const [tasks, setTasks] = useState(loadTasks)
  const [taskDraft, setTaskDraft] = useState('')
  const [completingTasks, setCompletingTasks] = useState<string[]>([])
  const deadlineRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const youtubeHostRef = useRef<HTMLDivElement>(null)
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null)
  const settingsRef = useRef<HTMLDialogElement>(null)
  const playingRef = useRef(playing)
  const queueRef = useRef(queue)
  const timerCompletingRef = useRef(false)
  const advanceRef = useRef<(direction: 1 | -1, ended?: boolean) => void>(() => undefined)
  const currentTrack = queue[currentIndex]
  const source: MusicSource | null = currentTrack?.kind ?? null
  const animateShapes = !preferences.reducedMotion

  useEffect(() => {
    void accessHistory().then(setHistory).catch(() => setHistoryError('Lo storico non è disponibile in questo browser.'))
  }, [])

  const remember = (entries: HistoryEntry[]) => {
    void accessHistory(entries).then((recent) => {
      setHistory(recent)
      setHistoryError('')
    }).catch(() => setHistoryError('Impossibile salvare lo storico. Lo spazio del browser potrebbe essere esaurito; la coda resta disponibile.'))
  }

  const youtubeHistoryEntry = (track: YouTubeTrack): HistoryEntry => ({
    kind: 'youtube', key: `youtube:${track.playlistId ?? ''}:${track.videoId ?? ''}`,
    title: track.title, videoId: track.videoId, playlistId: track.playlistId,
  })

  playingRef.current = playing
  queueRef.current = queue

  const updatePreferences = (patch: Partial<Preferences>) => {
    setPreferences((current) => normalizePreferences({ ...current, ...patch }))
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  }, [preferences])

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
    } catch {
      // Tasks stay available for this visit even when storage is full or blocked.
    }
  }, [tasks])

  const submitTask = () => {
    setTasks((current) => addTask(current, taskDraft, `${Date.now()}-${Math.random().toString(36).slice(2)}`))
    setTaskDraft('')
  }

  const completeTask = (id: string) => {
    if (completingTasks.includes(id)) return
    setCompletingTasks((current) => [...current, id])
    window.setTimeout(() => {
      setTasks((current) => removeTask(current, id))
      setCompletingTasks((current) => current.filter((item) => item !== id))
    }, TASK_EXIT_MS)
  }

  useEffect(() => {
    const dialog = settingsRef.current
    if (!dialog) return
    if (settingsOpen && !dialog.open) dialog.showModal()
    if (!settingsOpen && dialog.open) dialog.close()
  }, [settingsOpen])

  useEffect(() => {
    document.title = `${formatTime(timeLeft / 1000)} · ${modeLabels[mode]} · Momento`
  }, [mode, timeLeft])

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    return audioContextRef.current
  }

  const setMusicVolume = (factor = 1) => {
    const volume = preferences.muted ? 0 : preferences.volume * factor * preferences.maxVolume
    if (audioRef.current) audioRef.current.volume = volume
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume * 100)
      if (preferences.muted) youtubePlayerRef.current.mute()
      else youtubePlayerRef.current.unMute()
    }
  }

  useEffect(() => setMusicVolume(), [preferences.volume, preferences.muted])

  const ringBell = () => {
    const context = getAudioContext()
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, preferences.alertVolume * 0.22), now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35)
    gain.connect(context.destination)
    ;[660, 990].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.detune.setValueAtTime(index * 4, now)
      oscillator.connect(gain)
      oscillator.start(now)
      oscillator.stop(now + 1.4)
    })
    setMusicVolume(0.24)
    window.setTimeout(() => setMusicVolume(), 1400)
  }

  const showCompletionNotification = (finishedMode: Mode) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const body = finishedMode === 'focus'
      ? 'Hai concluso il Focus. È il momento di respirare.'
      : 'La pausa è finita. Torna al tuo ritmo.'
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then((registration) =>
        registration.showNotification('Momento', { body, icon: '/app-icon.svg', tag: 'momento-session' }),
      )
    } else {
      new Notification('Momento', { body, icon: '/app-icon.svg', tag: 'momento-session' })
    }
  }

  const finishSession = () => {
    ringBell()
    showCompletionNotification(mode)
    const next = advanceSession(mode, completedFocuses, preferences.focusTarget)
    const nextDuration = sessionMs(next.mode, preferences)
    const autoStart = next.mode === 'focus' ? preferences.autoFocus : preferences.autoBreaks
    setMode(next.mode)
    setCompletedFocuses(next.completedFocuses)
    setSessionDuration(nextDuration)
    setTimeLeft(nextDuration)
    setRunning(autoStart)
    if (autoStart) {
      deadlineRef.current = Date.now() + nextDuration
      timerCompletingRef.current = false
    }
  }

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const next = remainingMs(deadlineRef.current)
      setTimeLeft(next)
      if (next === 0 && !timerCompletingRef.current) {
        timerCompletingRef.current = true
        finishSession()
      }
    }
    tick()
    const interval = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running, mode, completedFocuses, preferences])

  const requestNotifications = () => {
    if (preferences.notificationAttempted) return
    updatePreferences({ notificationAttempted: true })
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }

  const toggleTimer = () => {
    if (running) {
      setTimeLeft(remainingMs(deadlineRef.current))
      setRunning(false)
      return
    }
    const context = getAudioContext()
    void context.resume()
    requestNotifications()
    timerCompletingRef.current = false
    deadlineRef.current = Date.now() + timeLeft
    setRunning(true)
  }

  const resetTimer = () => {
    const duration = sessionMs(mode, preferences)
    setRunning(false)
    timerCompletingRef.current = false
    setSessionDuration(duration)
    setTimeLeft(duration)
  }

  const selectMode = (target: Mode) => {
    const next = switchMode(mode, target, completedFocuses, preferences.focusTarget)
    if (next.mode === mode) return
    const duration = sessionMs(next.mode, preferences)
    setRunning(false)
    timerCompletingRef.current = false
    setMode(next.mode)
    setCompletedFocuses(next.completedFocuses)
    setSessionDuration(duration)
    setTimeLeft(duration)
  }

  const togglePlayback = () => {
    if (!currentTrack) return
    if (currentTrack.kind === 'local' && audioRef.current) {
      if (playing) audioRef.current.pause()
      else void audioRef.current.play().catch(() => setPlayerError('Il browser ha bloccato la riproduzione. Riprova.'))
    } else if (youtubePlayerRef.current) {
      if (playing) youtubePlayerRef.current.pauseVideo()
      else youtubePlayerRef.current.playVideo()
    }
    setPlaying(!playing)
  }

  const seekTrack = (seconds: number) => {
    if (!currentTrack) return
    if (currentTrack.kind === 'local' && audioRef.current) audioRef.current.currentTime = seconds
    else youtubePlayerRef.current?.seekTo(seconds, true)
    setCurrentTime(seconds)
  }

  const advanceTrack = (direction: 1 | -1, ended = false) => {
    if (!currentTrack) return
    if (currentTrack.kind === 'youtube' && currentTrack.playlistId) {
      if (direction === 1) youtubePlayerRef.current?.nextVideo()
      else youtubePlayerRef.current?.previousVideo()
      return
    }
    if (ended && repeat === 'track') {
      seekTrack(0)
      if (currentTrack.kind === 'local') void audioRef.current?.play()
      else youtubePlayerRef.current?.playVideo()
      return
    }
    if (queue.length < 2) {
      if (ended && repeat === 'off') setPlaying(false)
      else {
        seekTrack(0)
        if (currentTrack.kind === 'local') void audioRef.current?.play()
        else youtubePlayerRef.current?.playVideo()
      }
      return
    }

    let next = currentIndex + direction
    if (shuffle) {
      next = Math.floor(Math.random() * (queue.length - 1))
      if (next >= currentIndex) next += 1
    } else if (next < 0 || next >= queue.length) {
      if (repeat === 'queue') next = next < 0 ? queue.length - 1 : 0
      else {
        if (ended) setPlaying(false)
        return
      }
    }
    setCurrentIndex(next)
    setCurrentTime(0)
  }

  advanceRef.current = advanceTrack

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (currentTrack?.kind !== 'local') {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }
    setPlayerReady(false)
    audio.src = currentTrack.url
    audio.load()
    if (playingRef.current) void audio.play()
  }, [currentTrack?.id])

  useEffect(() => {
    if (currentTrack?.kind !== 'youtube' || !youtubeHostRef.current) {
      youtubePlayerRef.current?.destroy()
      youtubePlayerRef.current = null
      return
    }
    let cancelled = false
    let readyTimeout = 0
    setPlayerReady(false)
    setPlayerError('')
    void loadYouTubeApi().then((api) => {
      if (cancelled || !youtubeHostRef.current) return
      youtubePlayerRef.current?.destroy()
      youtubeHostRef.current.replaceChildren()
      const playerVars: Record<string, string | number> = { playsinline: 1, controls: 0, rel: 0 }
      if (currentTrack.playlistId) {
        playerVars.listType = 'playlist'
        playerVars.list = currentTrack.playlistId
      }
      const mount = document.createElement('div')
      youtubeHostRef.current.append(mount)
      youtubePlayerRef.current = new api.Player(mount, {
        height: '200',
        width: '100%',
        videoId: currentTrack.videoId,
        playerVars,
        events: {
          onReady: ({ target }) => {
            window.clearTimeout(readyTimeout)
            setPlayerReady(true)
            setTrackDuration(target.getDuration())
            setMusicVolume()
            const title = target.getVideoData().title
            if (title) {
              setQueue((current) => current.map((track) => track.id === currentTrack.id ? { ...track, title } : track))
              remember([youtubeHistoryEntry({ ...currentTrack, title })])
            }
            if (playingRef.current) target.playVideo()
          },
          onStateChange: ({ data }) => {
            if (data === 1) setPlaying(true)
            if (data === 2) setPlaying(false)
            if (data === 0) advanceRef.current(1, true)
          },
          onError: () => {
            window.clearTimeout(readyTimeout)
            setPlayerError('Questo contenuto YouTube non può essere riprodotto qui.')
          },
        },
      })
      readyTimeout = window.setTimeout(() => {
        if (!cancelled) setPlayerError('Il player YouTube non ha risposto. Controlla la connessione e riprova.')
      }, 10_000)
    }).catch(() => setPlayerError('YouTube non è raggiungibile. Controlla la connessione e riprova.'))
    return () => {
      cancelled = true
      window.clearTimeout(readyTimeout)
      youtubePlayerRef.current?.destroy()
      youtubePlayerRef.current = null
    }
  }, [currentTrack?.id, youtubeRetry])

  useEffect(() => {
    youtubePlayerRef.current?.setLoop(repeat === 'queue')
    youtubePlayerRef.current?.setShuffle(shuffle)
  }, [repeat, shuffle])

  useEffect(() => {
    if (!playing || currentTrack?.kind !== 'youtube') return
    const interval = window.setInterval(() => {
      const player = youtubePlayerRef.current
      if (!player) return
      setCurrentTime(player.getCurrentTime())
      setTrackDuration(player.getDuration())
    }, 500)
    return () => window.clearInterval(interval)
  }, [playing, currentTrack?.id])

  const addLocalFiles = (files: FileList | File[]) => {
    if (source && source !== 'local') return
    const accepted = Array.from(files).filter((file) => file.type.startsWith('audio/'))
    if (!accepted.length) {
      setPlayerError('Scegli almeno un file audio riproducibile.')
      return
    }
    const tracks: LocalTrack[] = accepted.map((file, index) => ({
      kind: 'local',
      id: `${file.name}-${file.lastModified}-${index}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
    }))
    setQueue((current) => [...current, ...tracks])
    updatePreferences({ lastSource: 'local' })
    setPlayerError('')
    remember(accepted.map((file) => ({
      kind: 'local', key: `local:${file.name}:${file.size}:${file.lastModified}`,
      title: file.name.replace(/\.[^.]+$/, ''), file,
    })))
  }

  const addYouTube = () => {
    if (source && source !== 'youtube') return
    const parsed = parseYouTubeUrl(youtubeUrl)
    if (!parsed) {
      setPlayerError('Incolla un URL YouTube valido.')
      return
    }
    const id = parsed.playlistId ?? parsed.videoId!
    const track: YouTubeTrack = {
      kind: 'youtube',
      id: `${id}-${Date.now()}`,
      title: `${parsed.playlistId ? 'Playlist YouTube' : 'Video YouTube'} · ${id}`,
      ...parsed,
    }
    if (parsed.playlistId) {
      if (queue.length && !window.confirm('Sostituire la coda YouTube con questa playlist?')) return
      setQueue([track])
      setCurrentIndex(0)
    } else {
      setQueue((current) => [...current, track])
    }
    updatePreferences({ lastSource: 'youtube' })
    setYoutubeUrl('')
    setPlayerError('')
    remember([youtubeHistoryEntry(track)])
  }

  const clearQueue = () => {
    setPlaying(false)
    queue.forEach((track) => {
      if (track.kind === 'local') URL.revokeObjectURL(track.url)
    })
    setQueue([])
    setCurrentIndex(0)
    setCurrentTime(0)
    setTrackDuration(0)
    setPlayerError('')
  }

  const openHistory = (entry: HistoryEntry) => {
    const id = `${entry.key}-${Date.now()}`
    const track: Track = entry.kind === 'local'
      ? { kind: 'local', id, title: entry.title, url: URL.createObjectURL(entry.file) }
      : { kind: 'youtube', id, title: entry.title, videoId: entry.videoId, playlistId: entry.playlistId }
    clearQueue()
    setPlayerReady(false)
    setQueue([track])
    updatePreferences({ lastSource: entry.kind })
    remember([entry])
  }

  useEffect(() => () => {
    queueRef.current.forEach((track) => {
      if (track.kind === 'local') URL.revokeObjectURL(track.url)
    })
  }, [])

  const repeatLabel = repeat === 'off' ? 'Ripetizione disattivata' : repeat === 'queue' ? 'Ripeti coda' : 'Ripeti traccia'
  const progress = sessionDuration ? 1 - timeLeft / sessionDuration : 0
  const localInput = (
    <label class={`drop-zone organic-small ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer?.files) addLocalFiles(event.dataTransfer.files) }}>
      <OrganicFrame variant="source" animate={animateShapes} />
      <input type="file" accept="audio/*" multiple onChange={(event) => addLocalFiles(event.currentTarget.files ?? [])} />
      <strong>{source === 'local' ? 'Aggiungi file' : 'Musica locale'}</strong>
      <small>{source === 'local' ? 'Scegli altre tracce' : 'Trascina qui o scegli dal dispositivo'}</small>
    </label>
  )

  const youtubeInput = (
    <form class="youtube-form organic-small" onSubmit={(event) => { event.preventDefault(); addYouTube() }}>
      <OrganicFrame variant="source" animate={animateShapes} />
      <strong>{source === 'youtube' ? 'Aggiungi video' : 'YouTube'}</strong>
      <div class="url-row">
        <div class="url-field">
          <OrganicFrame variant="input" animate={animateShapes} />
          <input type="url" value={youtubeUrl} onInput={(event) => setYoutubeUrl(event.currentTarget.value)} placeholder="Video o playlist" aria-label="URL YouTube" />
        </div>
        <button type="submit" class="mini-button" aria-label="Aggiungi URL YouTube"><Plus size={18} strokeWidth={2.6} /></button>
      </div>
    </form>
  )

  return (
    <div class={`app-shell mode-${mode} ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
      <div class="ambient" aria-hidden="true">
        <div class="ambient-flower flower-one"><OrganicFrame variant="flower" animate={animateShapes} /></div>
        <div class="ambient-flower flower-two"><OrganicFrame variant="flower" animate={animateShapes} /></div>
        <div class="ambient-shape shape-one"><OrganicFrame variant="source" animate={animateShapes} /></div>
        <div class="ambient-shape shape-two"><OrganicFrame variant="source" animate={animateShapes} /></div>
        <svg class="ambient-extra ambient-star" viewBox="0 0 100 100"><path d="M50 6 Q57 37 91 48 Q62 57 53 94 Q42 64 9 53 Q38 42 50 6Z" /></svg>
        <svg class="ambient-extra ambient-leaf" viewBox="0 0 100 100"><path d="M14 86 Q-4 16 87 12 Q104 91 14 86Z" /><path class="ambient-line" d="M17 83 Q38 50 74 26" /></svg>
        <svg class="ambient-extra ambient-pebble" viewBox="0 0 100 100"><path d="M13 35 C30 2 79 8 91 42 C110 80 64 101 29 87 C4 77 0 56 13 35Z" /></svg>
        <svg class="ambient-extra ambient-arch" viewBox="0 0 100 100"><path d="M12 88 L12 49 C12 -3 89 -3 89 49 L89 88 L66 88 L66 49 C66 25 36 25 36 49 L36 88Z" /></svg>
        <svg class="ambient-extra ambient-wave" viewBox="0 0 100 100"><path class="ambient-line" d="M8 25 C38 -5 25 66 53 37 S76 15 93 39 M8 53 C38 23 25 94 53 65 S76 43 93 67" /></svg>
      </div>

      <header class="topbar">
        <a class="wordmark" href="/" aria-label="Momento, pagina iniziale">momento<span>.</span></a>
        <p>Un piccolo spazio per fare una cosa alla volta.</p>
        <button class="icon-button settings-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="Apri impostazioni"><Settings size={19} strokeWidth={2.4} /></button>
      </header>

      <main>
        <section class="timer-panel organic-panel" aria-labelledby="timer-title">
          <OrganicFrame variant="timer-panel" animate={animateShapes} />
          <div class="mode-switch" role="group" aria-label="Modalità timer">
            <OrganicFrame variant="input" animate={animateShapes} />
            {(Object.keys(modeLabels) as Mode[]).map((item) => (
              <button key={item} type="button" class={mode === item ? 'active' : ''} onClick={() => selectMode(item)} aria-pressed={mode === item}>{modeLabels[item]}</button>
            ))}
          </div>

          <div class="timer-face">
            <TimerGraphic progress={progress} animate={animateShapes} />
            <div class="timer-copy">
              <span id="timer-title" class="eyebrow">{modeLabels[mode]}</span>
              <strong class="time" aria-live="off">{formatTime(Math.ceil(timeLeft / 1000))}</strong>
              <span class="cycle-copy">{mode === 'focus' ? `Focus ${completedFocuses + 1} di ${preferences.focusTarget}` : `${completedFocuses} Focus completati`}</span>
            </div>
          </div>

          <div class="timer-actions">
            <button class="round-button secondary" type="button" onClick={resetTimer} aria-label="Azzera sessione"><RotateCcw size={19} strokeWidth={2.5} /></button>
            <button class="round-button primary" type="button" onClick={toggleTimer} aria-label={running ? 'Metti in pausa il timer' : 'Avvia il timer'}>{running ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
          </div>

          <div class="cycle-row">
            <div class="cycle-dots" aria-label={`${completedFocuses} Focus completati su ${preferences.focusTarget}`}>
              {Array.from({ length: preferences.focusTarget }, (_, index) => <i key={index} class={index < completedFocuses ? 'done' : ''}></i>)}
            </div>
            {completedFocuses > 0 && <button type="button" class="cycle-reset" onClick={() => setCompletedFocuses(0)}>Azzera ciclo</button>}
          </div>
        </section>

        <section class="side-panel organic-panel" aria-label="Task e musica">
          <OrganicFrame variant="music-panel" animate={animateShapes} />
          <div class="mode-switch panel-tabs" role="tablist" aria-label="Contenuto del pannello">
            <OrganicFrame variant="input" animate={animateShapes} />
            {([['tasks', 'Task'], ['music', 'Musica']] as const).map(([tab, label]) => (
              <button key={tab} id={`tab-${tab}`} type="button" role="tab" class={panelTab === tab ? 'active' : ''} aria-selected={panelTab === tab} aria-controls={`panel-${tab}`} onClick={() => setPanelTab(tab)}>
                {label}{tab === 'tasks' && tasks.length > 0 && <span class="tab-count">{tasks.length}</span>}{tab === 'music' && playing && <span class="tab-live" aria-label="in riproduzione"></span>}
              </button>
            ))}
          </div>

          <div id="panel-tasks" class="tab-view task-view" role="tabpanel" aria-labelledby="tab-tasks" hidden={panelTab !== 'tasks'}>
            <div class="panel-heading">
              <div><span class="eyebrow">Una cosa alla volta</span><h2 id="tasks-title">Le tue task</h2></div>
            </div>
            <form class="task-form" onSubmit={(event) => { event.preventDefault(); submitTask() }}>
              <div class="url-field">
                <OrganicFrame variant="input" animate={animateShapes} />
                <input type="text" value={taskDraft} maxLength={140} onInput={(event) => setTaskDraft(event.currentTarget.value)} placeholder="Cosa vuoi fare?" aria-label="Nuova task" />
              </div>
              <button type="submit" class="mini-button" aria-label="Aggiungi task" disabled={!taskDraft.trim()}><Plus size={18} strokeWidth={2.6} /></button>
            </form>
            {tasks.length > 0
              ? <ul class="task-list" aria-labelledby="tasks-title">
                {tasks.map((task) => <TaskItem key={task.id} task={task} completing={completingTasks.includes(task.id)} onComplete={() => completeTask(task.id)} />)}
              </ul>
              : <p class="task-empty">Nessuna task per ora. Scrivine una e cancellala a matita quando hai finito.</p>}
          </div>

          <div id="panel-music" class="tab-view music-view" role="tabpanel" aria-labelledby="tab-music" hidden={panelTab !== 'music'}>
            <div class="panel-heading">
              <div><span class="eyebrow">Sottofondo</span><h2 id="music-title">La tua musica</h2></div>
              {queue.length > 0 && <button class="text-button" type="button" onClick={clearQueue}>Svuota coda</button>}
            </div>

            {!source && <div class={`empty-player ${preferences.lastSource === 'youtube' ? 'youtube-first' : ''}`}>
              {preferences.lastSource === 'youtube' ? <>{youtubeInput}{localInput}</> : <>{localInput}{youtubeInput}</>}
              {history.length > 0 && <section class="import-history" aria-label="Import recenti">
                <h3>Import recenti</h3>
                <div class="queue-list history-list">
                  {history.map((entry) => <button key={entry.key} type="button" class={`history-${entry.kind}`} onClick={() => openHistory(entry)}>
                    <span>{entry.kind === 'local' ? 'Locale' : 'YouTube'}</span><strong>{entry.title}</strong>
                  </button>)}
                </div>
              </section>}
            </div>}

            {historyError && <p class="error" role="alert">{historyError}</p>}

            {source && currentTrack && (
              <div class="active-player">
                {source === 'youtube' && <div class="youtube-stage" ref={youtubeHostRef} aria-label="Player YouTube"></div>}
                <div class="now-playing">
                  <div class="track-copy"><strong>{currentTrack.title}</strong><span>{currentTrack.kind === 'local' ? 'Dal tuo dispositivo' : currentTrack.playlistId ? 'Playlist YouTube' : 'Video YouTube'} · {currentIndex + 1}/{queue.length}</span></div>
                  {!playerReady && <span class="player-status">Caricamento…</span>}
                </div>

                <div class="player-controls">
                  <button type="button" onClick={() => advanceTrack(-1)} aria-label="Traccia precedente"><ChevronLeft size={23} strokeWidth={2.5} /></button>
                  <button class="player-play" type="button" onClick={togglePlayback} aria-label={playing ? 'Pausa' : 'Riproduci'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
                  <button type="button" onClick={() => advanceTrack(1)} aria-label="Traccia successiva"><ChevronRight size={23} strokeWidth={2.5} /></button>
                </div>

                <div class="seek-row"><span>{formatTime(currentTime)}</span><input type="range" min="0" max={Math.max(1, trackDuration)} step="0.1" value={currentTime} onInput={(event) => seekTrack(Number(event.currentTarget.value))} aria-label="Posizione nella traccia" /><span>{formatTime(trackDuration)}</span></div>

                <div class="player-options">
                  <button type="button" class={shuffle ? 'selected' : ''} onClick={() => setShuffle(!shuffle)} aria-pressed={shuffle}>Casuale</button>
                  <button type="button" class={repeat !== 'off' ? 'selected' : ''} onClick={() => setRepeat(cycleRepeat(repeat))} aria-label={repeatLabel}>{repeat === 'track' ? 'Ripeti 1' : repeat === 'queue' ? 'Ripeti ∞' : 'Ripeti'}</button>
                  <button type="button" onClick={() => updatePreferences({ muted: !preferences.muted })}>{preferences.muted ? 'Audio off' : 'Audio on'}</button>
                  <input type="range" min="0" max="1" step="0.01" value={preferences.volume} onInput={(event) => updatePreferences({ volume: Number(event.currentTarget.value) })} aria-label="Volume musica" />
                </div>

                {source === 'local' ? localInput : youtubeInput}
                <div class="queue-list" aria-label="Coda di ascolto">
                  {queue.map((track, index) => <button key={track.id} type="button" class={index === currentIndex ? 'current' : ''} onClick={() => { setCurrentIndex(index); setCurrentTime(0) }}><span>{index + 1}</span>{track.title}</button>)}
                </div>
              </div>
            )}

            {playerError && <p class="error" role="alert">{playerError}{source === 'youtube' && <button type="button" onClick={() => { setPlayerError(''); setYoutubeRetry((value) => value + 1) }}>Riprova</button>}</p>}
            <audio ref={audioRef} onLoadedMetadata={(event) => { setTrackDuration(event.currentTarget.duration || 0); setPlayerReady(true) }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => advanceTrack(1, true)} onError={() => setPlayerError('Questo file non può essere riprodotto dal browser.')} />
          </div>
        </section>
      </main>

      <svg class="svg-defs" aria-hidden="true" focusable="false">
        <filter id="pencil-grain" x="-5%" y="-60%" width="110%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1 .9" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -.45" result="grain" />
          <feComposite in="rough" in2="grain" operator="in" />
        </filter>
      </svg>

      <dialog ref={settingsRef} onClose={() => setSettingsOpen(false)} class="settings-dialog">
        <OrganicFrame variant="settings-panel" animate={animateShapes} />
        <form method="dialog" class="settings-content">
          <div class="panel-heading"><div><span class="eyebrow">Il tuo ritmo</span><h2>Impostazioni</h2></div><button class="icon-button" value="close" aria-label="Chiudi impostazioni"><X size={19} strokeWidth={2.5} /></button></div>
          <fieldset>
            <legend>Durate</legend>
            <div class="duration-grid">
              {([['focusMinutes', 'Focus', 120], ['shortMinutes', 'Pausa breve', 60], ['longMinutes', 'Pausa lunga', 90]] as const).map(([key, label, max]) => <label key={key}>{label}<span><input type="number" min="1" max={max} value={preferences[key]} onInput={(event) => updatePreferences({ [key]: Number(event.currentTarget.value) })} /> min</span></label>)}
              <label>Focus per ciclo<span><input type="number" min="1" max="8" value={preferences.focusTarget} onInput={(event) => updatePreferences({ focusTarget: Number(event.currentTarget.value) })} /></span></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Flusso</legend>
            <label class="toggle"><span>Avvia automaticamente le pause</span><input type="checkbox" checked={preferences.autoBreaks} onChange={(event) => updatePreferences({ autoBreaks: event.currentTarget.checked })} /></label>
            <label class="toggle"><span>Avvia automaticamente i Focus</span><input type="checkbox" checked={preferences.autoFocus} onChange={(event) => updatePreferences({ autoFocus: event.currentTarget.checked })} /></label>
            <label class="toggle"><span>Riduci i movimenti</span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => updatePreferences({ reducedMotion: event.currentTarget.checked })} /></label>
          </fieldset>
          <fieldset>
            <legend>Volume</legend>
            <label class="range-setting"><span>Volume generale</span><input type="range" min="0" max="1" step="0.01" value={preferences.maxVolume} onInput={(event) => {
              updatePreferences({ maxVolume: Number(event.currentTarget.value) })
              setMusicVolume()
              }} /></label>
            <label class="range-setting"><span>Volume campana</span><input type="range" min="0" max="1" step="0.01" value={preferences.alertVolume} onInput={(event) => updatePreferences({ alertVolume: Number(event.currentTarget.value) })} /></label>
          </fieldset>
          <fieldset>
            <legend>Avvisi</legend>
            <p class="permission-status">Notifiche: {'Notification' in window ? ({ granted: 'attive', denied: 'bloccate', default: 'da autorizzare' } as const)[Notification.permission] : 'non supportate'}</p>
          </fieldset>
          <div class="settings-actions"><button class="save-button" value="close">Fatto</button></div>
        </form>
      </dialog>
    </div>
  )
}
