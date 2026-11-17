alter table public.shield_links add column if not exists creator_hash text;
create unique index if not exists shield_links_slug_unique_idx on public.shield_links (slug);
create index if not exists shield_links_creator_hash_idx on public.shield_links (creator_hash);

create or replace function public.create_shield_link_for_tier(
  p_slug text, p_destination text, p_token text, p_creator text, p_pro boolean
) returns text language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_creator, 0));
  if not p_pro and (select count(*) from public.shield_links where creator_hash = p_creator) >= 3 then
    return 'limit';
  end if;
  insert into public.shield_links (slug, destination_url, manage_token, creator_hash)
  values (p_slug, p_destination, p_token, p_creator)
  on conflict (slug) do nothing;
  if not found then return 'conflict'; end if;
  return 'created';
end;
$$;
revoke all on function public.create_shield_link_for_tier(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_shield_link_for_tier(text, text, text, text, boolean) to service_role;
