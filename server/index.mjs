import express from 'express'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const app = express()
const ollama = 'http://localhost:11434'
const apiPort = Number(process.env.API_PORT ?? 3001)
const embeddingModel = 'all-minilm:latest'
const unavailable = 'Ollama is not running or did not respond. Run `ollama serve` in a terminal, then check the connection again.'

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

async function listModels(signal) {
  const response = await fetch(`${ollama}/api/tags`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  })
  if (!response.ok) throw new Error(unavailable)

  const { models } = await response.json()
  return models.filter(({ name, remote_host }) => !remote_host && !/(?:[:-]cloud)(?:$|:)/i.test(name))
}

function chatModels(models) {
  return models.filter(({ name, capabilities }) =>
    name !== embeddingModel && (!capabilities?.length || capabilities.includes('completion')))
}

app.get('/api/models', async (req, res) => {
  try {
    const models = await listModels(AbortSignal.timeout(5000))
    res.json({ models: chatModels(models).map(({ name }) => name) })
  } catch {
    res.status(503).json({ code: 'offline', error: unavailable })
  }
})

app.post('/api/chat', async (req, res) => {
  const { prompt, model, temperature } = req.body ?? {}
  if (
    typeof prompt !== 'string' || !prompt.trim() ||
    typeof model !== 'string' || !model ||
    !Number.isFinite(temperature) || temperature < 0 || temperature > 1.5
  ) {
    return res.status(400).json({ error: 'Provide a prompt, a model, and a temperature between 0 and 1.5.' })
  }

  const controller = new AbortController()
  const cancel = () => {
    if (!res.writableFinished) controller.abort()
  }
  res.on('close', cancel)

  try {
    const models = await listModels(controller.signal)
    if (!chatModels(models).some(({ name }) => name === model)) {
      return res.status(404).json({
        code: 'model_missing',
        error: `The selected model is not installed locally. Run \`ollama pull ${model}\` and check the connection again.`,
      })
    }

    const upstream = await fetch(`${ollama}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        think: false,
        logprobs: true,
        top_logprobs: 10,
        options: { temperature },
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 502 : upstream.status).json({
        error: upstream.status === 404
          ? `The selected model is not installed locally. Run \`ollama pull ${model}\` and check the connection again.`
          : body.error || 'Ollama could not generate a response.',
        ...(upstream.status === 404 && { code: 'model_missing' }),
      })
    }

    res.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal })
  } catch {
    if (controller.signal.aborted || res.destroyed) return
    if (res.headersSent) res.end()
    else res.status(503).json({ code: 'offline', error: unavailable })
  } finally {
    res.off('close', cancel)
  }
})

app.post('/api/embed', async (req, res) => {
  const { prompts } = req.body ?? {}
  if (!Array.isArray(prompts) || prompts.length < 2 || prompts.length > 3 ||
    !prompts.every((prompt) => typeof prompt === 'string' && prompt.trim())) {
    return res.status(400).json({ error: 'Enter a reference and one or two comparison prompts.' })
  }

  const signal = AbortSignal.timeout(60_000)
  const models = await listModels(signal).catch(() => null)
  if (!models) return res.status(503).json({ error: unavailable })

  const missing = 'The embedding model is missing. Run `ollama pull all-minilm` in a terminal, then compare again.'
  if (!models.some(({ name }) => name === embeddingModel)) {
    return res.status(404).json({ error: missing })
  }

  try {
    const response = await fetch(`${ollama}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ model: embeddingModel, input: prompts, truncate: false }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      return res.status(response.status).json({
        error: result.error || 'Ollama could not compute embeddings. Check that your Ollama version supports /api/embed.',
      })
    }

    const { embeddings } = result
    const dimensions = Array.isArray(embeddings) && embeddings[0]?.length
    if (!dimensions || embeddings.length !== prompts.length || !embeddings.every((vector) =>
      Array.isArray(vector) && vector.length === dimensions && vector.every(Number.isFinite) && vector.some((value) => value !== 0))) {
      return res.status(502).json({ error: 'Ollama returned an incomplete embedding response. Try comparing again.' })
    }

    res.json({ model: result.model || embeddingModel, embeddings })
  } catch {
    res.status(503).json({ error: signal.aborted ? 'Ollama took too long to compute embeddings. Try again.' : unavailable })
  }
})

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
app.use(express.static(dist))
app.listen(apiPort, '127.0.0.1', () => {
  console.log(`Lab server ready at http://127.0.0.1:${apiPort}`)
})
