import { useCallback, useEffect, useRef, useState } from 'react'

export const defaultModel = 'llama3.2:3b'
export const defaultTemperature = 0.2
export const examples = [
  'What is the capital of France?',
  'The colour of the sky is ___',
  'The capital of Japan is ___',
  'Explain attention in one sentence.',
]

export type Settings = { prompt: string; model: string; temperature: number }
export type Candidate = { token: string; logprob: number; bytes?: number[] }
export type Prediction = Candidate & { top_logprobs?: Candidate[]; prefix: string | null }
export type ResponsePart = { text: string; predictionIndex?: number }
export type Metrics = {
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}
type Chunk = Metrics & {
  message?: { content?: string; thinking?: string }
  logprobs?: Omit<Prediction, 'prefix'>[]
  done?: boolean
  error?: string
}
export type Run = Settings & {
  parts: ResponsePart[]
  predictions: Prediction[]
  phase: 'streaming' | 'complete' | 'stopped' | 'error'
  metrics?: Metrics
}
type ApiFailure = { error?: string; code?: 'offline' | 'model_missing' }

export function responseText(run: Run) {
  return run.parts.map(({ text }) => text).join('')
}

export function pieces(text: string) {
  return text.match(/[^\S\r\n]*[\p{L}\p{M}]+|[^\S\r\n]*\p{N}{1,3}|[^\S\r\n]*[^\s\p{L}\p{M}\p{N}]|\s+/gu) ?? []
}

export function visibleToken(token: string) {
  return token.replace(/ /g, '␣').replace(/\r/g, '␍').replace(/\n/g, '↵').replace(/\t/g, '⇥') || '∅'
}

export function sameToken(a: Candidate, b: Candidate) {
  return a.bytes && b.bytes ? a.bytes.join(',') === b.bytes.join(',') : a.token === b.token
}

export function readWorkshopMode() {
  try {
    return localStorage.getItem('prediction-lab-workshop') === 'true'
  } catch {
    return false
  }
}

export function useModels() {
  const [connection, setConnection] = useState<'checking' | 'connected' | 'offline'>('checking')
  const [models, setModels] = useState<string[]>([])
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setConnection('checking')
    try {
      const response = await fetch('/api/models', { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Model list unavailable.')
      const data: { models: string[] } = await response.json()
      if (controller.signal.aborted) return
      setModels(data.models)
      setConnection('connected')
    } catch {
      if (!controller.signal.aborted) setConnection('offline')
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => request.current?.abort()
  }, [refresh])

  return { models, connection, refresh }
}

export function useGeneration(onConnectionError: () => Promise<void>) {
  const [runs, setRuns] = useState<{ current: Run | null; previous: Run | null }>({
    current: null,
    previous: null,
  })
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function generate(settings: Settings) {
    if (request.current || !settings.prompt.trim()) return
    const controller = new AbortController()
    request.current = controller
    setError('')
    const publish = (run: Run) => setRuns((state) => ({ ...state, current: run }))
    const initial: Run = { prompt: settings.prompt, model: settings.model, temperature: settings.temperature, parts: [], predictions: [], phase: 'streaming' }
    let current = initial
    setRuns(({ current: last, previous }) => ({
      current: initial,
      previous: last?.parts.length ? last : previous,
    }))
    let complete = false
    let output = ''

    function consume(line: string) {
      if (!line.trim()) return
      const chunk: Chunk = JSON.parse(line)
      if (chunk.error) throw new Error(chunk.error)
      const content = chunk.message?.content ?? ''
      // Keep Ollama's response text authoritative if token strings cannot reconstruct the chunk.
      const tokens = chunk.message?.thinking ? [] : (chunk.logprobs ?? [])
      const matches = tokens.length > 0 && tokens.map(({ token }) => token).join('') === content
      let prefix = output
      const predictions = tokens.map((token, index) => {
        const prediction = { ...token, prefix: matches || index === 0 ? prefix : null }
        prefix += token.token
        return prediction
      })
      output += content
      const firstPrediction = current.predictions.length
      const parts: ResponsePart[] = matches
        ? tokens.map(({ token }, index) => ({ text: token, predictionIndex: firstPrediction + index })).filter(({ text }) => text)
        : content ? [{ text: content }] : []
      complete ||= Boolean(chunk.done)
      current = {
        ...current,
        parts: [...current.parts, ...parts],
        predictions: [...current.predictions, ...predictions],
        metrics: chunk.done ? chunk : current.metrics,
      }
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: settings.prompt, model: settings.model, temperature: settings.temperature }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const data: ApiFailure = await response.json().catch(() => ({}))
        if (data.code) void onConnectionError()
        throw new Error(data.error || 'The lab server could not start generation. Check that the local server is running.')
      }

      const stream = response.body.pipeThrough(new TextDecoderStream())
      let buffer = ''
      for await (const fragment of stream) {
        const lines = (buffer + fragment).split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(consume)
        publish(current)
      }
      consume(buffer)
      if (!complete) throw new Error('The stream ended early. Run the prompt again to retry.')
      current = { ...current, phase: 'complete' }
    } catch (failure) {
      current = { ...current, phase: controller.signal.aborted ? 'stopped' : 'error' }
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Generation failed. Try again.')
      }
      controller.abort()
    } finally {
      request.current = null
      publish(current)
    }
  }

  return { ...runs, error, generate, stop: () => request.current?.abort() }
}
