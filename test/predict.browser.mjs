import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { frames, prompt, tokenRecord } from './france-fixture.mjs'

let server
let browser
let url

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  url = `http://127.0.0.1:${server.httpServer.address().port}/`
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  await server?.close()
})

async function withRun(chunks, verify, options) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], ...options })
  try {
    const page = await context.newPage()
    await page.route('**/api/models', (route) => route.fulfill({ json: { models: ['llama3.2:3b'] } }))
    await page.route('**/api/chat', (route) => {
      assert.equal(route.request().postDataJSON().prompt, prompt)
      return route.fulfill({ contentType: 'application/x-ndjson', body: chunks.map((chunk) => JSON.stringify(chunk)).join('\n') })
    })
    await page.goto(url)
    await page.getByLabel('Your prompt').fill(prompt)
    await page.getByRole('button', { name: 'Run prompt' }).click()
    await page.getByText('Complete', { exact: true }).waitFor()
    await verify(page)
  } finally {
    await context.close()
  }
}

function contextValue(page, label) {
  return page.locator('.prediction-context .context-box').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')
}

test('token clicks, slider, arrows, and latest show the same prediction context and candidates', async () => {
  await withRun(frames, async (page) => {
    await page.getByLabel('Generated response', { exact: true }).getByRole('button', { name: /Inspect token 6/ }).click()
    const prefix = contextValue(page, 'Response prefix available at this step')
    const suffix = contextValue(page, 'Later output — not available at this step')
    const slider = page.getByRole('slider', { name: 'Prediction step' })
    const previous = page.getByRole('button', { name: 'Previous prediction' })
    const next = page.getByRole('button', { name: 'Next prediction' })
    const latest = page.getByRole('button', { name: 'Jump to latest prediction' })
    const selected = page.locator('.chosen-token code')
    await page.getByText('Prediction 6 of 7', { exact: true }).waitFor()
    assert.equal(await contextValue(page, 'User prompt').textContent(), prompt)
    assert.equal(await prefix.textContent(), 'The capital of France is')
    assert.equal(await suffix.textContent(), '.')
    assert.equal(await selected.textContent(), '␠Paris')
    assert.equal(await contextValue(page, 'Selected next token').textContent(), '␠Paris')
    assert.equal(await slider.inputValue(), '6')
    await page.getByText('Relative probabilities within returned candidates', { exact: true }).waitFor()
    await page.getByText(/These percentages are rescaled.*not a measure of factual correctness/).waitFor()

    await page.getByText('What counts as model input?', { exact: true }).click()
    await page.getByText(/Model-specific chat formatting and any configured system messages/).waitFor()
    const candidateDetails = page.getByText('Candidate probability details', { exact: true })
    await candidateDetails.focus()
    await page.keyboard.press('Enter')
    const table = page.getByRole('table', { name: 'Returned candidate probabilities' })
    await table.getByRole('rowheader', { name: '␠Lyon', exact: true }).waitFor()
    await table.getByRole('columnheader', { name: 'Returned log probability' }).waitFor()
    await table.getByRole('columnheader', { name: 'exp(logprob)', exact: true }).waitFor()

    await slider.focus()
    await page.keyboard.press('Home')
    await page.getByText('Prediction 1 of 7', { exact: true }).waitFor()
    assert.equal(await selected.textContent(), 'The')
    assert.equal(await prefix.textContent(), 'No response tokens generated yet.')
    assert.equal(await previous.isDisabled(), true)
    assert.equal(await next.isDisabled(), false)

    await next.click()
    assert.equal(await slider.inputValue(), '2')
    assert.equal(await prefix.textContent(), 'The')
    assert.equal(await selected.textContent(), '␠capital')
    await previous.click()
    assert.equal(await slider.inputValue(), '1')

    await latest.click()
    assert.equal(await slider.inputValue(), '7')
    assert.equal(await next.isDisabled(), true)
    assert.equal(await latest.isDisabled(), true)
    assert.equal(await suffix.textContent(), 'No later output.')
    await table.getByRole('rowheader', { name: '?', exact: true }).waitFor()

    await page.getByText('Full response timeline', { exact: true }).click()
    const timeline = page.getByLabel('Generated response timeline')
    const paris = timeline.getByRole('button', { name: 'Inspect token 6: ␠Paris', exact: true })
    await paris.click()
    await page.getByText('Prediction 6 of 7', { exact: true }).waitFor()
    assert.equal(await paris.getAttribute('aria-pressed'), 'true')
    assert.equal(await timeline.locator('.later-token').textContent(), '.')
    assert.equal(await prefix.textContent(), 'The capital of France is')
    await table.getByRole('rowheader', { name: '␠Lyon', exact: true }).waitFor()
  })
})

test('copy preserves whitespace and the timeline identifies a newline token on touch', async () => {
  await withRun([
    { message: { content: ' blue\n  sky' }, logprobs: [' blue', '\n', '  sky'].map((token) => tokenRecord(token)) },
    { done: true },
  ], async (page) => {
    await page.getByRole('button', { name: 'Copy response' }).click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), ' blue\n  sky')
    await page.getByRole('button', { name: 'Inspect predictions' }).click()
    await page.getByText('Full response timeline', { exact: true }).tap()
    await page.getByRole('button', { name: 'Inspect token 2: ↵, whitespace token', exact: true }).tap()
    await page.getByText('Prediction 2 of 3', { exact: true }).waitFor()
    assert.equal(await contextValue(page, 'Response prefix available at this step').textContent(), ' blue')
    assert.equal(await contextValue(page, 'Later output — not available at this step').textContent(), '  sky')
    assert.equal(await page.locator('.selected-token-chip').textContent(), '↵')
    await page.getByText('Candidate probability details', { exact: true }).tap()
    await page.getByRole('table', { name: 'Returned candidate probabilities' }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  }, { viewport: { width: 390, height: 844 }, hasTouch: true })
})

test('misaligned output stays readable and missing probabilities have a clear fallback', async () => {
  await withRun([
    { message: { content: 'The' } },
    { message: { content: ' answer is Paris.' }, logprobs: [{ token: ' Lyon' }] },
    { done: true },
  ], async (page) => {
    await page.getByRole('button', { name: 'Inspect predictions' }).click()
    await page.getByText('Exact token alignment unavailable', { exact: true }).waitFor()
    await page.getByText('Ollama did not return token probabilities for this position.', { exact: true }).waitFor()
    const timeline = page.getByLabel('Generated response timeline')
    assert.equal(await timeline.textContent(), 'The answer is Paris.')
    assert.equal(await timeline.getByRole('button').count(), 0)
    assert.equal(await contextValue(page, 'Response prefix available at this step').textContent(), 'Prefix unavailable.')
    assert.equal(await page.locator('.probability-chart').count(), 0)
  })
})

test('a selected-token log probability remains available when alternatives are missing', async () => {
  await withRun([
    { message: { content: 'Answer' }, logprobs: [{ token: 'Answer', logprob: Math.log(0.25) }] },
    { done: true },
  ], async (page) => {
    await page.getByRole('button', { name: 'Inspect predictions' }).click()
    await page.getByText('Selected token probability', { exact: true }).click()
    await page.getByText('exp(logprob) = 0.25000', { exact: true }).waitFor()
    assert.equal(await page.locator('.probability-chart').count(), 0)
  })
})
