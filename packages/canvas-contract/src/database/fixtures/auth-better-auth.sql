-- Hand-written Better Auth-style schema (equivalent of pg_dump --schema-only,
-- not generated from a real database). Exercises the reserved table name "user",
-- foreign keys with ON DELETE, unique indexes, defaults, timestamptz, text, boolean.

CREATE TABLE "user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean NOT NULL DEFAULT false,
    image text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX user_email_lower_uidx ON "user" USING btree (lower(email));

CREATE TABLE session (
    id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (id),
    CONSTRAINT session_token_unique UNIQUE (token),
    CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON session USING btree (user_id);

CREATE TABLE account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT account_pkey PRIMARY KEY (id),
    CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX account_provider_account_uidx ON account USING btree (provider_id, account_id);

CREATE TABLE verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT verification_pkey PRIMARY KEY (id)
);

CREATE TABLE organization (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    metadata text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT organization_pkey PRIMARY KEY (id),
    CONSTRAINT organization_slug_unique UNIQUE (slug)
);

CREATE TABLE member (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT member_pkey PRIMARY KEY (id),
    CONSTRAINT member_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
    CONSTRAINT member_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT member_organization_user_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX member_user_id_idx ON member USING btree (user_id);
