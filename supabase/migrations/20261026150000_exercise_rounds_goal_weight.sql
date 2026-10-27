-- Modelo hibrido de exercicios para varios esportes:
--   sets      -> inteiro: quantidade de rounds/series que o Modo Execucao percorre.
--   reps      -> texto livre (ja era texto): a "meta" de cada round ("12", "5km", "5 min").
--   weight_kg -> peso planejado opcional; sem ele o app oculta o campo de peso na execucao.

alter table public.exercises
  drop constraint exercises_sets_check;

alter table public.exercises
  alter column sets drop default;

-- Valores antigos como "3 a 4" viram o primeiro numero; sem numero, 3.
alter table public.exercises
  alter column sets type smallint
  using least(20, greatest(1, coalesce(substring(sets from '\d{1,4}')::integer, 3)))::smallint;

alter table public.exercises
  alter column sets set default 3,
  add constraint exercises_sets_check check (sets between 1 and 20);

alter table public.exercises
  add column weight_kg numeric(6,2),
  add constraint exercises_weight_kg_check check (weight_kg is null or (weight_kg > 0 and weight_kg <= 999));

comment on column public.exercises.sets is 'Quantidade de rounds/series executados no Modo Execucao.';
comment on column public.exercises.reps is 'Meta de cada round em texto livre: "12", "5km", "5 min".';
comment on column public.exercises.weight_kg is 'Peso planejado opcional; nulo oculta o campo de peso na execucao.';

create or replace function public.create_workout_with_exercises(
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
      or case
        when (exercise.value ->> 'sets') ~ '^[0-9]{1,4}$'
          then (exercise.value ->> 'sets')::integer not between 1 and 20
        else true
      end
      or exercise.value ->> 'reps' is null
      or char_length(btrim(exercise.value ->> 'reps')) not between 1 and 40
      or exercise.value ->> 'category' is null
      or exercise.value ->> 'category' not in ('alongamentos', 'exercicios', 'cardio')
      or case
        when (exercise.value ->> 'rest_minutes') ~ '^[0-9]+([.][0-9]+)?$'
          then (exercise.value ->> 'rest_minutes')::numeric not between 0 and 30
        else true
      end
      or (
        jsonb_typeof(exercise.value -> 'weight_kg') is distinct from 'null'
        and exercise.value ? 'weight_kg'
        and case
          when (exercise.value ->> 'weight_kg') ~ '^[0-9]{1,3}([.][0-9]+)?$'
            then (exercise.value ->> 'weight_kg')::numeric not between 0 and 999
          else true
        end
      )
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
    weight_kg,
    order_index
  )
  select
    v_workout_id,
    btrim(exercise.value ->> 'name'),
    (exercise.value ->> 'sets')::smallint,
    btrim(exercise.value ->> 'reps'),
    exercise.value ->> 'category',
    (exercise.value ->> 'rest_minutes')::numeric,
    nullif((exercise.value ->> 'weight_kg')::numeric, 0),
    (exercise.position - 1)::smallint
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, position);

  return v_workout_id;
end;
$_$;

create or replace function public.update_workout_with_exercises(
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
      or case
        when jsonb_typeof(exercise.value -> 'sets') = 'number'
          and (exercise.value ->> 'sets') ~ '^[0-9]{1,4}$'
          then (exercise.value ->> 'sets')::integer not between 1 and 20
        else true
      end
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
        exercise.value ? 'weight_kg'
        and jsonb_typeof(exercise.value -> 'weight_kg') <> 'null'
        and case
          when jsonb_typeof(exercise.value -> 'weight_kg') = 'number'
            then (exercise.value ->> 'weight_kg')::numeric not between 0 and 999
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
    sets = (exercise.value ->> 'sets')::smallint,
    reps = btrim(exercise.value ->> 'reps'),
    category = exercise.value ->> 'category',
    rest_minutes = coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    weight_kg = nullif((exercise.value ->> 'weight_kg')::numeric, 0),
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
    weight_kg,
    order_index
  )
  select
    p_id,
    btrim(exercise.value ->> 'name'),
    (exercise.value ->> 'sets')::smallint,
    btrim(exercise.value ->> 'reps'),
    exercise.value ->> 'category',
    coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    nullif((exercise.value ->> 'weight_kg')::numeric, 0),
    (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where not (exercise.value ? 'id');

  return v_workout_id;
end;
$_$;
