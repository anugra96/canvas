CREATE SCHEMA public;

CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled');

CREATE TABLE public.customer (
    customer_id text NOT NULL,
    email text NOT NULL,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_pkey PRIMARY KEY (customer_id),
    CONSTRAINT customer_email_unique UNIQUE (email)
);

CREATE TABLE public."order" (
    order_id text NOT NULL,
    customer_id text NOT NULL,
    status order_status DEFAULT 'pending' NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_pkey PRIMARY KEY (order_id),
    CONSTRAINT order_total_cents_check CHECK (total_cents >= 0)
);

CREATE TABLE public.order_item (
    order_item_id text NOT NULL,
    order_id text NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    CONSTRAINT order_item_pkey PRIMARY KEY (order_item_id),
    CONSTRAINT order_item_quantity_check CHECK (quantity >= 1),
    CONSTRAINT order_item_unit_price_cents_check CHECK (unit_price_cents >= 0)
);

ALTER TABLE public."order" ADD CONSTRAINT order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer (customer_id) ON DELETE RESTRICT;

ALTER TABLE public.order_item ADD CONSTRAINT order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order" (order_id) ON DELETE CASCADE;

CREATE INDEX order_customer_id_idx ON public."order" USING btree (customer_id);

CREATE INDEX order_item_order_id_idx ON public.order_item USING btree (order_id);
