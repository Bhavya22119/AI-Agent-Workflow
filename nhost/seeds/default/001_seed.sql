-- 1. Create organizations
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
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'http_request', '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}, "body": "{\"sentiment\": \"{{prev_output}}\"}"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 'conditional_branch', '{"condition": {"path": "$.result", "operator": "contains", "value": "positive"}, "true_next": 4, "false_next": 5}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 'approval_gate', '{"message": "The sentiment analysis returned a positive result. Please review and approve to save."}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'db_write', '{"key": "sentiment_result", "value_template": "{{prev_output}}"}');

INSERT INTO workflow_triggers (workflow_id, type, enabled) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manual', true);

INSERT INTO workflow_triggers (workflow_id, type, webhook_secret, enabled) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webhook', 'demo-webhook-secret-123', true);
