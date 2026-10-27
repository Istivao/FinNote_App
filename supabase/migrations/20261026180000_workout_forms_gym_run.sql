-- Formularios condicionais por tipo de treino.
--   workout_types.kind: 'gym' (Academia) ou 'run' (Corrida) define o formulario e o Modo Execucao.
--   exercises:          volta a ser exclusivo da Academia (series, repeticoes, peso, descanso).
--   run_blocks:         blocos de Corrida (multiplicador, intensidade, volume e recuperacao opcional).

-- 1. Forma de cada tipo de treino ------------------------------------------------

alter table public.workout_types
  add column kind text not null default 'gym',
  add constraint workout_types_kind_check check (kind in ('gym', 'run'));

comment on column public.workout_types.kind is 'Formulario do tipo: gym (Academia) ou run (Corrida).';

update public.workout_types
set kind = 'run'
where lower(name) ~ '(corrida|caminhada|run)';

-- A forma e escolhida na criacao e nao muda depois, para nao invalidar os treinos do tipo.
grant insert (kind) on table public.workout_types to authenticated;

-- 2. Blocos de corrida -----------------------------------------------------------

create table public.run_blocks (
  id uuid default gen_random_uuid() not null,
  workout_id uuid not null,
  order_index smallint not null,
  sets smallint not null,
  intensity text not null,
  volume numeric(7,2) not null,
  volume_unit text not null,
  recovery_intensity text,
  recovery_volume numeric(7,2),
  recovery_unit text,
  created_at timestamp with time zone default now() not null,
  constraint run_blocks_pkey primary key (id),
  constraint run_blocks_workout_id_fkey foreign key (workout_id) references public.workouts (id) on delete cascade,
  constraint run_blocks_workout_order_key unique (workout_id, order_index) deferrable initially deferred,
  constraint run_blocks_order_index_check check (order_index between 0 and 19),
  constraint run_blocks_sets_check check (sets between 1 and 50),
  constraint run_blocks_intensity_check check (intensity in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'LAn')),
  constraint run_blocks_volume_check check (volume > 0 and volume <= 99999),
  constraint run_blocks_volume_unit_check check (volume_unit in ('km', 'm', 'min')),
  constraint run_blocks_recovery_intensity_check
    check (recovery_intensity is null or recovery_intensity in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'LAn')),
  constraint run_blocks_recovery_volume_check
    check (recovery_volume is null or (recovery_volume > 0 and recovery_volume <= 99999)),
  constraint run_blocks_recovery_unit_check
    check (recovery_unit is null or recovery_unit in ('km', 'm', 'min')),
  -- Recuperacao e tudo ou nada, e so existe quando o bloco se repete.
  constraint run_blocks_recovery_check check (
    (recovery_intensity is null and recovery_volume is null and recovery_unit is null)
    or (
      recovery_intensity is not null
      and recovery_volume is not null
      and recovery_unit is not null
      and sets > 1
    )
  )
);

comment on table public.run_blocks is 'Blocos de um treino de Corrida: ex. 5x Z4 de 1 km com recuperacao em Z2 de 500 m.';

create index run_blocks_workout_idx on public.run_blocks (workout_id, order_index);

alter table public.run_blocks enable row level security;

create policy run_blocks_select_own on public.run_blocks
  for select to authenticated using (exists (
    select 1 from public.workouts
    where workouts.id = run_blocks.workout_id
      and workouts.user_id = (select auth.uid())
  ));

create policy run_blocks_insert_own on public.run_blocks
  for insert to authenticated with check (exists (
    select 1 from public.workouts
    where workouts.id = run_blocks.workout_id
      and workouts.user_id = (select auth.uid())
  ));

revoke all on table public.run_blocks from anon, authenticated;
grant select, insert on table public.run_blocks to authenticated;
grant all on table public.run_blocks to service_role;

-- Exercicios que ja existiam em treinos de Corrida viram blocos.
insert into public.run_blocks (workout_id, order_index, sets, intensity, volume, volume_unit)
select
  exercises.workout_id,
  (row_number() over (partition by exercises.workout_id order by exercises.order_index) - 1)::smallint,
  least(exercises.sets, 50),
  'Z2',
  least(99999, coalesce(
    nullif(substring(replace(exercises.reps, ',', '.') from '[0-9]+(?:\.[0-9]+)?'), '')::numeric,
    1
  )),
  case
    when exercises.reps ~* 'min' then 'min'
    when exercises.reps ~* 'km' then 'km'
    when exercises.reps ~* '[0-9]\s*m' then 'm'
    else 'km'
  end
from public.exercises
join public.workouts on workouts.id = exercises.workout_id
join public.workout_types on workout_types.id = workouts.workout_type_id
where workout_types.kind = 'run'
  and exercises.order_index < 20;

delete from public.exercises
using public.workouts, public.workout_types
where workouts.id = exercises.workout_id
  and workout_types.id = workouts.workout_type_id
  and workout_types.kind = 'run';

-- 3. Exercicios de Academia voltam a ser numericos ----------------------------------

alter table public.exercises
  drop constraint exercises_reps_check;

alter table public.exercises
  alter column reps drop default;

alter table public.exercises
  alter column reps type smallint
  using least(999, greatest(1, coalesce(substring(reps from '[0-9]{1,3}')::integer, 10)))::smallint;

alter table public.exercises
  alter column reps set default 10,
  add constraint exercises_reps_check check (reps between 1 and 999);

comment on column public.exercises.sets is 'Quantidade de series do exercicio de Academia.';
comment on column public.exercises.reps is 'Repeticoes por serie.';
comment on column public.exercises.weight_kg is 'Peso planejado em kg (opcional).';

-- 4. Validacao compartilhada pelas funcoes de criar e editar -------------------------

create function public.is_valid_gym_exercises(p_exercises jsonb) returns boolean
    language sql immutable
    set search_path to ''
    as $_$
  select jsonb_typeof(p_exercises) = 'array'
    and jsonb_array_length(p_exercises) between 1 and 40
    and not exists (
      select 1
      from jsonb_array_elements(p_exercises) as exercise(value)
      where jsonb_typeof(exercise.value) is distinct from 'object'
        or jsonb_typeof(exercise.value -> 'name') is distinct from 'string'
        or char_length(btrim(exercise.value ->> 'name')) not between 1 and 80
        or case
          when jsonb_typeof(exercise.value -> 'sets') = 'number'
            and (exercise.value ->> 'sets') ~ '^[0-9]{1,4}$'
            then (exercise.value ->> 'sets')::integer not between 1 and 20
          else true
        end
        or case
          when jsonb_typeof(exercise.value -> 'reps') = 'number'
            and (exercise.value ->> 'reps') ~ '^[0-9]{1,4}$'
            then (exercise.value ->> 'reps')::integer not between 1 and 999
          else true
        end
        or jsonb_typeof(exercise.value -> 'category') is distinct from 'string'
        or exercise.value ->> 'category' not in ('alongamentos', 'exercicios', 'cardio')
        or case
          when jsonb_typeof(exercise.value -> 'rest_minutes') = 'number'
            then (exercise.value ->> 'rest_minutes')::numeric not between 0 and 30
          else true
        end
        or (
          coalesce(jsonb_typeof(exercise.value -> 'weight_kg'), 'null') <> 'null'
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
    );
$_$;

create function public.is_valid_run_blocks(p_blocks jsonb) returns boolean
    language sql immutable
    set search_path to ''
    as $_$
  select jsonb_typeof(p_blocks) = 'array'
    and jsonb_array_length(p_blocks) between 1 and 20
    and not exists (
      select 1
      from jsonb_array_elements(p_blocks) as block(value)
      where jsonb_typeof(block.value) is distinct from 'object'
        or case
          when jsonb_typeof(block.value -> 'sets') = 'number'
            and (block.value ->> 'sets') ~ '^[0-9]{1,4}$'
            then (block.value ->> 'sets')::integer not between 1 and 50
          else true
        end
        or coalesce(block.value ->> 'intensity', '') not in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'LAn')
        or case
          when jsonb_typeof(block.value -> 'volume') = 'number'
            then (block.value ->> 'volume')::numeric <= 0
              or (block.value ->> 'volume')::numeric > 99999
          else true
        end
        or coalesce(block.value ->> 'volume_unit', '') not in ('km', 'm', 'min')
        or (
          -- Recuperacao: ausente/nula por completo, ou completa e valida num bloco repetido.
          coalesce(jsonb_typeof(block.value -> 'recovery_intensity'), 'null') <> 'null'
          and (
            (block.value ->> 'sets') = '1'
            or block.value ->> 'recovery_intensity' not in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'LAn')
            or case
              when jsonb_typeof(block.value -> 'recovery_volume') = 'number'
                then (block.value ->> 'recovery_volume')::numeric <= 0
                  or (block.value ->> 'recovery_volume')::numeric > 99999
              else true
            end
            or coalesce(block.value ->> 'recovery_unit', '') not in ('km', 'm', 'min')
          )
        )
        or (
          coalesce(jsonb_typeof(block.value -> 'recovery_intensity'), 'null') = 'null'
          and (
            coalesce(jsonb_typeof(block.value -> 'recovery_volume'), 'null') <> 'null'
            or coalesce(jsonb_typeof(block.value -> 'recovery_unit'), 'null') <> 'null'
          )
        )
    );
$_$;

revoke all on function public.is_valid_gym_exercises(jsonb) from public, anon;
grant execute on function public.is_valid_gym_exercises(jsonb) to authenticated, service_role;
revoke all on function public.is_valid_run_blocks(jsonb) from public, anon;
grant execute on function public.is_valid_run_blocks(jsonb) to authenticated, service_role;

-- 5. Funcoes de criar e editar treino recebem exercicios OU blocos conforme o tipo --------

drop function public.create_workout_with_exercises(text, smallint, uuid, jsonb);
drop function public.update_workout_with_exercises(uuid, text, integer, uuid, jsonb);

create function public.create_workout_with_exercises(
  p_name text,
  p_day_of_week smallint,
  p_workout_type_id uuid,
  p_exercises jsonb,
  p_run_blocks jsonb
) returns uuid
    language plpgsql
    set search_path to ''
    as $_$
declare
  v_user_id uuid := auth.uid();
  v_kind text;
  v_workout_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Usuario nao autenticado.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Nome do treino invalido.';
  end if;

  if p_day_of_week is null or p_day_of_week not between 0 and 6 then
    raise exception using errcode = '22023', message = 'Dia da semana invalido.';
  end if;

  select workout_types.kind
  into v_kind
  from public.workout_types
  where workout_types.id = p_workout_type_id
    and workout_types.user_id = v_user_id;

  if v_kind is null then
    raise exception using errcode = '22023', message = 'Tipo de treino invalido.';
  end if;

  if v_kind = 'gym' then
    if not public.is_valid_gym_exercises(p_exercises)
      or coalesce(jsonb_array_length(p_run_blocks), 0) > 0 then
      raise exception using errcode = '22023', message = 'Um ou mais exercicios sao invalidos.';
    end if;
  else
    if not public.is_valid_run_blocks(p_run_blocks)
      or coalesce(jsonb_array_length(p_exercises), 0) > 0 then
      raise exception using errcode = '22023', message = 'Um ou mais blocos de corrida sao invalidos.';
    end if;
  end if;

  insert into public.workouts (user_id, name, day_of_week, workout_type_id)
  values (v_user_id, btrim(p_name), p_day_of_week, p_workout_type_id)
  returning id into v_workout_id;

  if v_kind = 'gym' then
    insert into public.exercises (
      workout_id, name, sets, reps, category, rest_minutes, weight_kg, order_index
    )
    select
      v_workout_id,
      btrim(exercise.value ->> 'name'),
      (exercise.value ->> 'sets')::smallint,
      (exercise.value ->> 'reps')::smallint,
      exercise.value ->> 'category',
      coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
      nullif((exercise.value ->> 'weight_kg')::numeric, 0),
      (exercise.position - 1)::smallint
    from jsonb_array_elements(p_exercises) with ordinality as exercise(value, position);
  else
    insert into public.run_blocks (
      workout_id, order_index, sets, intensity, volume, volume_unit,
      recovery_intensity, recovery_volume, recovery_unit
    )
    select
      v_workout_id,
      (block.position - 1)::smallint,
      (block.value ->> 'sets')::smallint,
      block.value ->> 'intensity',
      (block.value ->> 'volume')::numeric,
      block.value ->> 'volume_unit',
      block.value ->> 'recovery_intensity',
      (block.value ->> 'recovery_volume')::numeric,
      block.value ->> 'recovery_unit'
    from jsonb_array_elements(p_run_blocks) with ordinality as block(value, position);
  end if;

  return v_workout_id;
end;
$_$;

create function public.update_workout_with_exercises(
  p_id uuid,
  p_name text,
  p_day_of_week integer,
  p_workout_type_id uuid,
  p_exercises jsonb,
  p_run_blocks jsonb
) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $_$
declare
  v_user_id uuid := (select auth.uid());
  v_kind text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Usuario nao autenticado.';
  end if;

  perform 1
  from public.workouts
  where workouts.id = p_id
    and workouts.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Treino nao encontrado.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Nome do treino invalido.';
  end if;

  if p_day_of_week is null or p_day_of_week not between 0 and 6 then
    raise exception using errcode = '22023', message = 'Dia da semana invalido.';
  end if;

  select workout_types.kind
  into v_kind
  from public.workout_types
  where workout_types.id = p_workout_type_id
    and workout_types.user_id = v_user_id;

  if v_kind is null then
    raise exception using errcode = '22023', message = 'Tipo de treino invalido.';
  end if;

  if v_kind = 'gym' then
    if not public.is_valid_gym_exercises(p_exercises)
      or coalesce(jsonb_array_length(p_run_blocks), 0) > 0 then
      raise exception using errcode = '22023', message = 'Um ou mais exercicios sao invalidos.';
    end if;

    perform 1
    from public.exercises
    where exercises.workout_id = p_id
    for update;

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
  else
    if not public.is_valid_run_blocks(p_run_blocks)
      or coalesce(jsonb_array_length(p_exercises), 0) > 0 then
      raise exception using errcode = '22023', message = 'Um ou mais blocos de corrida sao invalidos.';
    end if;
  end if;

  update public.workouts
  set
    name = btrim(p_name),
    day_of_week = p_day_of_week,
    workout_type_id = p_workout_type_id
  where workouts.id = p_id
    and workouts.user_id = v_user_id;

  -- Os blocos nao sao referenciados por nada: sempre substituidos por completo.
  delete from public.run_blocks
  where run_blocks.workout_id = p_id;

  if v_kind = 'run' then
    delete from public.exercises
    where exercises.workout_id = p_id;

    insert into public.run_blocks (
      workout_id, order_index, sets, intensity, volume, volume_unit,
      recovery_intensity, recovery_volume, recovery_unit
    )
    select
      p_id,
      (block.position - 1)::smallint,
      (block.value ->> 'sets')::smallint,
      block.value ->> 'intensity',
      (block.value ->> 'volume')::numeric,
      block.value ->> 'volume_unit',
      block.value ->> 'recovery_intensity',
      (block.value ->> 'recovery_volume')::numeric,
      block.value ->> 'recovery_unit'
    from jsonb_array_elements(p_run_blocks) with ordinality as block(value, position);

    return p_id;
  end if;

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
    reps = (exercise.value ->> 'reps')::smallint,
    category = exercise.value ->> 'category',
    rest_minutes = coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    weight_kg = nullif((exercise.value ->> 'weight_kg')::numeric, 0),
    order_index = (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where exercise.value ? 'id'
    and exercises.id = (exercise.value ->> 'id')::uuid
    and exercises.workout_id = p_id;

  insert into public.exercises (
    workout_id, name, sets, reps, category, rest_minutes, weight_kg, order_index
  )
  select
    p_id,
    btrim(exercise.value ->> 'name'),
    (exercise.value ->> 'sets')::smallint,
    (exercise.value ->> 'reps')::smallint,
    exercise.value ->> 'category',
    coalesce((exercise.value ->> 'rest_minutes')::numeric, 1),
    nullif((exercise.value ->> 'weight_kg')::numeric, 0),
    (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where not (exercise.value ? 'id');

  return p_id;
end;
$_$;

revoke all on function public.create_workout_with_exercises(text, smallint, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_workout_with_exercises(text, smallint, uuid, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.update_workout_with_exercises(uuid, text, integer, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_workout_with_exercises(uuid, text, integer, uuid, jsonb, jsonb) to authenticated, service_role;
