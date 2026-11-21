import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidateProbabilities, predictionContext, predictionFrame, predictionTokenLabel, responseText, tokenKind } from '../src/lab.ts'
import { frames, tokens } from './france-fixture.mjs'

function collect(chunks) {
  let parts = []
  let predictions = []
  for (const chunk of chunks) {
    const frame = predictionFrame(chunk, predictions.length)
    parts = parts.concat(frame.parts)
    predictions = predictions.concat(frame.predictions)
  }
  return { parts, predictions }
}

test('context excludes the selected token and preserves the streamed position of every record', () => {
  const run = collect(frames)
  assert.deepEqual(run.parts.map(({ predictionIndex }) => predictionIndex), tokens.map((_, index) => index))
  assert.deepEqual(run.predictions.map(({ token }) => token), tokens)
  assert.deepEqual(predictionContext(run.parts, 0), { prefix: '', suffix: ' capital of France is Paris.' })
  assert.deepEqual(predictionContext(run.parts, 5), { prefix: 'The capital of France is', suffix: '.' })
  assert.equal(run.predictions[5].token, ' Paris')
  assert.equal(predictionTokenLabel(run.predictions[5].token), '␠Paris')
  assert.deepEqual(predictionContext(run.parts, 6), { prefix: 'The capital of France is Paris', suffix: '' })
})

test('labels expose spaces, newlines and empty or non-printing tokens while output preserves the original text', () => {
  const run = collect([{ message: { content: ' blue\n  sky' }, logprobs: [' blue', '\n', '  sky', ''].map((token) => ({ token })) }])
  assert.equal(responseText(run), ' blue\n  sky')
  assert.deepEqual(predictionContext(run.parts, 1), { prefix: ' blue', suffix: '  sky' })
  assert.deepEqual(predictionContext(run.parts, 2), { prefix: ' blue\n', suffix: '' })
  assert.deepEqual(predictionContext(run.parts, 3), { prefix: ' blue\n  sky', suffix: '' })
  assert.equal(predictionTokenLabel(' blue'), '␠blue')
  assert.equal(predictionTokenLabel('\n'), '↵')
  assert.equal(tokenKind('\n'), 'Whitespace token')
  assert.equal(predictionTokenLabel(''), '∅')
  assert.equal(tokenKind(''), 'Empty token')
  assert.equal(predictionTokenLabel('\u200b'), '[U+200B]')
  assert.equal(tokenKind('\u200b'), 'Non-printing token')
  assert.equal(tokenKind('<|eot_id|>'), 'Special-token notation')
})

test('missing and mismatched records preserve readable output without assigning token boundaries', () => {
  const run = collect([
    { message: { content: 'The' }, logprobs: [{ token: 'The' }] },
    { message: { content: ' capital' } },
    { message: { content: ' is Paris' }, logprobs: [{ token: ' is' }, { token: ' Lyon' }] },
    { message: { content: '.' }, logprobs: [{ token: '.' }] },
  ])
  assert.equal(responseText(run), 'The capital is Paris.')
  assert.deepEqual(run.parts.map(({ predictionIndex }) => predictionIndex), [0, undefined, undefined, 3])
  assert.deepEqual(predictionContext(run.parts, 0), { prefix: '', suffix: null })
  assert.deepEqual(predictionContext(run.parts, 1), { prefix: null, suffix: null })
  assert.deepEqual(predictionContext(run.parts, 3), { prefix: null, suffix: '' })
})

test('invalid, missing, and non-finite log probabilities never produce chart values', () => {
  assert.deepEqual(candidateProbabilities({ token: 'Paris' }), [])
  assert.deepEqual(candidateProbabilities({ token: 'Paris', top_logprobs: 'invalid' }), [])
  assert.deepEqual(candidateProbabilities({
    token: 'Paris',
    top_logprobs: [null, { token: 'missing' }, { token: 'null', logprob: null }, { token: 'text', logprob: '-1' },
      { token: 'infinite', logprob: -Infinity }, { token: 'NaN', logprob: NaN }, { token: 'positive', logprob: 0.3 }],
  }), [])
})

test('relative normalization remains stable when derived probabilities underflow', () => {
  const rows = candidateProbabilities({ token: 'one', top_logprobs: [{ token: 'one', logprob: -1001 }, { token: 'two', logprob: -1000 }] })
  assert.deepEqual(rows.map(({ probability }) => probability), [0, 0])
  assert.equal(rows[0].logprob, -1001)
  assert.ok(Math.abs(rows[0].relative - 100 / (1 + Math.E)) < 1e-12)
  assert.ok(Math.abs(rows[0].relative + rows[1].relative - 100) < 1e-12)
})
