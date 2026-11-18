-- Simple Tasks database: the PostgreSQL schema behind examples/simple-tasks-api.yaml.
-- Hand-written example for the Database profile. Import it with "Import DDL".
-- It exercises: two schemas, enums, identity and uuid keys, a generated column,
-- checks, a composite primary key, a self reference, partial and expression
-- indexes, comments, and one function plus trigger (kept as Extra DDL).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE SCHEMA app;
COMMENT ON SCHEMA app IS 'Workspaces, projects, and tasks served by the Tasks API';

CREATE SCHEMA audit;
COMMENT ON SCHEMA audit IS 'Append-only history of task changes';

CREATE TYPE app.task_status AS ENUM ('open', 'in_progress', 'done');
CREATE TYPE app.member_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE app.account (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_pkey PRIMARY KEY (id),
  CONSTRAINT account_email_check CHECK (position('@' in email) > 1)
);
COMMENT ON TABLE app.account IS 'A person who signs in';

CREATE TABLE app.workspace (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspace_pkey PRIMARY KEY (id),
  CONSTRAINT workspace_slug_key UNIQUE (slug),
  CONSTRAINT workspace_slug_check CHECK (slug ~ '^[a-z0-9-]{3,40}$')
);

CREATE TABLE app.workspace_member (
  workspace_id uuid NOT NULL,
  account_id uuid NOT NULL,
  role app.member_role NOT NULL DEFAULT 'editor',
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspace_member_pkey PRIMARY KEY (workspace_id, account_id)
);
COMMENT ON TABLE app.workspace_member IS 'Who can see a workspace, and with which role';

CREATE TABLE app.project (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_workspace_name_key UNIQUE (workspace_id, name)
);

CREATE TABLE app.task (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  parent_task_id uuid,
  assignee_id uuid,
  title text NOT NULL,
  status app.task_status NOT NULL DEFAULT 'open',
  due_date date,
  estimate_minutes integer,
  estimate_hours numeric(6,2) GENERATED ALWAYS AS (estimate_minutes / 60.0) STORED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT task_pkey PRIMARY KEY (id),
  CONSTRAINT task_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT task_estimate_check CHECK (estimate_minutes IS NULL OR estimate_minutes > 0)
);
COMMENT ON TABLE app.task IS 'One task; the Task schema in the Tasks API';
COMMENT ON COLUMN app.task.parent_task_id IS 'Optional parent for sub-tasks';

CREATE TABLE app.label (
  id bigint GENERATED ALWAYS AS IDENTITY,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#888888',
  CONSTRAINT label_pkey PRIMARY KEY (id),
  CONSTRAINT label_workspace_name_key UNIQUE (workspace_id, name)
);

CREATE TABLE app.task_label (
  task_id uuid NOT NULL,
  label_id bigint NOT NULL,
  CONSTRAINT task_label_pkey PRIMARY KEY (task_id, label_id)
);

CREATE TABLE app.comment (
  id bigint GENERATED ALWAYS AS IDENTITY,
  task_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comment_pkey PRIMARY KEY (id)
);

CREATE TABLE audit.task_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  task_id uuid NOT NULL,
  actor_id uuid,
  change jsonb NOT NULL,
  happened_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT task_event_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY app.workspace_member
  ADD CONSTRAINT workspace_member_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES app.workspace(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.workspace_member
  ADD CONSTRAINT workspace_member_account_id_fkey FOREIGN KEY (account_id) REFERENCES app.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.project
  ADD CONSTRAINT project_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES app.workspace(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.task
  ADD CONSTRAINT task_project_id_fkey FOREIGN KEY (project_id) REFERENCES app.project(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.task
  ADD CONSTRAINT task_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES app.task(id) ON DELETE SET NULL;
ALTER TABLE ONLY app.task
  ADD CONSTRAINT task_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES app.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY app.label
  ADD CONSTRAINT label_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES app.workspace(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.task_label
  ADD CONSTRAINT task_label_task_id_fkey FOREIGN KEY (task_id) REFERENCES app.task(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.task_label
  ADD CONSTRAINT task_label_label_id_fkey FOREIGN KEY (label_id) REFERENCES app.label(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.comment
  ADD CONSTRAINT comment_task_id_fkey FOREIGN KEY (task_id) REFERENCES app.task(id) ON DELETE CASCADE;
ALTER TABLE ONLY app.comment
  ADD CONSTRAINT comment_author_id_fkey FOREIGN KEY (author_id) REFERENCES app.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY audit.task_event
  ADD CONSTRAINT task_event_task_id_fkey FOREIGN KEY (task_id) REFERENCES app.task(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX account_email_lower_key ON app.account USING btree (lower(email));
CREATE INDEX task_project_status_idx ON app.task USING btree (project_id, status);
CREATE INDEX task_open_due_idx ON app.task USING btree (due_date) WHERE status <> 'done';
CREATE INDEX task_assignee_idx ON app.task USING btree (assignee_id);
CREATE INDEX comment_task_idx ON app.comment USING btree (task_id, created_at);
CREATE INDEX task_event_task_idx ON audit.task_event USING btree (task_id, happened_at);

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER task_touch_updated_at BEFORE UPDATE ON app.task
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
