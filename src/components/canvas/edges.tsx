'use client';

/**
 * Canvas edge component: a bezier with an optional handle label, and a delete
 * button that appears on hover so a connection can be removed without having to
 * discover that Backspace works.
 */
import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const FlowEdge = memo(function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const { setEdges } = useReactFlow();

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });

  const derived = data?.derived === true;
  const handle = data?.handle as string | undefined;
  const label = data?.label as string | undefined;
  const active = data?.active === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={22}
        className={active ? 'rf-edge-live' : undefined}
        style={{
          stroke: selected
            ? 'var(--color-accent)'
            : active
              ? 'var(--color-ok)'
              : handle === 'true'
                ? 'var(--color-ok)'
                : handle === 'false'
                  ? 'var(--color-danger)'
                  : 'var(--color-line-strong)',
          strokeWidth: selected || active ? 2.5 : 2,
          strokeDasharray: derived ? '5 5' : undefined,
          opacity: derived && data?.enabled === false ? 0.4 : 1,
        }}
      />

      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {label ? (
            <span
              className={cn(
                'rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold',
                label === 'true' ? 'text-ok' : 'text-danger',
              )}
            >
              {label}
            </span>
          ) : null}

          {!derived && (hovered || selected) ? (
            <button
              type="button"
              aria-label="Remove this connection"
              // Removing the React Flow edge triggers onEdgesDelete, which is
              // where the underlying `next` entry is actually cleared.
              onClick={() => setEdges((edges) => edges.filter((edge) => edge.id !== id))}
              className={cn(
                'grid size-5 place-items-center rounded-full border border-line bg-surface text-ink-3 shadow-sm transition-colors hover:border-danger hover:text-danger',
                label ? 'mt-1' : '',
              )}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const edgeTypes = { flow: FlowEdge };
