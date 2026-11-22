export interface Task {
  id: string
  text: string
}

const MAX_LENGTH = 140

export function normalizeTasks(stored: unknown): Task[] {
  if (!Array.isArray(stored)) return []
  return stored.filter((task): task is Task =>
    !!task && typeof task === 'object'
    && typeof task.id === 'string' && typeof task.text === 'string' && task.text.trim() !== '',
  ).map(({ id, text }) => ({ id, text: text.trim().slice(0, MAX_LENGTH) }))
}

export function addTask(tasks: Task[], text: string, id: string): Task[] {
  const clean = text.trim().slice(0, MAX_LENGTH)
  return clean ? [{ id, text: clean }, ...tasks] : tasks
}

export const removeTask = (tasks: Task[], id: string) => tasks.filter((task) => task.id !== id)

export function moveTask(tasks: Task[], id: string, to: number): Task[] {
  const from = tasks.findIndex((task) => task.id === id)
  const target = Math.max(0, Math.min(to, tasks.length - 1))
  if (from < 0 || from === target) return tasks
  const next = tasks.filter((task) => task.id !== id)
  next.splice(target, 0, tasks[from])
  return next
}
