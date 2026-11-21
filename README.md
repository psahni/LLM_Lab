# LLM Prediction Lab

A local workshop app for exploring how a language model turns a prompt into a response, one token at a time.

## Run locally

Use Node.js 22.13 or newer, npm, and a recent Ollama release.

1. Start Ollama with `ollama serve` if it is not already running.
2. Install the chat model with `ollama pull llama3.2:3b`. To use Embeddings, install the local embedding model with `ollama pull all-minilm`.
3. From this directory, run:

   ```sh
   npm ci
   npm run dev
   ```

4. Open [the lab](http://127.0.0.1:5173).

For a built version, run `npm run build` followed by `npm start`, then open [the built lab](http://127.0.0.1:3001). The Express server proxies chat, model listing, and embeddings to the local Ollama server.

## Learning pipeline

Token IDs become vectors before the transformer processes them. The model uses attention to process context, predicts the next token, and repeats token selection to generate a response.

1. **Prompt** — Pick an example or edit the prompt. Select an installed local model and set the temperature.
2. **Tokenize** — Preview an estimated split. After a run, Ollama may report the count for the full formatted prompt, including chat-template tokens.
3. **Token embeddings** — Select an example token to see how its ID looks up an input vector. The IDs and vectors are illustrative teaching data.
4. **Attention** — Choose a token to focus its row in the causal heatmap. Illustrative attention pattern — simplified for teaching; not the model’s real internal attention weights.
5. **Predict** — Select an underlined token in Generate or Predict to see the candidates for that exact step. You can also move between recorded steps or follow the latest. The bars sum to 100% across the returned candidates. The tooltip shows each candidate’s `exp(logprob)` as a percentage before that normalization. If Ollama returns no log probabilities for a run, the lab displays that state.
6. **Generate** — Watch the response stream in. Stop or restart the run, copy the response, or check the timings.

## Lab tools

- **Embeddings** — Compare one or two prompts with a reference using cosine similarity. Use the prefilled France and sky example or enter your own text. Select a prompt to preview the first 12 dimensions of its vector.
- **Settings** — Change the temperature and run the same prompt again. **Compare runs** in Generate shows the current and previous responses side by side. **Workshop mode** enlarges text and shortens explanations.

The app keeps runs in memory and saves the Workshop mode preference in the browser. For the response fields, see the [Ollama chat API schema](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml).

## Prediction inspector checks

Run `npm test` for the token-alignment and probability checks. Install Chromium with `npx playwright install chromium`, then run `npm run test:browser` to verify the Predict controls and clipboard against local test fixtures. The fixture tests run without Ollama.
