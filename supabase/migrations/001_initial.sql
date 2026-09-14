create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_stars integer not null check (price_stars > 0),
  telegram_file_id text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  telegram_user_id bigint not null,
  telegram_charge_id text not null unique,
  amount_stars integer not null,
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  payment_id uuid not null unique references payments(id) on delete restrict,
  telegram_user_id bigint not null,
  username text,
  first_name text,
  purchased_at timestamptz not null default now()
);

create index idx_products_active on products(active);
create index idx_purchases_product on purchases(product_id);
create index idx_purchases_user on purchases(telegram_user_id);
create index idx_payments_product on payments(product_id);
create index idx_payments_user on payments(telegram_user_id);
