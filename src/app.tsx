import { useEffect, useRef, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, Settings, X } from 'lucide-preact'
import {
  advanceSession,
  bellGain,
  cycleRepeat,
  defaultPreferences,
  musicSilenced,
  musicVolume,
  normalizePreferences,
  parseYouTubeUrl,
  remainingMs,
  switchMode,
  youtubeVolume,
  type Mode,
  type MusicSource,
  type Preferences,
  type RepeatMode,
} from './model.ts'
import { closedSplinePath, createRadialBlobPoints, createRectBlobPoints } from './blob.ts'
import { accessHistory, type HistoryEntry } from './history.ts'
import { addTask, moveTask, normalizeTasks, removeTask, type Task } from './tasks.ts'
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

const pencilGrain = `<filter id='g' x='-5%' y='-60%' width='110%' height='220%'><feTurbulence type='fractalNoise' baseFrequency='1.1 .9' numOctaves='2' seed='4' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='1.4' xChannelSelector='R' yChannelSelector='G' result='r'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.2 0 0 0 -.45' result='a'/><feComposite in='r' in2='a' operator='in'/></filter>`

// Stroke images are used as per-line backgrounds so the mark follows wrapped text.
function pencilImage(path: string, color: string, width: number, grain: boolean) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 12' preserveAspectRatio='none'>${grain ? pencilGrain : ''}<path d='${path}' fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round'${grain ? " filter='url(%23g)'" : ''}/></svg>`
  return `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/"/g, "'")}")`
}

interface TaskItemProps {
  task: Task
  completing: boolean
  onComplete: () => void
  onPointerDown: (event: PointerEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
}

function TaskItem({ task, completing, onComplete, onPointerDown, onKeyDown }: TaskItemProps) {
  const first = pencilPath(task.id, 1, 99, 6.5, -1.2)
  const ink = {
    '--pencil-preview': pencilImage(first, 'rgba(135,121,133,.6)', 1.4, false),
    '--pencil-pass': pencilImage(first, '#4a4150', 2.3, true),
    '--pencil-return': pencilImage(pencilPath(`${task.id}~`, 99, 3, 7.4, .9), 'rgba(74,65,80,.75)', 1.7, true),
  }
  return (
    <li class={`task-item ${completing ? 'completing' : ''}`} data-task={task.id}>
      <button type="button" class="task-strike" onClick={onComplete} onPointerDown={onPointerDown} onKeyDown={onKeyDown} disabled={completing} aria-label={`Segna come completata: ${task.text}`} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">
        <span class="task-text">
          {task.text}
          <span class="task-ink" style={ink} aria-hidden="true">
            <span class="ink ink-preview"><span class="ink ink-pass"><span class="ink ink-return">{task.text}</span></span></span>
          </span>
        </span>
      </button>
    </li>
  )
}

interface TaskDrag {
  id: string
  pointerId: number
  touch: boolean
  startX: number
  startY: number
  pointerY: number
  active: boolean
  holdTimer: number
  scrollFrame: number
  release: () => void
  item?: HTMLLIElement
  items: HTMLLIElement[]
  index: number
  target: number
  // Item tops and heights in list content coordinates, so scrolling while dragging keeps them valid.
  tops: number[]
  heights: number[]
  startScroll: number
}

const DRAG_THRESHOLD = 5
const TOUCH_HOLD_MS = 280
const TASK_DROP_MS = 220

// Tasks are reordered by grabbing their text: the task lifts off the paper and the others slide to make room.
function TaskList({ tasks, completing, reducedMotion, onComplete, onMove }: {
  tasks: Task[]
  completing: string[]
  reducedMotion: boolean
  onComplete: (id: string) => void
  onMove: (id: string, to: number) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const dragRef = useRef<TaskDrag | null>(null)
  const suppressClickRef = useRef(false)
  const refocusRef = useRef('')

  const clearStyles = (drag: TaskDrag) => {
    listRef.current?.classList.remove('sorting')
    document.body.classList.remove('task-sorting')
    drag.items.forEach((item) => {
      item.classList.remove('dragging', 'dropping')
      item.style.transform = ''
    })
  }

  const stop = () => {
    const drag = dragRef.current
    if (!drag) return
    window.clearTimeout(drag.holdTimer)
    cancelAnimationFrame(drag.scrollFrame)
    drag.release()
    dragRef.current = null
    return drag
  }

  const layout = (drag: TaskDrag) => {
    const list = listRef.current
    if (!list || !drag.item) return
    const { index, tops, heights } = drag
    const last = tops.length - 1
    const offset = drag.pointerY - drag.startY + list.scrollTop - drag.startScroll
    const shift = Math.max(tops[0] - tops[index], Math.min(tops[last] + heights[last] - tops[index] - heights[index], offset))
    // A neighbour gives way once the leading edge of the lifted task passes its middle.
    const top = tops[index] + shift
    const bottom = top + heights[index]
    drag.target = tops.reduce((target, itemTop, i) => {
      const middle = itemTop + heights[i] / 2
      return (i < index && middle <= top) || (i > index && middle < bottom) ? target + 1 : target
    }, 0)
    drag.items.forEach((item, i) => {
      if (i === index) item.style.transform = `translateY(${shift}px)`
      else if (i > index && i <= drag.target) item.style.transform = `translateY(${-heights[index]}px)`
      else if (i < index && i >= drag.target) item.style.transform = `translateY(${heights[index]}px)`
      else item.style.transform = ''
    })
  }

  // Near the edges of a scrolling list, keep scrolling so far tasks can be reached.
  const autoScroll = () => {
    const drag = dragRef.current
    const list = listRef.current
    if (!drag || !list) return
    const { top, bottom } = list.getBoundingClientRect()
    const edge = Math.min(48, (bottom - top) / 4)
    const speed = drag.pointerY < top + edge ? -(top + edge - drag.pointerY) : drag.pointerY > bottom - edge ? drag.pointerY - bottom + edge : 0
    if (speed) {
      const before = list.scrollTop
      list.scrollTop += Math.max(-1, Math.min(1, speed / edge)) * 10
      if (list.scrollTop !== before) layout(drag)
    }
    drag.scrollFrame = requestAnimationFrame(autoScroll)
  }

  const activate = (drag: TaskDrag) => {
    const list = listRef.current
    const items = list ? [...list.querySelectorAll<HTMLLIElement>(':scope > .task-item')] : []
    const index = items.findIndex((item) => item.dataset.task === drag.id)
    if (!list || index < 0) return stop()
    const listTop = list.getBoundingClientRect().top - list.scrollTop
    const rects = items.map((item) => item.getBoundingClientRect())
    Object.assign(drag, {
      active: true, items, index, target: index, item: items[index], startScroll: list.scrollTop,
      tops: rects.map((rect) => rect.top - listTop), heights: rects.map((rect) => rect.height),
    })
    list.classList.add('sorting')
    document.body.classList.add('task-sorting')
    items[index].classList.add('dragging')
    if (drag.touch) navigator.vibrate?.(8)
    layout(drag)
    drag.scrollFrame = requestAnimationFrame(autoScroll)
  }

  function onPointerMove(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    drag.pointerY = event.clientY
    if (drag.active) return layout(drag)
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    // On touch a quick swipe scrolls the list; only a short hold picks the task up.
    if (drag.touch) {
      if (distance > 8) stop()
    } else if (distance > DRAG_THRESHOLD) activate(drag)
  }

  function onPointerUp(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    stop()
    if (!drag.active || !drag.item) return
    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false })
    const { index, target, heights } = drag
    const landing = target > index
      ? heights.slice(index + 1, target + 1).reduce((sum, height) => sum + height, 0)
      : -heights.slice(target, index).reduce((sum, height) => sum + height, 0)
    drag.item.classList.replace('dragging', 'dropping')
    drag.item.style.transform = `translateY(${landing}px)`
    document.body.classList.remove('task-sorting')
    window.setTimeout(() => {
      const list = listRef.current
      list?.classList.add('settling')
      clearStyles(drag)
      if (target !== index) onMove(drag.id, target)
      requestAnimationFrame(() => requestAnimationFrame(() => list?.classList.remove('settling')))
    }, reducedMotion ? 0 : TASK_DROP_MS)
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== dragRef.current?.pointerId) return
    const drag = stop()
    if (drag?.active) clearStyles(drag)
  }

  const startDrag = (id: string, event: PointerEvent) => {
    if (dragRef.current || event.button !== 0 || !event.isPrimary || completing.includes(id) || tasks.length < 2) return
    const drag: TaskDrag = {
      id, pointerId: event.pointerId, touch: event.pointerType === 'touch', startX: event.clientX, startY: event.clientY, pointerY: event.clientY,
      active: false, holdTimer: 0, scrollFrame: 0, items: [], index: 0, target: 0, tops: [], heights: [], startScroll: 0,
      // The handlers of this render are kept so the same ones are removed, even if the list re-renders mid-drag.
      release: () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
      },
    }
    dragRef.current = drag
    if (drag.touch) drag.holdTimer = window.setTimeout(() => activate(drag), TOUCH_HOLD_MS)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  const moveWithKeyboard = (id: string, index: number, event: KeyboardEvent) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const to = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= tasks.length) return
    refocusRef.current = id
    onMove(id, to)
  }

  // Once a touch drag has started the page must not scroll under the finger; this needs a non-passive listener.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const holdScroll = (event: TouchEvent) => { if (dragRef.current?.active) event.preventDefault() }
    list.addEventListener('touchmove', holdScroll, { passive: false })
    return () => list.removeEventListener('touchmove', holdScroll)
  }, [])

  // A task removed mid-drag would leave the measured positions stale, so the drag is dropped.
  useEffect(() => {
    const drag = dragRef.current
    if (drag && !tasks.some((task) => task.id === drag.id)) {
      stop()
      clearStyles(drag)
    }
    if (refocusRef.current) {
      listRef.current?.querySelector<HTMLButtonElement>(`[data-task="${refocusRef.current}"] .task-strike`)?.focus()
      refocusRef.current = ''
    }
  }, [tasks])

  useEffect(() => () => { stop() }, [])

  return (
    <ul ref={listRef} class="task-list" aria-labelledby="tasks-title" onContextMenu={(event) => { if (dragRef.current) event.preventDefault() }}>
      {tasks.map((task, index) => (
        <TaskItem
          key={task.id}
          task={task}
          completing={completing.includes(task.id)}
          onComplete={() => { if (!suppressClickRef.current) onComplete(task.id) }}
          onPointerDown={(event) => startDrag(task.id, event)}
          onKeyDown={(event) => moveWithKeyboard(task.id, index, event)}
        />
      ))}
    </ul>
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
  const preferencesRef = useRef(preferences)
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
  preferencesRef.current = preferences
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

  // Read through a ref so delayed callbacks (YouTube onReady, the bell's duck timeout) use current preferences.
  const setMusicVolume = (factor = 1) => {
    const current = preferencesRef.current
    const volume = musicVolume(current, factor)
    // Volume 0 alone is not enough: iOS ignores media volume and YouTube needs an explicit mute.
    const silenced = musicSilenced(current)
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = silenced
    }
    const player = youtubePlayerRef.current
    if (player) {
      // Unmute before setting the volume: YouTube's unMute() raises any volume below 5 back up to 5.
      if (silenced) player.mute()
      else {
        player.unMute()
        player.setVolume(youtubeVolume(volume))
      }
    }
  }

  useEffect(() => setMusicVolume(), [preferences.volume, preferences.maxVolume, preferences.muted])

  const ringBell = () => {
    if (bellGain(preferences) === 0) return
    const context = getAudioContext()
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, bellGain(preferences)), now + 0.015)
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
    let player: YouTubePlayer | null = null
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
      // The player's methods only exist once it is ready, so it is shared through the ref from onReady on.
      player = new api.Player(mount, {
        height: '200',
        width: '100%',
        videoId: currentTrack.videoId,
        playerVars,
        events: {
          onReady: ({ target }) => {
            window.clearTimeout(readyTimeout)
            youtubePlayerRef.current = target
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
      player?.destroy()
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
              ? <TaskList tasks={tasks} completing={completingTasks} reducedMotion={preferences.reducedMotion} onComplete={completeTask} onMove={(id, to) => setTasks((current) => moveTask(current, id, to))} />
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
