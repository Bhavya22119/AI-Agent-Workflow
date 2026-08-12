import Link from 'next/link';
import {
  Bell,
  Brain,
  Clock,
  Database,
  GitBranch,
  Globe,
  MousePointerClick,
  ShieldCheck,
  Webhook,
  Workflow,
} from 'lucide-react';
import { HeaderCta, LandingCta } from '@/components/landing-cta';

/**
 * Landing page. A server component with no auth gate, so hitting the root URL
 * paints immediately instead of showing a spinner while a session is resolved —
 * only the call-to-action knows whether you are signed in.
 */

const STEP_TYPES = [
  { icon: Brain, label: 'llm_call', text: 'Prompt a real language model and capture the answer.' },
  { icon: Globe, label: 'http_request', text: 'Call any external API, with retries and a timeout.' },
  {
    icon: GitBranch,
    label: 'conditional_branch',
    text: "Branch on the previous step's output; skip the path not taken.",
  },
  {
    icon: ShieldCheck,
    label: 'approval_gate',
    text: 'Pause the run until someone with the right role approves it.',
  },
  { icon: Database, label: 'db_write', text: 'Persist a result into your own tables. Owner only.' },
  {
    icon: Bell,
    label: 'notify',
    text: 'Queue a Slack or email alert, delivered by an Event Trigger. Owner only.',
  },
];

const TRIGGERS = [
  { icon: MousePointerClick, label: 'Manual', text: 'An owner or editor presses Run.' },
  { icon: Webhook, label: 'Webhook', text: 'A Hasura Action an external system calls with a secret.' },
  { icon: Clock, label: 'Scheduled', text: 'A cron expression, evaluated by a Hasura Cron Trigger.' },
  { icon: Database, label: 'Database event', text: 'A row lands in a watched table and a run starts.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
              <Workflow className="size-4" />
            </span>
            <span className="text-sm font-semibold text-ink">Agent Flow</span>
          </div>
          <HeaderCta />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="py-14 sm:py-20">
          <p className="text-xs font-medium tracking-widest text-accent uppercase">
            Nhost · Hasura · PostgreSQL · Next.js
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-4xl">
            Chain AI agent steps into workflows your whole organization can trust.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">
            Build a workflow from six step types, start it four different ways, and watch it
            execute step by step over a live GraphQL subscription — including the moment it
            pauses for a human to approve. Every action is checked against two independent
            permission layers, so an editor in one organization can never touch another&apos;s.
          </p>
          <div className="mt-7">
            <LandingCta />
          </div>
        </section>

        <section className="grid gap-3 border-t border-line py-10 sm:grid-cols-3">
          <Highlight
            title="Two permission layers"
            body="Org + role scoping resolved through org_members on every request, plus step-level gating that only lets an owner add a db_write, a notify step or a webhook trigger."
          />
          <Highlight
            title="Approvals that really pause"
            body="A run's position is rows in Postgres, not a held connection. Reaching a gate leaves the run paused; approving it resumes from the next step and records who decided."
          />
          <Highlight
            title="Proven, not asserted"
            body="A 75-check suite runs against the live backend with real user tokens: cross-org isolation against direct id guessing, retry counts, quota refusal, and every trigger type."
          />
        </section>

        <section className="border-t border-line py-10">
          <h2 className="text-sm font-semibold text-ink">Step types</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEP_TYPES.map((step) => (
              <li key={step.label} className="rounded-card border border-line bg-surface p-4">
                <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                  <step.icon className="size-4" />
                </span>
                <p className="mt-2.5 font-mono text-xs font-medium text-ink">{step.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-3">{step.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-10">
          <h2 className="text-sm font-semibold text-ink">Ways a run can start</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRIGGERS.map((trigger) => (
              <li key={trigger.label} className="rounded-card border border-line bg-surface p-4">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <trigger.icon className="size-4 text-ink-3" />
                  {trigger.label}
                </span>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{trigger.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-10">
          <div className="rounded-card border border-line bg-surface-2 p-5">
            <h2 className="text-sm font-semibold text-ink">Seeded demo accounts</h2>
            <p className="mt-1 text-sm text-ink-3">
              Created by <code className="font-mono text-xs">npm run seed</code>. Password for
              every account: <code className="font-mono text-xs">Password123!</code>
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-md text-left text-sm">
                <thead>
                  <tr className="text-xs tracking-wide text-ink-3 uppercase">
                    <th className="pb-2 pr-4 font-medium">Account</th>
                    <th className="pb-2 pr-4 font-medium">Organization</th>
                    <th className="pb-2 font-medium">Can</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  <Row
                    email="owner-a@agentflow.test"
                    org="A — Northwind Support"
                    can="Everything, including db_write / notify steps and webhook triggers."
                  />
                  <Row
                    email="editor-a@agentflow.test"
                    org="A — Northwind Support"
                    can="Build and run workflows, approve gates. Not the owner-only step types."
                  />
                  <Row
                    email="viewer-a@agentflow.test"
                    org="A — Northwind Support"
                    can="Read only. Cannot trigger a run or approve anything."
                  />
                  <Row
                    email="owner-b@agentflow.test"
                    org="B — Contoso Logistics"
                    can="Only Org B — and must not be able to see Org A at all."
                  />
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Signing up with your own email works too, but a brand-new account belongs to no
              organization yet, so you will be asked to create one first.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-ink-3">
          <p>Agent Flow — AI agent workflow builder.</p>
          <p>
            Setup, architecture and the demo script are in the repository&apos;s README,
            ARCHITECTURE.md and DEMO.md.{' '}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Highlight({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{body}</p>
    </div>
  );
}

function Row({ email, org, can }: { email: string; org: string; can: string }) {
  return (
    <tr>
      <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap text-ink-2">{email}</td>
      <td className="py-2 pr-4 text-ink-2">{org}</td>
      <td className="py-2 text-ink-3">{can}</td>
    </tr>
  );
}
