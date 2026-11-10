-- Migration: Add refunds table
create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  telegram_user_id bigint not null,
  telegram_charge_id text not null,
  amount_stars integer not null,
  reason text,
  refunded_at timestamptz not null default now()
);

create index if not exists idx_refunds_payment on refunds(payment_id);
create index if not exists idx_refunds_user on refunds(telegram_user_id);
create index if not exists idx_refunds_charge on refunds(telegram_charge_id);
