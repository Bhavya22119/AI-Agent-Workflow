/**
 * Everything about LLM endpoints that both the browser and the engine need to
 * agree on: which vendors exist, which protocol each speaks, where they live, and
 * how a base URL turns into a request URL.
 *
 * ---------------------------------------------------------------------------
 *  Vendor vs protocol
 * ---------------------------------------------------------------------------
 *  There are only three wire protocols worth implementing, and a long and growing
 *  list of vendors that speak them. Conflating the two gives you a picker with
 *  three entries that nobody recognises; separating them gives you a picker with
 *  the names people actually know, and one `switch` in the engine.
 *
 *  So a connection stores both: `provider` (the vendor, chosen from VENDORS) and
 *  `protocol` (what the engine dispatches on). Adding a vendor that speaks
 *  OpenAI's shape means adding a row to VENDORS — no engine change, no migration.
 *
 *  This module imports nothing, so the builder can show the exact endpoint a
 *  connection will call without pulling the server's LLM adapter — and its
 *  secrets — into the client bundle.
 */

/** The wire protocol an endpoint speaks. */
export type LlmProtocol = 'openai' | 'anthropic' | 'gemini';

export const LLM_PROTOCOLS: LlmProtocol[] = ['openai', 'anthropic', 'gemini'];

export function isLlmProtocol(value: unknown): value is LlmProtocol {
  return typeof value === 'string' && (LLM_PROTOCOLS as string[]).includes(value);
}

export interface ProtocolSpec {
  value: LlmProtocol;
  label: string;
  /** What the request looks like on the wire, shown as a `?` tip. */
  detail: string;
  keyLabel: string;
  keyPlaceholder: string;
}

export const PROTOCOL_SPECS: Record<LlmProtocol, ProtocolSpec> = {
  openai: {
    value: 'openai',
    label: 'OpenAI-compatible  ·  POST /chat/completions',
    detail:
      'POST {base}/chat/completions with an Authorization: Bearer header, and the answer read from choices[0].message.content. Most vendors speak this.',
    keyLabel: 'API key',
    keyPlaceholder: 'sk-…',
  },
  anthropic: {
    value: 'anthropic',
    label: 'Anthropic Messages  ·  POST /v1/messages',
    detail:
      'POST {base}/v1/messages with x-api-key and anthropic-version: 2023-06-01, and the answer read from content[].text.',
    keyLabel: 'API key',
    keyPlaceholder: 'sk-ant-…',
  },
  gemini: {
    value: 'gemini',
    label: 'Google Gemini  ·  POST :generateContent',
    detail:
      'POST {base}/models/{model}:generateContent with an x-goog-api-key header, and the answer read from candidates[0].content.parts[].text.',
    keyLabel: 'API key',
    keyPlaceholder: 'AIza…',
  },
};

/** Vendor defaults, used when a connection leaves `base_url` blank. */
export const DEFAULT_BASE_URL: Record<LlmProtocol, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

/* ----------------------------------------------------------------- vendors */

export interface VendorSpec {
  /** Stored in `llm_connections.provider`. */
  id: string;
  label: string;
  protocol: LlmProtocol;
  /** Blank means "ask the user", which is what `custom` does. */
  baseUrl: string;
  /** A model that exists today, so a new connection works before it is edited. */
  model: string;
  /** Where to get a key, shown as a link next to the key field. */
  keysAt?: string;
  /** Grouping in the picker. */
  group: 'Hosted' | 'Self-hosted' | 'Other';
  /** True when the user is expected to choose the protocol themselves. */
  pickProtocol?: boolean;
  /** Loopback/private hosts need the SSRF guard relaxed to be reachable. */
  privateHost?: boolean;
}

export const VENDORS: VendorSpec[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keysAt: 'platform.openai.com/api-keys',
    group: 'Hosted',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
    keysAt: 'console.anthropic.com/settings/keys',
    group: 'Hosted',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    keysAt: 'aistudio.google.com/apikey',
    group: 'Hosted',
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    keysAt: 'console.groq.com/keys',
    group: 'Hosted',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    keysAt: 'openrouter.ai/keys',
    group: 'Hosted',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    keysAt: 'console.mistral.ai/api-keys',
    group: 'Hosted',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keysAt: 'platform.deepseek.com/api_keys',
    group: 'Hosted',
  },
  {
    id: 'together',
    label: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    keysAt: 'api.together.ai/settings/api-keys',
    group: 'Hosted',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    protocol: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    keysAt: 'fireworks.ai/account/api-keys',
    group: 'Hosted',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    protocol: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama3.1-8b',
    keysAt: 'cloud.cerebras.ai',
    group: 'Hosted',
  },
  {
    id: 'xai',
    label: 'xAI  (Grok)',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
    keysAt: 'console.x.ai',
    group: 'Hosted',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    protocol: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    model: 'sonar',
    keysAt: 'perplexity.ai/settings/api',
    group: 'Hosted',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    group: 'Self-hosted',
    privateHost: true,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    group: 'Self-hosted',
    privateHost: true,
  },
  {
    id: 'vllm',
    label: 'vLLM',
    protocol: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    group: 'Self-hosted',
    privateHost: true,
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp server',
    protocol: 'openai',
    baseUrl: 'http://localhost:8080/v1',
    model: 'local-model',
    group: 'Self-hosted',
    privateHost: true,
  },
  {
    id: 'custom',
    label: 'Other  —  choose the API format',
    protocol: 'openai',
    baseUrl: '',
    model: '',
    group: 'Other',
    pickProtocol: true,
  },
];

export const VENDOR_GROUPS: Array<VendorSpec['group']> = ['Hosted', 'Self-hosted', 'Other'];

const VENDORS_BY_ID = new Map(VENDORS.map((vendor) => [vendor.id, vendor]));

export function vendorSpec(id: string | null | undefined): VendorSpec | undefined {
  return id ? VENDORS_BY_ID.get(id) : undefined;
}

/** A readable name for a vendor id, including ids no longer in the list. */
export function vendorLabel(id: string | null | undefined): string {
  return vendorSpec(id)?.label ?? id ?? 'custom';
}

/** The model a protocol is assumed to want when nothing else says. */
export function defaultModelFor(protocol: LlmProtocol): string {
  switch (protocol) {
    case 'anthropic':
      return 'claude-3-5-haiku-latest';
    case 'gemini':
      return 'gemini-2.0-flash';
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Appends a protocol's path to a base URL without doubling segments the caller
 * already typed. `https://x/v1` + `v1/messages` is `https://x/v1/messages`, and a
 * base URL that is already the full endpoint is left alone — because people paste
 * whichever of the two their vendor's docs showed them.
 */
export function endpointFor(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const parts = suffix.split('/').filter(Boolean);
  const lower = trimmed.toLowerCase();

  if (lower.endsWith(`/${parts.join('/').toLowerCase()}`)) return trimmed;

  let start = 0;
  while (start < parts.length && lower.endsWith(`/${parts[start].toLowerCase()}`)) {
    start += 1;
  }
  const rest = parts.slice(start);
  return rest.length ? `${trimmed}/${rest.join('/')}` : trimmed;
}

/** The URL a connection will actually POST to, for display in the builder. */
export function describeEndpoint(
  protocol: LlmProtocol,
  baseUrl: string | null | undefined,
  model?: string | null,
): string {
  const base = baseUrl?.trim() || DEFAULT_BASE_URL[protocol];
  switch (protocol) {
    case 'anthropic':
      return endpointFor(base, 'v1/messages');
    case 'gemini':
      return `${base.replace(/\/+$/, '')}/models/${model?.trim() || '{model}'}:generateContent`;
    default:
      return endpointFor(base, 'chat/completions');
  }
}
