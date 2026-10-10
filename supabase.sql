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

-- Met à jour un foyer EXISTANT uniquement : personne ne peut créer de foyer depuis l'app.
create or replace function public.put_household(p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pg_column_size(p_data) > 1000000 then raise exception 'donnees trop volumineuses'; end if;
  update households set data = p_data, updated_at = now() where code = p_code and length(p_code) >= 10;
  if not found then raise exception 'code inconnu'; end if;
end $$;

-- Change le code du foyer : il faut connaître l'ancien.
create or replace function public.change_household_code(p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_new) < 10 then raise exception 'code trop court'; end if;
  if exists (select 1 from households where code = p_new) then raise exception 'code deja utilise'; end if;
  update households set code = p_new, updated_at = now() where code = p_old and length(p_old) >= 10;
  if not found then raise exception 'code inconnu'; end if;
end $$;

revoke all on function public.get_household(text) from public;
revoke all on function public.put_household(text, jsonb) from public;
revoke all on function public.change_household_code(text, text) from public;
grant execute on function public.get_household(text) to anon;
grant execute on function public.put_household(text, jsonb) to anon;
grant execute on function public.change_household_code(text, text) to anon;

-- Fonction ajoutée par Supabase (option « Enable automatic RLS ») : inutile côté API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- À faire aussi dans Authentication → Sign In / Providers : décocher « Allow new users to sign up ».

-- Créer un foyer (une seule fois, ici dans le SQL Editor) :
-- insert into households(code) values ('<code d''au moins 10 caractères>');
