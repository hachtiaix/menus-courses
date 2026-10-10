create table if not exists households (
  code text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table households enable row level security;
create policy "anon read"   on households for select using (true);
create policy "anon insert" on households for insert with check (true);
create policy "anon update" on households for update using (true) with check (true);
