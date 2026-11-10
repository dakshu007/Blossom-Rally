-- Download log for the Blossom Rally site.
-- Verified racers insert their own rows (via the Netlify function, using their own session);
-- nobody can read the table from the browser — view it in the Supabase dashboard.

create table if not exists public.downloads (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email       text,
  platform    text not null check (platform in ('mac', 'windows')),
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists downloads_user_id_idx on public.downloads (user_id);
create index if not exists downloads_created_at_idx on public.downloads (created_at desc);

alter table public.downloads enable row level security;

drop policy if exists "racers log their own downloads" on public.downloads;
create policy "racers log their own downloads"
  on public.downloads for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Handy view for the dashboard: one row per racer.
create or replace view public.racers
with (security_invoker = true) as
select
  u.email,
  u.created_at                         as signed_up_at,
  count(d.id)                          as downloads,
  max(d.created_at)                    as last_download_at,
  array_agg(distinct d.platform) filter (where d.platform is not null) as platforms
from auth.users u
left join public.downloads d on d.user_id = u.id
group by u.id, u.email, u.created_at;

revoke all on public.racers from anon, authenticated;
