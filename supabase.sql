-- Schéma complet (à exécuter dans Supabase → SQL Editor).
-- La table n'est accessible qu'au travers des deux fonctions ci-dessous,
-- qui exigent le code exact du foyer : impossible de lister ou modifier les autres lignes.

create table if not exists households (
  code text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table households enable row level security;
drop policy if exists "anon read" on households;
drop policy if exists "anon insert" on households;
drop policy if exists "anon update" on households;
revoke all on households from anon, authenticated;

create or replace function public.get_household(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select data from households where code = p_code and length(p_code) >= 10;
$$;

create or replace function public.put_household(p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_code) < 10 then raise exception 'code trop court'; end if;
  if pg_column_size(p_data) > 1000000 then raise exception 'donnees trop volumineuses'; end if;
  insert into households(code, data, updated_at) values (p_code, p_data, now())
  on conflict (code) do update set data = excluded.data, updated_at = now();
end $$;

revoke all on function public.get_household(text) from public;
revoke all on function public.put_household(text, jsonb) from public;
grant execute on function public.get_household(text) to anon, authenticated;
grant execute on function public.put_household(text, jsonb) to anon, authenticated;
