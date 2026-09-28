-- Espacio: esquema inicial (páginas, bases de datos y vistas).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.pages (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid,
  database_id uuid,
  sort_key text not null,
  title text not null default '',
  icon text,
  kind text not null default 'page' check (kind in ('page', 'database')),
  content jsonb,
  schema jsonb,
  props jsonb not null default '{}'::jsonb,
  is_template smallint not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  purged smallint not null default 0,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.views (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  database_id uuid not null,
  name text not null,
  type text not null,
  sort_key text not null,
  group_by text,
  filters jsonb not null default '[]'::jsonb,
  sorts jsonb not null default '[]'::jsonb,
  hidden jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  purged smallint not null default 0,
  server_updated_at timestamptz not null default now()
);

-- The sync cursor: every write bumps server_updated_at.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = clock_timestamp();
  return new;
end $$;

drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before insert or update on public.pages
  for each row execute function public.touch_server_updated_at();

drop trigger if exists views_touch on public.views;
create trigger views_touch before insert or update on public.views
  for each row execute function public.touch_server_updated_at();

create index if not exists pages_sync_idx on public.pages (user_id, server_updated_at);
create index if not exists views_sync_idx on public.views (user_id, server_updated_at);

-- Row level security: each user only sees their own rows.
alter table public.pages enable row level security;
alter table public.views enable row level security;

drop policy if exists "own pages" on public.pages;
create policy "own pages" on public.pages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own views" on public.views;
create policy "own views" on public.views
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime notifications so the phone and the computer stay in sync.
alter publication supabase_realtime add table public.pages, public.views;
