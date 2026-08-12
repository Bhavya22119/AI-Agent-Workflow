'use client';

/**
 * The node canvas.
 *
 * React Flow (MIT) provides pan, zoom, node dragging and connection dragging;
 * everything on top — the node/edge components, the palette, the inspector and
 * the mapping to `workflow_steps.next` — is this app's own.
 *
 * ---------------------------------------------------------------------------
 *  Who owns what
 * ---------------------------------------------------------------------------
 *  The parent owns the workflow: the `steps` and `triggers` draft arrays that
 *  will be saved. React Flow owns the *transient* view of them, because a drag
 *  emits a position change on every animation frame and re-deriving the node
 *  list from the draft on each one would fight the drag and make it stutter.
 *
 *  So: every change is applied to the local flow state immediately (smooth), and
 *  only committed back to the draft when it means something — a drag that ended,
 *  a node removed, a connection made. When the draft does change, the local
 *  state is re-derived, which is the standard "adjust state during render"
 *  pattern rather than an effect.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type IsValidConnection,
} from '@xyflow/react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canUseStepType, canUseTriggerType, TRIGGER_CATALOG } from '@/lib/step-catalog';
import type { NodeIssue } from '@/lib/validation';
import type { DraftStep, DraftTrigger, Json, OrgRole, StepType, TriggerType } from '@/lib/types';
import { edgeTypes } from './edges';
import {
  buildFlow,
  connectSteps,
  createStep,
  disconnect,
  moveStep,
  moveTrigger,
  removeStep,
  suggestPlacement,
  triggerNodeId,
  TRIGGER_NODE_PREFIX,
  type CanvasNode,
  type HandleId,
  type NodeRunState,
} from './graph-model';
import { StepInspector, TriggerInspector, type LlmConnectionContext } from './inspector';
import { NodePalette } from './node-palette';
import { nodeTypes } from './nodes';

export interface WorkflowCanvasProps {
  orgId: string;
  role: OrgRole | null;
  readOnly: boolean;
  steps: DraftStep[];
  triggers: DraftTrigger[];
  /** Accepts an updater so rapid edits always build on the latest draft. */
  onStepsChange: (update: (steps: DraftStep[]) => DraftStep[]) => void;
  onTriggersChange: (update: (triggers: DraftTrigger[]) => DraftTrigger[]) => void;
  /** Live statuses keyed by step key, when the canvas is showing a run. */
  statusByKey?: Map<string, NodeRunState>;
  /** Validation problems keyed by step key, drawn as a badge on the node. */
  issuesByKey?: Map<string, NodeIssue[]>;
  /** Start waiting for an external call to this trigger type. */
  onListen?: (triggerType: string) => void;
  /** The workflow's own Active switch — one of the two gates on external calls. */
  workflowActive?: boolean;
  /** The organization's LLM endpoints, offered by llm_call nodes. */
  llm?: LlmConnectionContext;
  className?: string;
  /** Extra controls rendered in the canvas's top-left panel. */
  toolbar?: React.ReactNode;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  orgId,
  role,
  readOnly,
  steps,
  triggers,
  onStepsChange,
  onTriggersChange,
  statusByKey,
  issuesByKey,
  onListen,
  workflowActive = true,
  llm,
  className,
  toolbar,
}: WorkflowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const [selected, setSelected] = useState<
    { kind: 'step'; key: string } | { kind: 'trigger'; id: string } | null
  >(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    key: string;
    handle: HandleId;
    drop: { x: number; y: number };
  } | null>(null);

  /**
   * A value-equality digest of everything the graph is derived from. Comparing
   * this rather than object identities means a subscription tick that changes
   * nothing does not rebuild the graph — which is what kept a live run from
   * flickering.
   */
  const signature = useMemo(
    () =>
      JSON.stringify([
        steps,
        triggers,
        readOnly,
        role,
        workflowActive,
        statusByKey ? [...statusByKey.entries()].sort() : null,
        issuesByKey ? [...issuesByKey.entries()].sort() : null,
      ]),
    [steps, triggers, readOnly, role, workflowActive, statusByKey, issuesByKey],
  );

  const derived = useMemo(
    () =>
      buildFlow({
        steps,
        triggers,
        readOnly,
        canUseStepType: (type) => canUseStepType(type, role),
        canUseTriggerType: (trigger) => canUseTriggerType(trigger.type, role),
        statusByKey,
        issuesByKey,
        workflowActive,
      }),
    // `signature` stands in for these by value; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const [flow, setFlow] = useState<{
    signature: string;
    nodes: CanvasNode[];
    edges: Edge[];
  }>(() => ({ signature, nodes: derived.nodes, edges: derived.edges }));

  // Adjusting state during render when the derived graph changes: the documented
  // React pattern for "props changed, reset derived state", and the reason a
  // drag stays smooth (local positions survive re-renders that change nothing).
  if (flow.signature !== signature) {
    setFlow({ signature, nodes: derived.nodes, edges: derived.edges });
  }

  /* --------------------------------------------------------------- changes */

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      // Apply everything locally first so dragging tracks the pointer exactly.
      setFlow((current) => ({
        ...current,
        nodes: applyNodeChanges(changes, current.nodes),
      }));

      for (const change of changes) {
        // Commit a move only when the drag finishes — not on every frame.
        if (change.type === 'position' && change.position && change.dragging === false) {
          const { id, position } = change;
          if (id.startsWith(TRIGGER_NODE_PREFIX)) {
            onTriggersChange((current) => moveTrigger(current, id, position.x, position.y));
          } else {
            onStepsChange((current) => moveStep(current, id, position.x, position.y));
          }
        }
        if (change.type === 'remove' && !readOnly) {
          const { id } = change;
          if (id.startsWith(TRIGGER_NODE_PREFIX)) {
            onTriggersChange((current) => current.filter((t) => triggerNodeId(t) !== id));
          } else {
            onStepsChange((current) => removeStep(current, id));
          }
          setSelected(null);
        }
      }
    },
    [readOnly, onStepsChange, onTriggersChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      setFlow((current) => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }));
      if (readOnly) return;

      for (const change of changes) {
        if (change.type !== 'remove') continue;
        // Edge ids encode the connection: "<sourceKey>:<handle>-><targetKey>".
        const [left] = change.id.split('->');
        const [sourceKey, handle] = left.split(':');
        if (!sourceKey || !handle) continue;
        onStepsChange((current) => disconnect(current, sourceKey, handle as HandleId));
      }
    },
    [readOnly, onStepsChange],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      if (connection.source.startsWith(TRIGGER_NODE_PREFIX)) return;
      if (!connection.target || connection.target.startsWith(TRIGGER_NODE_PREFIX)) return;
      const handle = (connection.sourceHandle ?? 'main') as HandleId;
      onStepsChange((current) =>
        connectSteps(current, connection.source, handle, connection.target),
      );
    },
    [readOnly, onStepsChange],
  );

  /**
   * Each output drives at most one connection, because the engine follows exactly
   * one edge per handle. Re-connecting an output replaces what was there; this
   * check stops a connection into a trigger or back onto the same node.
   */
  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;
    if (connection.source.startsWith(TRIGGER_NODE_PREFIX)) return false;
    if (connection.target.startsWith(TRIGGER_NODE_PREFIX)) return false;
    return true;
  }, []);

  /** Dropping a connection on empty canvas opens the palette to add + wire up. */
  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      state: {
        isValid: boolean | null;
        fromHandle?: { nodeId?: string | null; id?: string | null } | null;
      },
    ) => {
      if (readOnly || state.isValid) return;
      const nodeId = state.fromHandle?.nodeId;
      if (!nodeId || nodeId.startsWith(TRIGGER_NODE_PREFIX)) return;

      const point =
        'clientX' in event
          ? { x: event.clientX, y: event.clientY }
          : { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };

      setPendingConnection({
        key: nodeId,
        handle: (state.fromHandle?.id ?? 'main') as HandleId,
        drop: screenToFlowPosition(point),
      });
      setPaletteOpen(true);
    },
    [readOnly, screenToFlowPosition],
  );

  /* --------------------------------------------------------------- adding */

  const addStep = useCallback(
    (type: StepType) => {
      const connection = pendingConnection;
      // Built from the freshest draft, so adding two nodes quickly cannot
      // generate the same key twice or stack them at the same coordinates.
      onStepsChange((current) => {
        const placement = connection?.drop ?? suggestPlacement(current);
        const step = createStep(type, current, placement);
        const next = [...current, step];
        setSelected({ kind: 'step', key: step.key });
        return connection
          ? connectSteps(next, connection.key, connection.handle, step.key)
          : next;
      });
      setPaletteOpen(false);
      setPendingConnection(null);
    },
    [pendingConnection, onStepsChange],
  );

  const addTrigger = useCallback(
    (type: TriggerType) => {
      onTriggersChange((current) => {
        // Built against the keys actually in use, not the array length: deleting a
        // trigger and adding another would otherwise reuse a live key, and two
        // triggers sharing one key are edited as if they were the same trigger.
        const used = new Set(current.map((trigger) => trigger.key));
        let key = `draft-${type}-1`;
        for (let index = 1; used.has(key); index += 1) key = `draft-${type}-${index + 1}`;

        // Numbered from the count of this type, so the second webhook is "Webhook 2"
        // rather than another node called "Webhook".
        const sameType = current.filter((trigger) => trigger.type === type).length;
        const spec = TRIGGER_CATALOG[type];
        const label = sameType === 0 ? spec.label : `${spec.label} ${sameType + 1}`;

        return [
          ...current,
          {
            key,
            type,
            config: {
              label,
              ...(type === 'database_event' ? { source_key: 'support_ticket' } : {}),
              ui: { x: -340, y: current.length * 100 - 110 } as unknown as Json,
            },
            cron_expression: type === 'scheduled' ? '*/5 * * * *' : null,
            is_enabled: true,
          },
        ];
      });
      setPaletteOpen(false);
    },
    [onTriggersChange],
  );

  /* ------------------------------------------------------------ inspector */

  const selectedStep =
    selected?.kind === 'step' ? steps.find((s) => s.key === selected.key) : undefined;
  const selectedTrigger =
    selected?.kind === 'trigger'
      ? triggers.find((t) => triggerNodeId(t) === selected.id)
      : undefined;

  return (
    <div
      className={
        className ??
        'relative h-[70vh] min-h-[520px] w-full overflow-hidden rounded-card border border-line bg-canvas'
      }
    >
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeClick={(_event, node) => {
          setPaletteOpen(false);
          setSelected(
            node.id.startsWith(TRIGGER_NODE_PREFIX)
              ? { kind: 'trigger', id: node.id }
              : { kind: 'step', key: node.id },
          );
        }}
        onPaneClick={() => {
          setSelected(null);
          setPendingConnection(null);
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.75}
        // React Flow's attribution stays visible: hiding it requires a Pro
        // licence, and this project does not have one.
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} className="!bg-canvas" />
        <Controls showInteractive={false} />
        {/* Colours come from CSS, not from nodeColor/maskColor: React Flow writes
            those as SVG presentation attributes, where var() does not resolve —
            which is why the minimap rendered as a white block. */}
        <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ width: 148, height: 96 }} />

        {toolbar ? (
          <Panel position="top-left" className="!m-2.5">
            {toolbar}
          </Panel>
        ) : null}

        {readOnly ? null : (
          <Panel position="top-right" className="!m-2.5">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setPendingConnection(null);
                setSelected(null);
                setPaletteOpen((open) => !open);
              }}
            >
              <Plus className="size-4" />
              Add node
            </Button>
          </Panel>
        )}

        {steps.length === 0 && !readOnly ? (
          <Panel position="top-center" className="!mt-20">
            <button
              type="button"
              onClick={() => {
                setPendingConnection(null);
                setPaletteOpen(true);
              }}
              className="animate-fade-rise group rounded-card border border-dashed border-line-strong bg-surface/85 px-6 py-5 text-center backdrop-blur transition-colors hover:border-accent"
            >
              <span className="mx-auto grid size-9 place-items-center rounded-full bg-accent-soft text-accent-ink transition-transform group-hover:scale-110">
                <Plus className="size-5" />
              </span>
              <span className="mt-2 block text-sm font-medium text-ink">Add your first node</span>
              <span className="mt-1 block max-w-xs text-xs leading-relaxed text-ink-3">
                Start with an LLM call, then drag from its right-hand dot to chain the next one.
                Your trigger is already wired up on the left.
              </span>
            </button>
          </Panel>
        ) : null}
      </ReactFlow>

      <NodePalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPendingConnection(null);
        }}
        canUseStepType={(type) => canUseStepType(type, role)}
        canUseTriggerType={(type) => canUseTriggerType(type, role)}
        hasManualTrigger={triggers.some((trigger) => trigger.type === 'manual')}
        onAddStep={addStep}
        onAddTrigger={addTrigger}
        connectingFrom={pendingConnection}
      />

      {selectedStep ? (
        <StepInspector
          step={selectedStep}
          locked={readOnly || !canUseStepType(selectedStep.type, role)}
          llm={llm}
          onChange={(nextStep) =>
            onStepsChange((current) =>
              current.map((step) => (step.key === nextStep.key ? nextStep : step)),
            )
          }
          onDelete={() => {
            onStepsChange((current) => removeStep(current, selectedStep.key));
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {selectedTrigger ? (
        <TriggerInspector
          trigger={selectedTrigger}
          orgId={orgId}
          locked={readOnly || !canUseTriggerType(selectedTrigger.type, role)}
          workflowActive={workflowActive}
          onListen={onListen}
          onChange={(nextTrigger) =>
            onTriggersChange((current) =>
              current.map((trigger) => (trigger.key === nextTrigger.key ? nextTrigger : trigger)),
            )
          }
          onDelete={() => {
            onTriggersChange((current) =>
              current.filter((trigger) => trigger.key !== selectedTrigger.key),
            );
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
