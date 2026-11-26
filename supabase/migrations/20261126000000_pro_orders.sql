create table if not exists public.pro_orders (
  id uuid primary key default gen_random_uuid(),
  customer_email text not null,
  payment_method text not null check (payment_method in ('crypto_polygon', 'crypto_tron', 'creem', 'manual')),
  network text,
  asset text,
  amount_usd numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  plan text not null check (plan in ('month', 'year', 'comp')),
  tx_hash text,
  creem_order_id text,
  creem_event_id text,
  creem_transaction_id text,
  creem_subscription_id text,
  creem_customer_id text,
  license_key text,
  license_hash text,
  status text not null default 'pending_review' check (status in ('active', 'pending_review', 'revoked', 'expired', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists pro_orders_tx_hash_unique_idx on public.pro_orders (lower(tx_hash)) where tx_hash is not null;
create unique index if not exists pro_orders_creem_event_unique_idx on public.pro_orders (creem_event_id) where creem_event_id is not null;
create unique index if not exists pro_orders_creem_transaction_unique_idx on public.pro_orders (creem_transaction_id) where creem_transaction_id is not null;
create unique index if not exists pro_orders_creem_order_unique_idx on public.pro_orders (creem_order_id) where creem_order_id is not null;
drop index if exists public.pro_orders_license_hash_unique_idx;
create index if not exists pro_orders_license_hash_idx on public.pro_orders (license_hash) where license_hash is not null;
create index if not exists pro_orders_created_at_idx on public.pro_orders (created_at desc);
create index if not exists pro_orders_status_idx on public.pro_orders (status);
create index if not exists pro_orders_email_idx on public.pro_orders (customer_email);
create index if not exists pro_orders_subscription_idx on public.pro_orders (creem_subscription_id);

create table if not exists public.pro_subscriptions (
  creem_subscription_id text primary key,
  creem_customer_id text,
  customer_email text not null,
  status text not null,
  current_period_end timestamptz,
  latest_order_id uuid references public.pro_orders(id) on delete set null,
  license_key text,
  license_hash text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.pro_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.pro_orders enable row level security;
alter table public.pro_subscriptions enable row level security;
alter table public.pro_webhook_events enable row level security;
revoke all on public.pro_orders, public.pro_subscriptions, public.pro_webhook_events from anon, authenticated;
grant select, insert, update on public.pro_orders, public.pro_subscriptions, public.pro_webhook_events to service_role;
