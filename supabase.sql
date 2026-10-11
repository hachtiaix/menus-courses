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

-- Fusion d'un type d'enregistrements : pour chaque clé, le plus récent (ts) gagne.
create or replace function public.merge_kind(a jsonb, b jsonb)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(a, '{}'::jsonb) || coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(case when jsonb_typeof(b) = 'object' then b else '{}'::jsonb end) e
    where not (coalesce(a, '{}'::jsonb) ? e.key)
       or coalesce(case when jsonb_typeof(e.value->'ts') = 'number' then (e.value->>'ts')::numeric end, 0)
        > coalesce(case when jsonb_typeof(a->e.key->'ts') = 'number' then (a->e.key->>'ts')::numeric end, 0)
  ), '{}'::jsonb);
$$;

-- Purge : supprimés depuis plus de 60 jours, repas de plus de 6 mois (même règle que data.js).
create or replace function public.prune_kind(k text, a jsonb)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) e
  where not (e.value->>'deleted' = 'true'
             and coalesce(case when jsonb_typeof(e.value->'ts') = 'number' then (e.value->>'ts')::numeric end, 0)
                 < extract(epoch from now()) * 1000 - 5184000000)  -- 60 jours en ms
    and not (k = 'meals' and e.key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' and left(e.key, 10)::date < current_date - 180);
$$;

-- Met à jour un foyer EXISTANT uniquement (personne ne peut créer de foyer depuis l'app),
-- en fusionnant avec ce qui est déjà en base : deux appareils ne s'écrasent plus.
create or replace function public.put_household(p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; res jsonb := '{}'::jsonb;
begin
  if pg_column_size(p_data) > 1000000 then raise exception 'donnees trop volumineuses'; end if;
  select data into cur from households where code = p_code and length(p_code) >= 10 for update;
  if not found then raise exception 'code inconnu'; end if;
  foreach k in array array['lists', 'items', 'meals', 'recipes', 'aisles', 'stores'] loop
    res := res || jsonb_build_object(k, prune_kind(k, merge_kind(cur->k, p_data->k)));
  end loop;
  update households set data = res, updated_at = now() where code = p_code;
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
revoke all on function public.merge_kind(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.prune_kind(text, jsonb) from public, anon, authenticated;
grant execute on function public.get_household(text) to anon;
grant execute on function public.put_household(text, jsonb) to anon;
grant execute on function public.change_household_code(text, text) to anon;

-- Fonction ajoutée par Supabase (option « Enable automatic RLS ») : inutile côté API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- À faire aussi dans Authentication → Sign In / Providers : décocher « Allow new users to sign up ».

-- Créer un foyer (une seule fois, ici dans le SQL Editor) :
-- insert into households(code) values ('<code d''au moins 10 caractères>');
