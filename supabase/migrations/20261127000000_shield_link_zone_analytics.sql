create table if not exists public.shield_link_zone_stats (
  shield_link_id uuid not null references public.shield_links(id) on delete cascade,
  zone_id text not null check (char_length(zone_id) between 1 and 128),
  human_clicks bigint not null default 0 check (human_clicks >= 0),
  blocked_bots bigint not null default 0 check (blocked_bots >= 0),
  updated_at timestamptz not null default now(),
  primary key (shield_link_id, zone_id)
);

create index if not exists shield_link_zone_stats_activity_idx
  on public.shield_link_zone_stats (shield_link_id, (human_clicks + blocked_bots) desc);

create or replace function public.record_shield_link_zone_hit(
  p_shield_link_id uuid,
  p_zone_id text,
  p_is_bot boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_zone_id is null or char_length(p_zone_id) not between 1 and 128 then
    return;
  end if;

  insert into public.shield_link_zone_stats (shield_link_id, zone_id, human_clicks, blocked_bots, updated_at)
  values (
    p_shield_link_id,
    p_zone_id,
    case when p_is_bot then 0 else 1 end,
    case when p_is_bot then 1 else 0 end,
    pg_catalog.now()
  )
  on conflict (shield_link_id, zone_id) do update set
    human_clicks = public.shield_link_zone_stats.human_clicks + excluded.human_clicks,
    blocked_bots = public.shield_link_zone_stats.blocked_bots + excluded.blocked_bots,
    updated_at = pg_catalog.now();
end;
$$;

revoke all on function public.record_shield_link_zone_hit(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_shield_link_zone_hit(uuid, text, boolean) to service_role;
