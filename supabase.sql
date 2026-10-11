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
  where not (coalesce(e.value->>'deleted', 'false') = 'true'  -- coalesce : sans « deleted », la ligne est gardée
             and coalesce(case when jsonb_typeof(e.value->'ts') = 'number' then (e.value->>'ts')::numeric end, 0)
                 < extract(epoch from now()) * 1000 - 5184000000)  -- 60 jours en ms
    and not (k = 'meals' and e.key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' and left(e.key, 10)::date < current_date - 180);
$$;

-- Date serveur (ms) posée sur chaque enregistrement reçu : sert à la synchro par différences.
create or replace function public.stamp_kind(b jsonb, s numeric)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' then e.value || jsonb_build_object('_s', s) else e.value end), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(b) = 'object' then b else '{}'::jsonb end) e;
$$;

-- Met à jour un foyer EXISTANT uniquement (personne ne peut créer de foyer depuis l'app),
-- en fusionnant avec ce qui est déjà en base : deux appareils ne s'écrasent plus.
create or replace function public.put_household(p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; res jsonb := '{}'::jsonb; now_ms numeric := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if pg_column_size(p_data) > 1000000 then raise exception 'donnees trop volumineuses'; end if;
  select data into cur from households where code = p_code and length(p_code) >= 10 for update;
  if not found then raise exception 'code inconnu'; end if;
  foreach k in array array['lists', 'items', 'meals', 'recipes', 'aisles', 'stores', 'habits', 'foods'] loop
    res := res || jsonb_build_object(k, prune_kind(k, merge_kind(cur->k, stamp_kind(p_data->k, now_ms))));
  end loop;
  update households set data = res, updated_at = now() where code = p_code;
end $$;

-- Lecture par différences : seulement les enregistrements reçus par la base après p_since (ms),
-- plus « _now », l'heure du serveur, à repasser la fois suivante. Code inconnu → null.
create or replace function public.get_household_since(p_code text, p_since numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('_now', floor(extract(epoch from clock_timestamp()) * 1000)) || coalesce((
    select jsonb_object_agg(k.key, (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(k.value) e
      where coalesce(case when jsonb_typeof(e.value->'_s') = 'number' then (e.value->>'_s')::numeric end, 0) > coalesce(p_since, 0)))
    from jsonb_each(h.data) k where jsonb_typeof(k.value) = 'object'), '{}'::jsonb)
  from households h where h.code = p_code and length(p_code) >= 10;
$$;

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
revoke all on function public.stamp_kind(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.get_household_since(text, numeric) from public;
grant execute on function public.get_household(text) to anon;
grant execute on function public.get_household_since(text, numeric) to anon;
grant execute on function public.put_household(text, jsonb) to anon;
grant execute on function public.change_household_code(text, text) to anon;

-- Fonction ajoutée par Supabase (option « Enable automatic RLS ») : inutile côté API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- À faire aussi dans Authentication → Sign In / Providers : décocher « Allow new users to sign up ».

-- Créer un foyer (une seule fois, ici dans le SQL Editor) :
-- insert into households(code) values ('<code d''au moins 10 caractères>');

-- Ingrédients ajoutés à la main (noms et familles seulement), lisibles sans code, à la demande de l'admin :
-- sert à leur donner une image adaptée dans data.js (EMOJI). Aucune autre donnée exposée.
create or replace function public.custom_foods()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('label', f.value->>'label', 'cat', f.value->>'cat')), '[]'::jsonb)
  from households h, jsonb_each(coalesce(h.data->'foods', '{}'::jsonb)) f
  where jsonb_typeof(f.value) = 'object' and f.value ? 'label' and coalesce(f.value->>'deleted', 'false') <> 'true';
$$;
revoke all on function public.custom_foods() from public;
grant execute on function public.custom_foods() to anon;
