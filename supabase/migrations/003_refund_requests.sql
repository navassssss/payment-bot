-- Migration: Add refund_requests table
create table if not exists refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  telegram_user_id bigint not null,
  product_id uuid not null references products(id) on delete cascade,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_refund_requests_user on refund_requests(telegram_user_id);
create index if not exists idx_refund_requests_payment on refund_requests(payment_id);
create index if not exists idx_refund_requests_status on refund_requests(status);
