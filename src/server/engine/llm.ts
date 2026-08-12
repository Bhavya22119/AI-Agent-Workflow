/**
 * LLM provider adapter for `llm_call` steps.
 *
 * Provider is chosen with LLM_PROVIDER (groq | openrouter | gemini | stub) and
 * the model with LLM_MODEL or per-step config. Groq and OpenRouter share the
 * OpenAI chat-completions shape, so they use one code path.
 *
 * If no key is configured the adapter falls back to `stub`, which returns a
 * deterministic answer after a disclosed artificial delay and labels itself as a
 * stub in the step output — so a run is never silently faked.
 */
import { serverEnv } from '../env';

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  stubbed: boolean;
  latency_ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface LlmRequest {
  prompt: string;
  system?: string;
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs: number;
}

/** HTTP failures worth retrying: rate limits, timeouts and server errors. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.1-8b-instant',
  openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
  gemini: 'gemini-2.0-flash',
  stub: 'stub-1',
};

function resolveProvider(requested?: string): { provider: string; apiKey?: string } {
  const provider = (requested ?? serverEnv.llm.provider ?? 'groq').toLowerCase();
  const keys: Record<string, string | undefined> = {
    groq: serverEnv.llm.groqApiKey,
    openrouter: serverEnv.llm.openRouterApiKey,
    gemini: serverEnv.llm.geminiApiKey,
  };
  if (provider === 'stub') return { provider: 'stub' };
  const apiKey = keys[provider];
  if (!apiKey) {
    // Fall back rather than fail the run, but say so loudly in the output.
    return { provider: 'stub' };
  }
  return { provider, apiKey };
}

async function callOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  providerName: string,
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  const started = Date.now();
  const messages = [
    ...(request.system ? [{ role: 'system', content: request.system }] : []),
    { role: 'user', content: request.prompt },
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.2,
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new LlmError(
      `${providerName} returned ${res.status}: ${detail}`,
      res.status,
      res.status === 408 || res.status === 429 || res.status >= 500,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: LlmResult['usage'];
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    throw new LlmError(`${providerName} returned an empty completion`, null, true);
  }

  return {
    text,
    provider: providerName,
    model,
    stubbed: false,
    latency_ms: Date.now() - started,
    usage: json.usage,
  };
}

async function callGemini(
  apiKey: string,
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        ...(request.system
          ? { systemInstruction: { parts: [{ text: request.system }] } }
          : {}),
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 512,
          temperature: request.temperature ?? 0.2,
        },
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new LlmError(
      `gemini returned ${res.status}: ${detail}`,
      res.status,
      res.status === 429 || res.status >= 500,
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text) throw new LlmError('gemini returned an empty completion', null, true);

  return {
    text,
    provider: 'gemini',
    model,
    stubbed: false,
    latency_ms: Date.now() - started,
    usage: {
      prompt_tokens: json.usageMetadata?.promptTokenCount,
      completion_tokens: json.usageMetadata?.candidatesTokenCount,
    },
  };
}

/**
 * Deterministic offline substitute. Answers sentiment/classification style
 * prompts plausibly so conditional_branch demos still exercise both branches.
 */
async function callStub(request: LlmRequest): Promise<LlmResult> {
  const started = Date.now();
  const delay = 700 + Math.floor(Math.random() * 500);
  await new Promise((resolve) => setTimeout(resolve, delay));

  const prompt = request.prompt.toLowerCase();
  const negativeHints = ['angry', 'terrible', 'refund', 'broken', 'awful', 'worst', 'cancel', 'furious'];
  const positiveHints = ['love', 'great', 'excellent', 'thanks', 'amazing', 'happy', 'perfect'];

  let text = 'neutral';
  if (negativeHints.some((hint) => prompt.includes(hint))) text = 'negative';
  else if (positiveHints.some((hint) => prompt.includes(hint))) text = 'positive';

  return {
    text,
    provider: 'stub',
    model: 'stub-1',
    stubbed: true,
    latency_ms: Date.now() - started,
  };
}

export async function callLlm(request: LlmRequest): Promise<LlmResult> {
  const { provider, apiKey } = resolveProvider(request.provider);
  const model = request.model ?? serverEnv.llm.model ?? DEFAULT_MODELS[provider] ?? 'stub-1';

  switch (provider) {
    case 'groq':
      return callOpenAiCompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        apiKey!,
        'groq',
        request,
        model,
      );
    case 'openrouter':
      return callOpenAiCompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        apiKey!,
        'openrouter',
        request,
        model,
      );
    case 'gemini':
      return callGemini(apiKey!, request, model);
    default:
      return callStub(request);
  }
}
