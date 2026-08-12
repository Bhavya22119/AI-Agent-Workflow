'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { HelpTip } from '@/components/ui/help-tip';
import type { StepField, StepSpec } from '@/lib/step-catalog';
import type { DraftStep, Json } from '@/lib/types';

/** Renders the config editor for one step, driven by the catalog's field list. */
export function StepConfigEditor({
  spec,
  step,
  disabled,
  onChange,
}: {
  spec: StepSpec;
  step: DraftStep;
  disabled: boolean;
  onChange: (next: DraftStep) => void;
}) {
  function setConfigValue(key: string, value: Json) {
    onChange({ ...step, config: { ...step.config, [key]: value } });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Step name">
          <Input
            value={step.name}
            disabled={disabled}
            onChange={(event) => onChange({ ...step, name: event.target.value })}
          />
        </Field>
        {spec.type === 'llm_call' || spec.type === 'http_request' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Retries"
              hint={
                <HelpTip side="left">
                  Extra attempts after the first, for this node only. A 5xx or 429 is retried; a
                  4xx is treated as a real answer and not retried.
                </HelpTip>
              }
            >
              <Input
                type="number"
                min={0}
                max={5}
                value={step.retry_limit}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...step, retry_limit: clampNumber(event.target.value, 0, 5, 1) })
                }
              />
            </Field>
            <Field label="Timeout (ms)">
              <Input
                type="number"
                min={1000}
                max={60000}
                step={1000}
                value={step.timeout_ms}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...step,
                    timeout_ms: clampNumber(event.target.value, 1000, 60000, 25000),
                  })
                }
              />
            </Field>
          </div>
        ) : null}
      </div>

      {spec.fields.map((field) => (
        <ConfigField
          key={field.key}
          field={field}
          value={step.config[field.key]}
          disabled={disabled}
          onChange={(value) => setConfigValue(field.key, value)}
        />
      ))}
    </div>
  );
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function ConfigField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: StepField;
  value: Json | undefined;
  disabled: boolean;
  onChange: (value: Json) => void;
}) {
  // Explanations live behind a `?` so a panel is a set of controls, not an essay.
  const hint = field.help ? <HelpTip side="left">{field.help}</HelpTip> : undefined;

  switch (field.kind) {
    case 'textarea':
      return (
        <Field label={field.label} hint={hint}>
          <Textarea
            rows={field.rows ?? 3}
            disabled={disabled}
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );

    case 'number':
      return (
        <Field label={field.label} hint={hint}>
          <Input
            type="number"
            min={field.min}
            max={field.max}
            step="any"
            disabled={disabled}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </Field>
      );

    case 'select':
      return (
        <Field label={field.label} hint={hint}>
          <Select
            disabled={disabled}
            value={toSelectValue(field.key, value)}
            onChange={(event) => onChange(fromSelectValue(field.key, event.target.value))}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case 'keyvalue':
      return (
        <KeyValueField
          label={field.label}
          hint={hint}
          disabled={disabled}
          value={isRecord(value) ? (value as Record<string, Json>) : {}}
          onChange={onChange}
        />
      );

    case 'json':
      return (
        <JsonField
          label={field.label}
          hint={hint}
          rows={field.rows ?? 4}
          disabled={disabled}
          value={value}
          onChange={onChange}
        />
      );

    default:
      return (
        <Field label={field.label} hint={hint}>
          <Input
            disabled={disabled}
            placeholder={field.placeholder}
            value={typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

function isRecord(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** approver_roles is stored as an array but chosen from a single dropdown. */
function toSelectValue(key: string, value: Json | undefined): string {
  if (key === 'approver_roles') {
    return Array.isArray(value) ? value.map(String).join(',') : 'owner,editor';
  }
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function fromSelectValue(key: string, raw: string): Json {
  if (key === 'approver_roles') return raw.split(',').filter(Boolean);
  return raw;
}

function KeyValueField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: Record<string, Json>;
  disabled: boolean;
  onChange: (value: Json) => void;
}) {
  const entries = Object.entries(value);

  function update(nextEntries: Array<[string, Json]>) {
    onChange(Object.fromEntries(nextEntries.filter(([key]) => key.trim() !== '')) as Json);
  }

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {entries.map(([key, entryValue], position) => (
          <div key={`${key}-${position}`} className="flex gap-2">
            <Input
              aria-label={`${label} name ${position + 1}`}
              className="flex-1"
              disabled={disabled}
              value={key}
              placeholder="content-type"
              onChange={(event) => {
                const next = [...entries] as Array<[string, Json]>;
                next[position] = [event.target.value, entryValue];
                update(next);
              }}
            />
            <Input
              aria-label={`${label} value ${position + 1}`}
              className="flex-1"
              disabled={disabled}
              value={typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue)}
              placeholder="application/json"
              onChange={(event) => {
                const next = [...entries] as Array<[string, Json]>;
                next[position] = [key, event.target.value];
                update(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Remove ${key || 'entry'}`}
              onClick={() => update(entries.filter((_, i) => i !== position) as Array<[string, Json]>)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => update([...entries, ['', '']] as Array<[string, Json]>)}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
    </Field>
  );
}

/**
 * JSON editor that also accepts a bare template string, because
 * `value: "{{prev}}"` is a perfectly good db_write config and should not have to
 * be typed as `"{{prev}}"` with quotes.
 */
/** Parses editor text into a config value, tolerating templates and bad JSON. */
function parseJsonInput(raw: string): { value: Json; invalid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: '', invalid: false };
  // A template or plain string ({{prev}}, "sentiment") is kept verbatim.
  if (!/^[[{"]/.test(trimmed)) return { value: raw, invalid: false };
  try {
    return { value: JSON.parse(trimmed) as Json, invalid: false };
  } catch {
    return { value: raw, invalid: true };
  }
}

function JsonField({
  label,
  hint,
  rows,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  rows: number;
  value: Json | undefined;
  disabled: boolean;
  onChange: (value: Json) => void;
}) {
  const serialized = serialize(value);

  // The raw text the user typed is kept alongside the serialized value it
  // produced. When the incoming value no longer matches (the step was reordered,
  // reset, or edited elsewhere) the local text is simply ignored — no effect
  // needed to re-sync, and no render where the two disagree.
  const [local, setLocal] = useState<{ committed: string; text: string; invalid: boolean } | null>(
    null,
  );
  const useLocal = local !== null && local.committed === serialized;
  const text = useLocal ? local.text : serialized;
  const invalid = useLocal ? local.invalid : false;

  return (
    <Field
      label={label}
      hint={hint}
      help={invalid ? 'Not valid JSON — it will be saved as plain text.' : undefined}
    >
      <Textarea
        rows={rows}
        disabled={disabled}
        className="font-mono text-xs"
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = parseJsonInput(raw);
          setLocal({ committed: serialize(parsed.value), text: raw, invalid: parsed.invalid });
          onChange(parsed.value);
        }}
      />
    </Field>
  );
}

function serialize(value: Json | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
