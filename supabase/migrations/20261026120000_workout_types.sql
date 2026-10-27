-- Tipos de treino criados pelo usuario (Academia, Corrida, Natacao...).
-- Todo treino passa a pertencer a um tipo do mesmo usuario.

create table public.workout_types (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  constraint workout_types_pkey primary key (id),
  constraint workout_types_id_user_key unique (id, user_id),
  constraint workout_types_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint workout_types_name_check check (char_length(btrim(name)) between 1 and 40)
);

comment on table public.workout_types is 'Tipos de treino definidos por cada usuario.';

create unique index workout_types_user_name_key
  on public.workout_types (user_id, lower(btrim(name)));

alter table public.workout_types enable row level security;

create policy workout_types_select_own on public.workout_types
  for select to authenticated using ((select auth.uid()) = user_id);

create policy workout_types_insert_own on public.workout_types
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy workout_types_update_own on public.workout_types
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_types_delete_own on public.workout_types
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.workout_types from anon, authenticated;
grant select, delete on table public.workout_types to authenticated;
grant insert (name), update (name) on table public.workout_types to authenticated;
grant all on table public.workout_types to service_role;

-- Treinos existentes passam para um tipo "Academia" do proprio dono.
alter table public.workouts add column workout_type_id uuid;

insert into public.workout_types (user_id, name)
select distinct workouts.user_id, 'Academia'
from public.workouts;

update public.workouts
set workout_type_id = workout_types.id
from public.workout_types
where workout_types.user_id = workouts.user_id
  and workout_types.name = 'Academia';

alter table public.workouts
  alter column workout_type_id set not null;

-- A chave composta garante que o tipo pertence ao mesmo usuario do treino.
-- Um tipo com treinos nao pode ser excluido.
alter table public.workouts
  add constraint workouts_workout_type_fkey
  foreign key (workout_type_id, user_id)
  references public.workout_types (id, user_id)
  on delete restrict;

create index workouts_user_type_idx
  on public.workouts (user_id, workout_type_id, day_of_week);

-- As funcoes de treino passam a receber o tipo.
drop function public.create_workout_with_exercises(text, smallint, jsonb);
drop function public.update_workout_with_exercises(uuid, text, integer, jsonb);

create function public.create_workout_with_exercises(
  p_name text,
  p_day_of_week smallint,
  p_workout_type_id uuid,
  p_exercises jsonb
) returns uuid
    language plpgsql
    set search_path to ''
    as $_$
declare
  v_user_id uuid := auth.uid();
  v_workout_id uuid;
  v_exercise_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Workout name must contain between 1 and 80 characters' using errcode = '22023';
  end if;

  if p_day_of_week is null or p_day_of_week not between 0 and 6 then
    raise exception 'Day of week must be between 0 and 6' using errcode = '22023';
  end if;

  if p_workout_type_id is null or not exists (
    select 1
    from public.workout_types
    where workout_types.id = p_workout_type_id
      and workout_types.user_id = v_user_id
  ) then
    raise exception using errcode = '22023', message = 'Tipo de treino invalido.';
  end if;

  if jsonb_typeof(p_exercises) is distinct from 'array' then
    raise exception 'Exercises must be an array' using errcode = '22023';
  end if;

  v_exercise_count := jsonb_array_length(p_exercises);
  if v_exercise_count not between 1 and 40 then
    raise exception 'A workout must contain between 1 and 40 exercises' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as exercise(value)
    where jsonb_typeof(exercise.value) is distinct from 'object'
      or exercise.value ->> 'name' is null
      or char_length(btrim(exercise.value ->> 'name')) not between 1 and 80
      or exercise.value ->> 'sets' is null
      or char_length(btrim(exercise.value ->> 'sets')) not between 1 and 40
      or exercise.value ->> 'reps' is null
      or char_length(btrim(exercise.value ->> 'reps')) not between 1 and 40
      or exercise.value ->> 'category' is null
      or exercise.value ->> 'category' not in ('alongamentos', 'exercicios', 'cardio')
      or case
        when (exercise.value ->> 'rest_minutes') ~ '^[0-9]+([.][0-9]+)?$'
          then (exercise.value ->> 'rest_minutes')::numeric not between 0 and 30
        else true
      end
  ) then
    raise exception 'One or more exercises are invalid' using errcode = '22023';
  end if;

  insert into public.workouts (user_id, name, day_of_week, workout_type_id)
  values (v_user_id, btrim(p_name), p_day_of_week, p_workout_type_id)
  returning id into v_workout_id;

  insert into public.exercises (
    workout_id,
    name,
    sets,
    reps,
    category,
    rest_minutes,
    order_index
  )
  select
    v_workout_id,
    btrim(exercise.value ->> 'name'),
    btrim(exercise.value ->> 'sets'),
    btrim(exercise.value ->> 'reps'),
    exercise.value ->> 'category',
    (exercise.value ->> 'rest_minutes')::numeric,
    (exercise.position - 1)::smallint
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, position);

  return v_workout_id;
end;
$_$;

create function public.update_workout_with_exercises(
  p_id uuid,
  p_name text,
  p_day_of_week integer,
  p_workout_type_id uuid,
  p_exercises jsonb
) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $_$
declare
  v_user_id uuid;
  v_workout_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Usuario nao autenticado.';
  end if;

  select workouts.id
  into v_workout_id
  from public.workouts
  where workouts.id = p_id
    and workouts.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Treino nao encontrado.';
  end if;

  perform 1
  from public.exercises
  where exercises.workout_id = p_id
  for update;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Nome do treino invalido.';
  end if;

  if p_day_of_week is null or p_day_of_week not between 0 and 6 then
    raise exception using errcode = '22023', message = 'Dia da semana invalido.';
  end if;

  if p_workout_type_id is null or not exists (
    select 1
    from public.workout_types
    where workout_types.id = p_workout_type_id
      and workout_types.user_id = v_user_id
  ) then
    raise exception using errcode = '22023', message = 'Tipo de treino invalido.';
  end if;

  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then
    raise exception using errcode = '22023', message = 'Os exercicios devem ser um array.';
  end if;

  if jsonb_array_length(p_exercises) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'O treino deve ter entre 1 e 40 exercicios.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as exercise(value)
    where jsonb_typeof(exercise.value) <> 'object'
      or jsonb_typeof(exercise.value -> 'name') is distinct from 'string'
      or char_length(btrim(exercise.value ->> 'name')) not between 1 and 80
      or jsonb_typeof(exercise.value -> 'sets') is distinct from 'string'
      or char_length(btrim(exercise.value ->> 'sets')) not between 1 and 40
      or jsonb_typeof(exercise.value -> 'reps') is distinct from 'string'
      or char_length(btrim(exercise.value ->> 'reps')) not between 1 and 40
      or jsonb_typeof(exercise.value -> 'category') is distinct from 'string'
      or exercise.value ->> 'category' not in ('alongamentos', 'exercicios', 'cardio')
      or (
        exercise.value ? 'rest_minutes'
        and case
          when jsonb_typeof(exercise.value -> 'rest_minutes') = 'number'
            then (exercise.value ->> 'rest_minutes')::numeric not between 0 and 30
          else true
        end
      )
      or (
        exercise.value ? 'id'
        and (
          jsonb_typeof(exercise.value -> 'id') is distinct from 'string'
          or exercise.value ->> 'id'
            !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'Um ou mais exercicios sao invalidos.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as exercise(value)
    where exercise.value ? 'id'
    group by (exercise.value ->> 'id')::uuid
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Os IDs dos exercicios nao podem se repetir.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as exercise(value)
    where exercise.value ? 'id'
      and not exists (
        select 1
        from public.exercises
        where exercises.id = (exercise.value ->> 'id')::uuid
          and exercises.workout_id = p_id
      )
  ) then
    raise exception using errcode = '22023', message = 'Um exercicio nao pertence ao treino.';
  end if;

  update public.workouts
  set
    name = btrim(p_name),
    day_of_week = p_day_of_week,
    workout_type_id = p_workout_type_id
  where workouts.id = p_id
    and workouts.user_id = v_user_id;

  delete from public.exercises
  where exercises.workout_id = p_id
    and not exists (
      select 1
      from jsonb_array_elements(p_exercises) as exercise(value)
      where exercise.value ? 'id'
        and (exercise.value ->> 'id')::uuid = exercises.id
    );

  -- A unicidade de (workout_id, order_index) e verificada no commit,
  -- entao trocas de posicao entre exercicios nao conflitam aqui.
  update public.exercises
  set
    name = btrim(exercise.value ->> 'name'),
    sets = btrim(exercise.value ->> 'sets'),
    reps = btrim(exercise.value ->> 'reps'),
    category = exercise.value ->> 'category',
    rest_minutes = coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    order_index = (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where exercise.value ? 'id'
    and exercises.id = (exercise.value ->> 'id')::uuid
    and exercises.workout_id = p_id;

  insert into public.exercises (
    workout_id,
    name,
    sets,
    reps,
    category,
    rest_minutes,
    order_index
  )
  select
    p_id,
    btrim(exercise.value ->> 'name'),
    btrim(exercise.value ->> 'sets'),
    btrim(exercise.value ->> 'reps'),
    exercise.value ->> 'category',
    coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where not (exercise.value ? 'id');

  return v_workout_id;
end;
$_$;

revoke all on function public.create_workout_with_exercises(text, smallint, uuid, jsonb) from public, anon;
grant execute on function public.create_workout_with_exercises(text, smallint, uuid, jsonb) to authenticated, service_role;

revoke all on function public.update_workout_with_exercises(uuid, text, integer, uuid, jsonb) from public, anon;
grant execute on function public.update_workout_with_exercises(uuid, text, integer, uuid, jsonb) to authenticated, service_role;
