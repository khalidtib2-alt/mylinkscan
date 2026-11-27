alter table public.shield_link_zone_stats
  add column if not exists last_status text not null default 'allowed' check (last_status in ('allowed', 'blocked')),
  add column if not exists last_block_reason text;

alter table public.shield_link_zone_stats enable row level security;
revoke all on public.shield_link_zone_stats from anon, authenticated;
grant select, insert, update on public.shield_link_zone_stats to service_role;

create table if not exists public.shield_link_hit_stats (
  shield_link_id uuid not null references public.shield_links(id) on delete cascade,
  zone_id text not null default '',
  status text not null check (status in ('allowed', 'blocked')),
  block_reason text not null default '',
  hit_count bigint not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (shield_link_id, zone_id, status, block_reason)
);

alter table public.shield_link_hit_stats enable row level security;
revoke all on public.shield_link_hit_stats from anon, authenticated;
grant select, insert, update on public.shield_link_hit_stats to service_role;

create or replace function public.record_shield_link_click_batch(p_hits jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hit jsonb;
  v_link_id uuid;
  v_zone_id text;
  v_status text;
  v_reason text;
  v_count bigint;
begin
  if pg_catalog.jsonb_typeof(p_hits) <> 'array' then return; end if;
  for v_hit in select value from pg_catalog.jsonb_array_elements(p_hits) loop
    v_link_id := (v_hit ->> 'shield_link_id')::uuid;
    v_zone_id := nullif(pg_catalog.left(v_hit ->> 'zone_id', 128), '');
    v_status := case when v_hit ->> 'status' = 'blocked' then 'blocked' else 'allowed' end;
    v_reason := case when v_status = 'blocked' then pg_catalog.left(v_hit ->> 'block_reason', 128) else null end;
    v_count := greatest(1, least(coalesce((v_hit ->> 'count')::bigint, 1), 1000000));

    update public.shield_links
    set human_clicks = coalesce(human_clicks, 0) + case when v_status = 'allowed' then v_count else 0 end,
        blocked_bots = coalesce(blocked_bots, 0) + case when v_status = 'blocked' then v_count else 0 end,
        last_event_at = pg_catalog.now()
    where id = v_link_id;

    insert into public.shield_link_hit_stats (shield_link_id, zone_id, status, block_reason, hit_count, updated_at)
    values (v_link_id, coalesce(v_zone_id, ''), v_status, coalesce(v_reason, ''), v_count, pg_catalog.now())
    on conflict (shield_link_id, zone_id, status, block_reason) do update set
      hit_count = public.shield_link_hit_stats.hit_count + excluded.hit_count,
      updated_at = pg_catalog.now();

    if v_zone_id is not null then
      insert into public.shield_link_zone_stats (shield_link_id, zone_id, human_clicks, blocked_bots, last_status, last_block_reason, updated_at)
      values (v_link_id, v_zone_id,
        case when v_status = 'allowed' then v_count else 0 end,
        case when v_status = 'blocked' then v_count else 0 end,
        v_status, v_reason, pg_catalog.now())
      on conflict (shield_link_id, zone_id) do update set
        human_clicks = public.shield_link_zone_stats.human_clicks + excluded.human_clicks,
        blocked_bots = public.shield_link_zone_stats.blocked_bots + excluded.blocked_bots,
        last_status = excluded.last_status,
        last_block_reason = coalesce(excluded.last_block_reason, public.shield_link_zone_stats.last_block_reason),
        updated_at = pg_catalog.now();
    end if;
  end loop;
end;
$$;

revoke all on function public.record_shield_link_click_batch(jsonb) from public, anon, authenticated;
grant execute on function public.record_shield_link_click_batch(jsonb) to service_role;
