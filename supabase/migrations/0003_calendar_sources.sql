-- Calendarios vinculados (links iCal privados de Google Calendar / Outlook).
create table if not exists public.calendar_sources (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  url text not null,
  category text not null check (category in ('laboral', 'personal', 'uade')),
  color text not null,
  enabled smallint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  purged smallint not null default 0,
  server_updated_at timestamptz not null default now()
);

drop trigger if exists calendar_sources_touch on public.calendar_sources;
create trigger calendar_sources_touch before insert or update on public.calendar_sources
  for each row execute function public.touch_server_updated_at();

create index if not exists calendar_sources_sync_idx on public.calendar_sources (user_id, server_updated_at);

alter table public.calendar_sources enable row level security;
drop policy if exists "own calendar sources" on public.calendar_sources;
create policy "own calendar sources" on public.calendar_sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.calendar_sources;
