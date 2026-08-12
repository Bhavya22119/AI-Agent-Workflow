/**
 * LLM adapter for `llm_call` steps.
 *
 * ============================================================================
 *  Three protocols, many vendors
 * ============================================================================
 *  A "provider" here is a wire protocol, not a company, because one protocol
 *  serves a long list of endpoints:
 *
 *    openai     POST {base}/chat/completions   OpenAI, Groq, OpenRouter,
 *                                              Together, Fireworks, DeepSeek,
 *                                              vLLM, Ollama, LM Studio, …
 *    anthropic  POST {base}/v1/messages
 *    gemini     POST {base}/models/{model}:generateContent
 *
 *  So "add my own model" needs exactly three things — which protocol it speaks,
 *  the base URL, and a key — plus a model name. That is what an llm_connection
 *  row holds, and what this module consumes.
 *
 * ============================================================================
 *  Where a request's settings come from
 * ============================================================================
 *  1. A connection chosen on the step (`config.connection_id`) — resolved by the
 *     step executor and passed in as `connection`.
 *  2. Otherwise the server's own configuration: LLM_PROVIDER + the matching key.
 *  3. If neither yields a key, `stub`: a deterministic offline answer that
 *     labels itself `stubbed: true` in the step output, so a run is never
 *     silently faked.
 */
import {
  DEFAULT_BASE_URL,
  defaultModelFor,
  endpointFor,
  type LlmProtocol,
} from '@/lib/llm-providers';
import { serverEnv } from '../env';
import { assertPublicUrl } from './net';

/** A saved endpoint: enough to call anything that speaks one of the protocols. */
export interface LlmConnection {
  id?: string;
  name?: string;
  /** Vendor id, for labelling only — the engine never branches on it. */
  vendor?: string;
  /** What the engine dispatches on. */
  protocol: LlmProtocol;
  base_url?: string | null;
  default_model?: string | null;
  api_key: string;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  /** Set when the offline substitute answered instead of a real endpoint. */
  stubbed: boolean;
  /** Which endpoint answered, so a step output shows where the text came from. */
  endpoint?: string;
  /** Name of the llm_connection used, when the step chose one. */
  connection?: string;
  latency_ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface LlmRequest {
  prompt: string;
  system?: string;
  model?: string;
  /** A named server provider (`groq`, `stub`, …). Ignored when `connection` is set. */
  provider?: string;
  /** A per-organization endpoint, chosen on the step. Takes precedence. */
  connection?: LlmConnection;
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

/**
 * The named providers the *server* can be configured with. Each one is just a
 * protocol plus a base URL, which is why adding a vendor needs no new code path.
 */
interface ServerProvider {
  protocol: LlmProtocol;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  /** True when the base URL came from configuration and must be SSRF-checked. */
  custom?: boolean;
}

function serverProviders(): Record<string, ServerProvider> {
  const { llm } = serverEnv;
  return {
    groq: {
      protocol: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: llm.groqApiKey,
      defaultModel: 'llama-3.1-8b-instant',
    },
    openrouter: {
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: llm.openRouterApiKey,
      defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    },
    openai: {
      protocol: 'openai',
      baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL.openai,
      apiKey: llm.openAiApiKey,
      defaultModel: 'gpt-4o-mini',
      custom: Boolean(llm.baseUrl),
    },
    anthropic: {
      protocol: 'anthropic',
      baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL.anthropic,
      apiKey: llm.anthropicApiKey,
      defaultModel: 'claude-3-5-haiku-latest',
      custom: Boolean(llm.baseUrl),
    },
    gemini: {
      protocol: 'gemini',
      baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL.gemini,
      apiKey: llm.geminiApiKey,
      defaultModel: 'gemini-2.0-flash',
      custom: Boolean(llm.baseUrl),
    },
    /** Anything OpenAI-compatible, configured entirely from the environment. */
    custom: {
      protocol: 'openai',
      baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL.openai,
      apiKey: llm.apiKey,
      defaultModel: 'gpt-4o-mini',
      custom: true,
    },
  };
}

/**
 * A user-supplied base URL is an outbound request to a host of their choosing, so
 * it goes through the same SSRF guard as the http_request step. Without this, a
 * "connection" pointing at 169.254.169.254 would turn an llm_call into a reader
 * of cloud instance metadata.
 */
async function assertReachableBase(baseUrl: string): Promise<void> {
  try {
    await assertPublicUrl(baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LlmError(`Base URL rejected: ${message}`, null, false);
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/* --------------------------------------------------------- openai protocol */

async function callOpenAi(
  target: { baseUrl: string; apiKey: string; label: string },
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  const started = Date.now();
  const endpoint = endpointFor(target.baseUrl, 'chat/completions');
  const messages = [
    ...(request.system ? [{ role: 'system', content: request.system }] : []),
    { role: 'user', content: request.prompt },
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${target.apiKey}`,
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
      `${target.label} returned ${res.status}: ${detail}`,
      res.status,
      retryableStatus(res.status),
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: LlmResult['usage'];
    error?: { message?: string };
  };
  // Some OpenAI-compatible servers answer 200 with an error object in the body.
  if (json.error?.message) {
    throw new LlmError(`${target.label}: ${json.error.message}`, null, false);
  }
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new LlmError(`${target.label} returned an empty completion`, null, true);

  return {
    text,
    provider: target.label,
    model,
    stubbed: false,
    endpoint,
    latency_ms: Date.now() - started,
    usage: json.usage,
  };
}

/* ------------------------------------------------------ anthropic protocol */

async function callAnthropic(
  target: { baseUrl: string; apiKey: string; label: string },
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  const started = Date.now();
  const endpoint = endpointFor(target.baseUrl, 'v1/messages');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': target.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      // Required by the Messages API, unlike chat/completions.
      max_tokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.2,
      ...(request.system ? { system: request.system } : {}),
      messages: [{ role: 'user', content: request.prompt }],
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new LlmError(
      `${target.label} returned ${res.status}: ${detail}`,
      res.status,
      retryableStatus(res.status),
    );
  }

  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text =
    json.content
      ?.filter((block) => block.type === 'text' || typeof block.text === 'string')
      .map((block) => block.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text) throw new LlmError(`${target.label} returned an empty completion`, null, true);

  return {
    text,
    provider: target.label,
    model,
    stubbed: false,
    endpoint,
    latency_ms: Date.now() - started,
    usage: {
      prompt_tokens: json.usage?.input_tokens,
      completion_tokens: json.usage?.output_tokens,
    },
  };
}

/* --------------------------------------------------------- gemini protocol */

async function callGemini(
  target: { baseUrl: string; apiKey: string; label: string },
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  const started = Date.now();
  const base = target.baseUrl.replace(/\/+$/, '');
  const endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': target.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
      },
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new LlmError(
      `${target.label} returned ${res.status}: ${detail}`,
      res.status,
      retryableStatus(res.status),
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
  if (!text) throw new LlmError(`${target.label} returned an empty completion`, null, true);

  return {
    text,
    provider: target.label,
    model,
    stubbed: false,
    endpoint,
    latency_ms: Date.now() - started,
    usage: {
      prompt_tokens: json.usageMetadata?.promptTokenCount,
      completion_tokens: json.usageMetadata?.candidatesTokenCount,
    },
  };
}

/* ------------------------------------------------------------------- stub */

/**
 * Deterministic offline substitute. Answers sentiment/classification style
 * prompts plausibly so conditional_branch demos still exercise both branches.
 */
async function callStub(request: LlmRequest): Promise<LlmResult> {
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.floor(Math.random() * 500)));

  const prompt = request.prompt.toLowerCase();
  const negative = ['angry', 'terrible', 'refund', 'broken', 'awful', 'worst', 'cancel', 'furious'];
  const positive = ['love', 'great', 'excellent', 'thanks', 'amazing', 'happy', 'perfect'];

  let text = 'neutral';
  if (negative.some((hint) => prompt.includes(hint))) text = 'negative';
  else if (positive.some((hint) => prompt.includes(hint))) text = 'positive';

  return {
    text,
    provider: 'stub',
    model: 'stub-1',
    stubbed: true,
    latency_ms: Date.now() - started,
  };
}

/* --------------------------------------------------------------- dispatch */

async function dispatch(
  protocol: LlmProtocol,
  target: { baseUrl: string; apiKey: string; label: string },
  request: LlmRequest,
  model: string,
): Promise<LlmResult> {
  switch (protocol) {
    case 'anthropic':
      return callAnthropic(target, request, model);
    case 'gemini':
      return callGemini(target, request, model);
    default:
      return callOpenAi(target, request, model);
  }
}

export async function callLlm(request: LlmRequest): Promise<LlmResult> {
  /* ------------------------------------------- 1. a connection on the step */
  const connection = request.connection;
  if (connection) {
    const baseUrl = connection.base_url?.trim() || DEFAULT_BASE_URL[connection.protocol];
    const model =
      request.model?.trim() ||
      connection.default_model?.trim() ||
      defaultModelFor(connection.protocol);
    if (!model) {
      throw new LlmError(
        `Connection "${connection.name ?? connection.id}" has no default model, and this step does not set one.`,
        null,
        false,
      );
    }
    // Only checked when the URL is the operator's own choice; vendor defaults are
    // known-good and do not need a DNS round trip on every call.
    if (connection.base_url?.trim()) await assertReachableBase(baseUrl);

    return dispatch(
      connection.protocol,
      {
        baseUrl,
        apiKey: connection.api_key,
        label: connection.name ?? connection.vendor ?? connection.protocol,
      },
      request,
      model,
    );
  }

  /* ------------------------------------- 2. the server's named provider */
  const providers = serverProviders();
  const requested = (request.provider ?? serverEnv.llm.provider ?? 'groq').toLowerCase();
  if (requested === 'stub') return callStub(request);

  const spec = providers[requested];
  // No such provider, or no key for it: fall back rather than fail the run, and
  // say so in the output.
  if (!spec?.apiKey) return callStub(request);

  const model = request.model?.trim() || serverEnv.llm.model || spec.defaultModel;
  if (spec.custom) await assertReachableBase(spec.baseUrl);

  return dispatch(
    spec.protocol,
    { baseUrl: spec.baseUrl, apiKey: spec.apiKey, label: requested },
    request,
    model,
  );
}

