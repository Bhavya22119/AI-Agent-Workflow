import os

base_dir = r"c:\Users\Bhavya\Desktop\AI Agent Workflow Builder"
os.makedirs(os.path.join(base_dir, "nhost", "migrations", "default", "1_initial"), exist_ok=True)
os.makedirs(os.path.join(base_dir, "nhost", "metadata", "databases", "default", "tables"), exist_ok=True)
os.makedirs(os.path.join(base_dir, "nhost", "seeds", "default"), exist_ok=True)

up_sql = """CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed');
CREATE TYPE step_run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'skipped');

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    quota_allowed int DEFAULT 100,
    quota_used int DEFAULT 0,
    usage_period_start timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE org_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role org_role NOT NULL DEFAULT 'viewer',
    created_at timestamptz DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE TABLE workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE workflow_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    position int NOT NULL,
    type step_type NOT NULL,
    config jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(workflow_id, position)
);

CREATE TABLE workflow_triggers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    type trigger_type NOT NULL,
    config jsonb DEFAULT '{}',
    webhook_secret text,
    enabled bool DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE workflow_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status run_status NOT NULL DEFAULT 'pending',
    started_by uuid,
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    context jsonb DEFAULT '{}'
);

CREATE TABLE step_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    position int NOT NULL,
    status step_run_status NOT NULL DEFAULT 'pending',
    input jsonb,
    output jsonb,
    error text,
    attempt_count int DEFAULT 0,
    approved_by uuid,
    approved_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz
);

CREATE TABLE workflow_outputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE watched_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_user_org ON org_members(user_id, org_id);
CREATE INDEX idx_workflows_org_id ON workflows(org_id);
CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_org_id ON workflow_runs(org_id);
CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_workflow_step_id ON step_runs(workflow_step_id);
CREATE INDEX idx_workflow_outputs_org_id ON workflow_outputs(org_id);
CREATE INDEX idx_workflow_outputs_run_id ON workflow_outputs(workflow_run_id);
CREATE INDEX idx_watched_records_org_id ON watched_records(org_id);

CREATE VIEW org_usage_summary AS
SELECT
    o.id as org_id,
    o.name,
    o.quota_allowed,
    o.quota_used,
    o.usage_period_start,
    (o.quota_allowed - o.quota_used) as quota_remaining,
    ROUND((o.quota_used::numeric / NULLIF(o.quota_allowed, 0)::numeric) * 100, 2) as usage_percentage,
    (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.org_id = o.id) as total_runs,
    (SELECT COUNT(*) FROM workflows w WHERE w.org_id = o.id) as total_workflows
FROM organizations o;

CREATE OR REPLACE FUNCTION increment_quota_used(org_uuid uuid)
RETURNS void AS $$
BEGIN
    UPDATE organizations SET quota_used = quota_used + 1 WHERE id = org_uuid;
END;
$$ LANGUAGE plpgsql;
"""

down_sql = """DROP FUNCTION IF EXISTS increment_quota_used(uuid);
DROP VIEW IF EXISTS org_usage_summary;

DROP INDEX IF EXISTS idx_watched_records_org_id;
DROP INDEX IF EXISTS idx_workflow_outputs_run_id;
DROP INDEX IF EXISTS idx_workflow_outputs_org_id;
DROP INDEX IF EXISTS idx_step_runs_workflow_step_id;
DROP INDEX IF EXISTS idx_step_runs_workflow_run_id;
DROP INDEX IF EXISTS idx_workflow_runs_org_id;
DROP INDEX IF EXISTS idx_workflow_runs_workflow_id;
DROP INDEX IF EXISTS idx_workflow_triggers_workflow_id;
DROP INDEX IF EXISTS idx_workflow_steps_workflow_id;
DROP INDEX IF EXISTS idx_workflows_org_id;
DROP INDEX IF EXISTS idx_org_members_user_org;
DROP INDEX IF EXISTS idx_org_members_user_id;
DROP INDEX IF EXISTS idx_org_members_org_id;

DROP TABLE IF EXISTS watched_records;
DROP TABLE IF EXISTS workflow_outputs;
DROP TABLE IF EXISTS step_runs;
DROP TABLE IF EXISTS workflow_runs;
DROP TABLE IF EXISTS workflow_triggers;
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS workflows;
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS organizations;

DROP TYPE IF EXISTS step_run_status;
DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;
"""

seed_sql = """-- 1. Create organizations
INSERT INTO organizations (id, name) VALUES 
('11111111-1111-1111-1111-111111111111', 'Org A Demo'),
('22222222-2222-2222-2222-222222222222', 'Org B Demo');

-- 2. NOTE: Users must be created via the Nhost Auth signup flow.
-- Once created, you can insert org_members records referencing their auth.users id.
-- Example (commented out):
-- INSERT INTO org_members (org_id, user_id, role) VALUES 
-- ('11111111-1111-1111-1111-111111111111', '<your-user-uuid-here>', 'owner');

-- 4. Create demo workflow in Org A
INSERT INTO workflows (id, org_id, name, description) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Sentiment Analysis Demo', 'A demo workflow to analyze sentiment.');

INSERT INTO workflow_steps (workflow_id, position, type, config) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'llm_call', '{"prompt": "Analyze the sentiment of the following text: {{input}}. Respond with exactly one word: positive, negative, or neutral.", "model": "llama3-8b-8192"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'http_request', '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}, "body": "{\\"sentiment\\": \\"{{prev_output}}\\"}"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 'conditional_branch', '{"condition": {"path": "$.result", "operator": "contains", "value": "positive"}, "true_next": 4, "false_next": 5}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 'approval_gate', '{"message": "The sentiment analysis returned a positive result. Please review and approve to save."}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'db_write', '{"key": "sentiment_result", "value_template": "{{prev_output}}"}');

INSERT INTO workflow_triggers (workflow_id, type, enabled) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manual', true);

INSERT INTO workflow_triggers (workflow_id, type, webhook_secret, enabled) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webhook', 'demo-webhook-secret-123', true);
"""

nhost_toml = """[global]
[hasura]
version = "v2.33.0"
[auth]
version = "0.30.0"
[storage]
version = "0.3.3"
[functions]
"""

# Metadatas
def write_file(path, content):
    with open(os.path.join(base_dir, path), 'w') as f:
        f.write(content)

write_file("nhost/migrations/default/1_initial/up.sql", up_sql)
write_file("nhost/migrations/default/1_initial/down.sql", down_sql)
write_file("nhost/seeds/default/001_seed.sql", seed_sql)
write_file("nhost/nhost.toml", nhost_toml)

write_file("nhost/metadata/version.yaml", "version: 3\n")
write_file("nhost/metadata/databases/databases.yaml", """- name: default
  kind: postgres
  configuration:
    connection_info:
      database_url:
        from_env: HASURA_GRAPHQL_DATABASE_URL
      pool_settings:
        idle_timeout: 180
        max_connections: 50
  tables: "!include default/tables/tables.yaml"
  functions: "!include default/tables/functions.yaml"
""")

write_file("nhost/metadata/actions.graphql", """type Mutation {
  triggerWorkflowRun(workflow_id: uuid!): TriggerWorkflowRunOutput
  approveStep(step_run_id: uuid!): ApproveStepOutput
  invokeWorkflowWebhook(workflow_id: uuid!, secret: String!, payload: jsonb): TriggerWorkflowRunOutput
}

type TriggerWorkflowRunOutput {
  workflow_run_id: uuid!
  status: String!
}

type ApproveStepOutput {
  workflow_run_id: uuid!
  status: String!
}
""")

write_file("nhost/metadata/actions.yaml", """actions:
  - name: triggerWorkflowRun
    definition:
      kind: synchronous
      handler: '{{NHOST_FUNCTIONS_URL}}/v1/trigger-workflow-run'
      forward_client_headers: true
    permissions:
      - role: owner
      - role: editor
  - name: approveStep
    definition:
      kind: synchronous
      handler: '{{NHOST_FUNCTIONS_URL}}/v1/approve-step'
      forward_client_headers: true
    permissions:
      - role: owner
      - role: editor
  - name: invokeWorkflowWebhook
    definition:
      kind: synchronous
      handler: '{{NHOST_FUNCTIONS_URL}}/v1/invoke-workflow-webhook'
    permissions: []
custom_types:
  input_objects: []
  objects:
    - name: TriggerWorkflowRunOutput
    - name: ApproveStepOutput
""")

write_file("nhost/metadata/databases/default/tables/functions.yaml", "[]\n")

tables = [
  "public_organizations.yaml",
  "public_org_members.yaml",
  "public_workflows.yaml",
  "public_workflow_steps.yaml",
  "public_workflow_triggers.yaml",
  "public_workflow_runs.yaml",
  "public_step_runs.yaml",
  "public_workflow_outputs.yaml",
  "public_watched_records.yaml",
  "public_org_usage_summary.yaml"
]

write_file("nhost/metadata/databases/default/tables/tables.yaml", "\n".join([f"- \"!include {t}\"" for t in tables]) + "\n")

# table yamls
organizations_yaml = """table:
  name: organizations
  schema: public
array_relationships:
  - name: org_members
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: org_members
          schema: public
  - name: workflows
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: workflows
          schema: public
  - name: workflow_runs
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: workflow_runs
          schema: public
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: id
              - role:
                  _eq: viewer
update_permissions:
  - role: owner
    permission:
      columns:
        - name
        - quota_allowed
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: id
              - role:
                  _eq: owner
"""

org_members_yaml = """table:
  name: org_members
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
delete_permissions:
  - role: owner
    permission:
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
"""

workflows_yaml = """table:
  name: workflows
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
array_relationships:
  - name: workflow_steps
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_steps
          schema: public
  - name: workflow_triggers
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_triggers
          schema: public
  - name: workflow_runs
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_runs
          schema: public
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
delete_permissions:
  - role: owner
    permission:
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
"""

workflow_steps_yaml = """table:
  name: workflow_steps
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
array_relationships:
  - name: step_runs
    using:
      foreign_key_constraint_on:
        column: workflow_step_id
        table:
          name: step_runs
          schema: public
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      check:
        _and:
          - type:
              _nin: ["db_write", "notify"]
          - workflow:
              _exists:
                _table:
                  name: org_members
                  schema: public
                _where:
                  _and:
                    - user_id:
                        _eq: X-Hasura-User-Id
                    - org_id:
                        _eq: org_id
                    - role:
                        _eq: editor
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _and:
          - type:
              _nin: ["db_write", "notify"]
          - workflow:
              _exists:
                _table:
                  name: org_members
                  schema: public
                _where:
                  _and:
                    - user_id:
                        _eq: X-Hasura-User-Id
                    - org_id:
                        _eq: org_id
                    - role:
                        _eq: editor
delete_permissions:
  - role: owner
    permission:
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
"""

workflow_triggers_yaml = """table:
  name: workflow_triggers
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      check:
        _and:
          - type:
              _neq: "webhook"
          - workflow:
              _exists:
                _table:
                  name: org_members
                  schema: public
                _where:
                  _and:
                    - user_id:
                        _eq: X-Hasura-User-Id
                    - org_id:
                        _eq: org_id
                    - role:
                        _eq: editor
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
delete_permissions:
  - role: owner
    permission:
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      filter:
        workflow:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
"""

workflow_runs_yaml = """table:
  name: workflow_runs
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
array_relationships:
  - name: step_runs
    using:
      foreign_key_constraint_on:
        column: workflow_run_id
        table:
          name: step_runs
          schema: public
  - name: workflow_outputs
    using:
      foreign_key_constraint_on:
        column: workflow_run_id
        table:
          name: workflow_outputs
          schema: public
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
"""

step_runs_yaml = """table:
  name: step_runs
  schema: public
object_relationships:
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
  - name: workflow_step
    using:
      foreign_key_constraint_on: workflow_step_id
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        workflow_run:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        workflow_run:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        workflow_run:
          _exists:
            _table:
              name: org_members
              schema: public
            _where:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - org_id:
                    _eq: org_id
                - role:
                    _eq: viewer
"""

workflow_outputs_yaml = """table:
  name: workflow_outputs
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
event_triggers:
  - name: notify_workflow_output
    definition:
      enable_manual: false
      insert:
        columns: '*'
    retry_conf:
      interval_sec: 10
      num_retries: 0
      timeout_sec: 60
    webhook: '{{NHOST_FUNCTIONS_URL}}/v1/handle-notify'
"""

watched_records_yaml = """table:
  name: watched_records
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
insert_permissions:
  - role: owner
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      check:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
update_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
delete_permissions:
  - role: owner
    permission:
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
event_triggers:
  - name: handle_watched_record
    definition:
      enable_manual: false
      insert:
        columns: '*'
    retry_conf:
      interval_sec: 10
      num_retries: 0
      timeout_sec: 60
    webhook: '{{NHOST_FUNCTIONS_URL}}/v1/handle-watched-record'
"""

org_usage_summary_yaml = """table:
  name: org_usage_summary
  schema: public
select_permissions:
  - role: owner
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: owner
  - role: editor
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: editor
  - role: viewer
    permission:
      columns: '*'
      filter:
        _exists:
          _table:
            name: org_members
            schema: public
          _where:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - org_id:
                  _eq: org_id
              - role:
                  _eq: viewer
"""

write_file("nhost/metadata/databases/default/tables/public_organizations.yaml", organizations_yaml)
write_file("nhost/metadata/databases/default/tables/public_org_members.yaml", org_members_yaml)
write_file("nhost/metadata/databases/default/tables/public_workflows.yaml", workflows_yaml)
write_file("nhost/metadata/databases/default/tables/public_workflow_steps.yaml", workflow_steps_yaml)
write_file("nhost/metadata/databases/default/tables/public_workflow_triggers.yaml", workflow_triggers_yaml)
write_file("nhost/metadata/databases/default/tables/public_workflow_runs.yaml", workflow_runs_yaml)
write_file("nhost/metadata/databases/default/tables/public_step_runs.yaml", step_runs_yaml)
write_file("nhost/metadata/databases/default/tables/public_workflow_outputs.yaml", workflow_outputs_yaml)
write_file("nhost/metadata/databases/default/tables/public_watched_records.yaml", watched_records_yaml)
write_file("nhost/metadata/databases/default/tables/public_org_usage_summary.yaml", org_usage_summary_yaml)
