import assert from 'node:assert/strict'
import test from 'node:test'
import { addTask, normalizeTasks, removeTask } from './tasks.ts'

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
