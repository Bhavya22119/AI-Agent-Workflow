import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Hero } from '@/components/ui/hero';
import { HeaderCta, LandingCta } from '@/components/landing-cta';

/**
 * Landing page. A server component with no auth gate, so hitting the root URL
 * paints immediately instead of showing a spinner while a session is resolved —
 * only the call-to-action knows whether you are signed in.
 *
 * Deliberately short: a hero, the one piece of evidence that the thing actually
 * runs, and the accounts needed to try it. The architecture and the permission
 * model are written up properly in ARCHITECTURE.md; restating them here as
 * marketing sections would say less, at more length.
 */

/* The request an external caller sends, and what actually comes back. */
const WEBHOOK_CALL = `curl -X POST https://<app>/api/webhooks/<trigger-id> \\
  -H 'x-webhook-secret: 9f3c…' \\
  -d '{"text": "Charged twice and the page crashed"}'`;

const WEBHOOK_RESPONSE = `{
  "workflow_run_id": "7c1e…",
  "status": "completed",
  "duration_ms": 1846,
  "output":  { "text": "negative", "model": "llama-3.1-8b-instant" },
  "outputs": [ { "key": "verdict", "value": "negative" } ]
}`;

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Logo priority className="h-9" />
          <HeaderCta />
        </div>
      </header>

      <Hero
        eyebrow="Nhost · Hasura · PostgreSQL"
        title="Chain AI agent steps into workflows other systems can start."
        subtitle="Six node types on a canvas. Four ways a run can begin. A run's position lives in Postgres, so it can pause for a human to approve and resume whenever they do."
        cta={<LandingCta />}
        footnote="Multi-tenant throughout — organizations, roles, a usage quota, and two permission layers."
      />

      <main className="mx-auto max-w-5xl px-5">
        {/* --------------------------------------------------------- numbers */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4 mt-14">
          <Figure value="6" label="node types" />
          <Figure value="4" label="trigger types" />
          <Figure value="2" label="permission layers" />
          <Figure value="156" label="automated checks" />
        </section>

        {/* -------------------------------------------------------- evidence */}
        <section className="grid items-start gap-8 border-t border-line py-14 lg:grid-cols-[1fr_1.1fr] lg:gap-12 mt-14">
          <div>
            <SectionLabel>What a run looks like from outside</SectionLabel>
            <h2 className="mt-2.5 text-xl leading-snug font-semibold tracking-[-0.01em] text-ink">
              An endpoint per trigger, configured per trigger.
            </h2>
            <p className="mt-3.5 text-[15px] leading-relaxed text-ink-2">
              Each webhook sets its own HTTP method, where it expects its secret, which
              payload fields are mandatory, and whether the caller gets an immediate 202
              or waits for the result. All of it is enforced at the endpoint — a wrong
              method gets 405 naming the right one, and a missing required field gets 400
              with no run created.
            </p>
            <p className="mt-3.5 text-[15px] leading-relaxed text-ink-2">
              The run itself walks the graph: prompt a model, call an API, branch on what
              the model said, stop for an approval, save the result.
            </p>
          </div>

          <div className="min-w-0">
            <Panel label="An external system starts a run" tone="request" code={WEBHOOK_CALL} />
            <div className="my-2 flex items-center gap-2 pl-1 text-[11px] text-ink-3">
              <span className="h-3 w-px bg-line-strong" />
              llm_call → http_request → condition → db_write
            </div>
            <Panel label="The response, when set to wait" code={WEBHOOK_RESPONSE} />
          </div>
        </section>

        {/* ------------------------------------------------------------- try */}
        <section className="border-t border-line py-14">
          <SectionLabel>Try it</SectionLabel>
          <h2 className="mt-2.5 max-w-2xl text-xl leading-snug font-semibold tracking-[-0.01em] text-ink">
            Four seeded accounts, so the rules are visible rather than described.
          </h2>
          <p className="mt-3.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            Sign in as two of them side by side. The interesting one is{' '}
            <Code>owner-b</Code> — paste an Org A workflow id into their URL bar and the
            page reports that it does not exist, because for them it does not.
          </p>

          <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                  <th className="px-4 py-2.5">Account</th>
                  <th className="px-4 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Can</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                <Account
                  email="owner-a"
                  org="Northwind Support"
                  can="Everything — including db_write and notify nodes, webhook triggers and LLM connections."
                />
                <Account
                  email="editor-a"
                  org="Northwind Support"
                  can="Build, run and approve. Refused the owner-only node types, by the database."
                />
                <Account
                  email="viewer-a"
                  org="Northwind Support"
                  can="Read. Cannot start a run or clear a gate."
                />
                <Account
                  email="owner-b"
                  org="Contoso Logistics"
                  can="Org B only — and cannot see that Org A exists."
                />
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
              Addresses are <Code>&lt;name&gt;@agentflow.test</Code>, password{' '}
              <Code>Password123!</Code>, created by <Code>npm run seed</Code>. Signing up
              with your own email works too — a new account belongs to no organization yet,
              so it asks you to create one.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6">
          <Logo className="h-7 opacity-60" />
          <p className="text-xs leading-relaxed text-ink-3">
            Setup, the architecture write-up and a demo script are in <Code>README.md</Code>,{' '}
            <Code>ARCHITECTURE.md</Code> and <Code>DEMO.md</Code>.{' '}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------- fragments */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{children}</p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.82em] text-ink-2">
      {children}
    </code>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface px-4 py-4">
      <p className="text-2xl leading-none font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1.5 text-xs text-ink-3">{label}</p>
    </div>
  );
}

/**
 * A code panel with a caption bar — not fake browser chrome with three coloured
 * dots, which is the tell that a page was assembled rather than written.
 */
function Panel({ label, code, tone }: { label: string; code: string; tone?: 'request' }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
        <span
          className={
            tone === 'request' ? 'size-1.5 rounded-full bg-accent' : 'size-1.5 rounded-full bg-ok'
          }
        />
        <span className="truncate text-[11px] font-medium text-ink-3">{label}</span>
      </div>
      <pre className="scroll-thin overflow-x-auto px-3.5 py-3 font-mono text-[11.5px] leading-[1.75] text-ink-2">
        {code}
      </pre>
    </div>
  );
}

function Account({ email, org, can }: { email: string; org: string; can: string }) {
  return (
    <tr>
      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-ink">{email}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{org}</td>
      <td className="px-4 py-2.5 text-ink-3">{can}</td>
    </tr>
  );
}
