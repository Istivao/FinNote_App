-- Corrige a edicao de treinos com mais de ~20 exercicios.
-- A reordenacao movia os exercicios para posicoes temporarias acima de 39,
-- violando exercises_order_index_check. Com a unicidade checada apenas no
-- fim da transacao, a reordenacao pode ser feita direto, sem posicoes temporarias.

alter table public.exercises
  drop constraint exercises_workout_order_key;

alter table public.exercises
  add constraint exercises_workout_order_key
  unique (workout_id, order_index)
  deferrable initially deferred;

create or replace function public.update_workout_with_exercises(
  p_id uuid,
  p_name text,
  p_day_of_week integer,
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
    day_of_week = p_day_of_week
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
