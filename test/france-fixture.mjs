export const prompt = 'What is the capital of France?'
export const tokens = ['The', ' capital', ' of', ' France', ' is', ' Paris', '.']

export function tokenRecord(token, alternative = ' other') {
  return {
    token,
    logprob: -0.2,
    top_logprobs: [{ token, logprob: -0.2 }, { token: alternative, logprob: -2.3 }],
  }
}

export const frames = [
  { message: { content: tokens.slice(0, 3).join('') }, logprobs: tokens.slice(0, 3).map((token) => tokenRecord(token)) },
  { message: { content: tokens.slice(3, 5).join('') }, logprobs: tokens.slice(3, 5).map((token) => tokenRecord(token)) },
  { message: { content: ' Paris.' }, logprobs: [tokenRecord(' Paris', ' Lyon'), tokenRecord('.', '?')] },
  { done: true },
]
