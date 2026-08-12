/**
 * Server-side configuration. Never import this from a client component: it
 * reads secrets that must not reach the browser bundle.
 */

function optional(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function required(key: string): string {
  const value = optional(key);
  if (!value) {
    throw new Error(
      `Missing required server environment variable ${key}. See .env.example.`
    );
  }
  return value;
}

const subdomain =
  optional('NHOST_SUBDOMAIN') ?? optional('NEXT_PUBLIC_NHOST_SUBDOMAIN');
const region = optional('NHOST_REGION') ?? optional('NEXT_PUBLIC_NHOST_REGION');

function nhostUrl(service: 'hasura' | 'auth', path: string): string {
  const override = optional(`NHOST_${service.toUpperCase()}_URL`);
  if (override) return override.replace(/\/+$/, '') + path;
  if (!subdomain || !region) {
    throw new Error(
      'Missing NEXT_PUBLIC_NHOST_SUBDOMAIN / NEXT_PUBLIC_NHOST_REGION.'
    );
  }
  return `https://${subdomain}.${service}.${region}.nhost.run${path}`;
}

export const serverEnv = {
  subdomain,
  region,

  /** Hasura GraphQL endpoint used with the admin secret by the engine. */
  get graphqlUrl(): string {
    return nhostUrl('hasura', '/v1/graphql');
  },
  /** Nhost Auth base URL, used to verify bearer tokens on the direct transport. */
  get authUrl(): string {
    return nhostUrl('auth', '/v1');
  },
  get adminSecret(): string {
    return required('NHOST_ADMIN_SECRET');
  },

  /** Shared secret proving an Action request really came from Hasura. */
  actionSecret: optional('HASURA_ACTION_SECRET'),
  /** Shared secret proving an Event/Cron trigger request came from Hasura. */
  webhookSecret: optional('HASURA_WEBHOOK_SECRET'),

  /** Public base URL of this app; used to build webhook URLs shown to owners. */
  get appBaseUrl(): string {
    return (
      optional('APP_BASE_URL') ??
      (optional('VERCEL_PROJECT_PRODUCTION_URL')
        ? `https://${optional('VERCEL_PROJECT_PRODUCTION_URL')}`
        : undefined) ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  },

  llm: {
    provider: (optional('LLM_PROVIDER') ?? 'groq') as
      | 'groq'
      | 'openrouter'
      | 'gemini'
      | 'stub',
    model: optional('LLM_MODEL'),
    groqApiKey: optional('GROQ_API_KEY'),
    openRouterApiKey: optional('OPENROUTER_API_KEY'),
    geminiApiKey: optional('GEMINI_API_KEY'),
  },

  notify: {
    slackWebhookUrl: optional('SLACK_WEBHOOK_URL'),
    smtpHost: optional('SMTP_HOST'),
    smtpPort: Number(optional('SMTP_PORT') ?? 587),
    smtpUser: optional('SMTP_USER'),
    smtpPassword: optional('SMTP_PASSWORD'),
    smtpFrom: optional('SMTP_FROM'),
  },

  /**
   * http_request steps call user-supplied URLs, so private address space is
   * blocked by default to avoid turning the engine into an SSRF proxy into the
   * hosting network. Set to true only when you intentionally want to hit a
   * local service during development.
   */
  allowPrivateHttpTargets: optional('ALLOW_PRIVATE_HTTP_TARGETS') === 'true',

  /** Hard ceiling on step executions per run, to contain pathological branches. */
  maxStepsPerRun: Number(optional('MAX_STEPS_PER_RUN') ?? 100),
};

export type ServerEnv = typeof serverEnv;
