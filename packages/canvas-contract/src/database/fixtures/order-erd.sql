-- Hand translation of examples/order-erd.canvas (Systems profile schema cards:
-- Customer, Order, Order Item) into PostgreSQL DDL.

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled');

CREATE TABLE customer (
    customer_id text NOT NULL,
    email text NOT NULL,
    display_name text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT customer_pkey PRIMARY KEY (customer_id),
    CONSTRAINT customer_email_unique UNIQUE (email)
);

CREATE TABLE "order" (
    order_id text NOT NULL,
    customer_id text NOT NULL,
    status order_status NOT NULL DEFAULT 'pending',
    total_cents integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT order_pkey PRIMARY KEY (order_id),
    CONSTRAINT order_total_cents_check CHECK (total_cents >= 0),
    CONSTRAINT order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE RESTRICT
);

CREATE TABLE order_item (
    order_item_id text NOT NULL,
    order_id text NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    CONSTRAINT order_item_pkey PRIMARY KEY (order_item_id),
    CONSTRAINT order_item_quantity_check CHECK (quantity >= 1),
    CONSTRAINT order_item_unit_price_cents_check CHECK (unit_price_cents >= 0),
    CONSTRAINT order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES "order"(order_id) ON DELETE CASCADE
);

CREATE INDEX order_customer_id_idx ON "order" USING btree (customer_id);
CREATE INDEX order_item_order_id_idx ON order_item USING btree (order_id);
