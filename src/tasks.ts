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
  return clean ? [...tasks, { id, text: clean }] : tasks
}

export const removeTask = (tasks: Task[], id: string) => tasks.filter((task) => task.id !== id)
