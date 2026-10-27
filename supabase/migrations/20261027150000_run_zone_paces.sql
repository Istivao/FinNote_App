-- Faixa de pace-alvo (segundos por km) de cada zona de Corrida, usada pelo treinador por voz.
-- fast_sec e o limite mais rapido (menor numero) e slow_sec o mais lento.

create table public.run_zone_paces (
  user_id uuid default auth.uid() not null,
  zone text not null,
  fast_sec integer not null,
  slow_sec integer not null,
  updated_at timestamp with time zone default now() not null,
  constraint run_zone_paces_pkey primary key (user_id, zone),
  constraint run_zone_paces_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint run_zone_paces_zone_check check (zone in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6')),
  constraint run_zone_paces_range_check check (
    fast_sec between 120 and 1200
    and slow_sec between 120 and 1200
    and fast_sec < slow_sec
  )
);

comment on table public.run_zone_paces is 'Pace-alvo por zona de intensidade de cada usuario.';

alter table public.run_zone_paces enable row level security;

create policy run_zone_paces_select_own on public.run_zone_paces
  for select to authenticated using ((select auth.uid()) = user_id);

create policy run_zone_paces_insert_own on public.run_zone_paces
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy run_zone_paces_update_own on public.run_zone_paces
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy run_zone_paces_delete_own on public.run_zone_paces
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.run_zone_paces from anon, authenticated;
grant select, delete on table public.run_zone_paces to authenticated;
-- O upsert do PostgREST reescreve todas as colunas enviadas (inclusive zone) no "on conflict".
grant insert (zone, fast_sec, slow_sec, updated_at), update (zone, fast_sec, slow_sec, updated_at)
  on table public.run_zone_paces to authenticated;
grant all on table public.run_zone_paces to service_role;
