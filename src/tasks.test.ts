import assert from 'node:assert/strict'
import test from 'node:test'
import { addTask, moveTask, normalizeTasks, removeTask } from './tasks.ts'

test('tasks are trimmed, empty ones ignored and completed ones removed', () => {
  const one = addTask([], '  Scrivere la relazione  ', 'a')
  assert.deepEqual(one, [{ id: 'a', text: 'Scrivere la relazione' }])
  assert.equal(addTask(one, '   ', 'b'), one)
  const two = addTask(one, 'Rispondere alle mail', 'b')
  assert.deepEqual(removeTask(two, 'a'), [{ id: 'b', text: 'Rispondere alle mail' }])
})

test('stored tasks are validated', () => {
  assert.deepEqual(normalizeTasks(null), [])
  assert.deepEqual(normalizeTasks([null, { id: 1, text: 'x' }, { id: 'a', text: ' ' }, { id: 'b', text: ' Leggere ', extra: true }]), [{ id: 'b', text: 'Leggere' }])
})

test('tasks can be reordered', () => {
  const tasks = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() }))
  const ids = (list: typeof tasks) => list.map((task) => task.id).join('')
  assert.equal(ids(moveTask(tasks, 'a', 2)), 'bcad')
  assert.equal(ids(moveTask(tasks, 'd', 0)), 'dabc')
  assert.equal(ids(moveTask(tasks, 'b', 99)), 'acdb')
  assert.equal(moveTask(tasks, 'c', 2), tasks)
  assert.equal(moveTask(tasks, 'z', 0), tasks)
})
