CREATE SCHEMA public;

CREATE TABLE public.account (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_pkey PRIMARY KEY (id)
);

CREATE TABLE public.member (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_pkey PRIMARY KEY (id),
    CONSTRAINT member_organization_user_unique UNIQUE (organization_id, user_id)
);

CREATE TABLE public.organization (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    metadata text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_pkey PRIMARY KEY (id),
    CONSTRAINT organization_slug_unique UNIQUE (slug)
);

CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (id),
    CONSTRAINT session_token_unique UNIQUE (token)
);

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_pkey PRIMARY KEY (id)
);

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT verification_pkey PRIMARY KEY (id)
);

ALTER TABLE public.account ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE CASCADE;

ALTER TABLE public.member ADD CONSTRAINT member_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization (id) ON DELETE CASCADE;

ALTER TABLE public.member ADD CONSTRAINT member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE CASCADE;

ALTER TABLE public.session ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX account_provider_account_uidx ON public.account USING btree (provider_id, account_id);

CREATE INDEX member_user_id_idx ON public.member USING btree (user_id);

CREATE INDEX session_user_id_idx ON public.session USING btree (user_id);

CREATE UNIQUE INDEX user_email_lower_uidx ON public."user" USING btree ((lower(email)));
