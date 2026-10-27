


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_schedule_id uuid;
  v_occurrence_id uuid;
  v_month date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_initially_settled is null then
    raise exception using errcode = '22023', message = 'The initial settlement status is required.';
  end if;

  insert into public.finance_schedules (
    user_id,
    direction,
    schedule_type,
    title,
    category,
    occurrence_amount_cents,
    total_amount_cents,
    starts_on,
    ends_on,
    interval_months,
    installment_count,
    notes
  )
  values (
    v_user_id,
    p_direction,
    p_schedule_type,
    btrim(p_title),
    p_category,
    case when p_schedule_type = 'installment' then null else p_amount_cents end,
    case when p_schedule_type = 'installment' then p_amount_cents else null end,
    p_starts_on,
    case when p_schedule_type = 'recurring' then p_ends_on else null end,
    case when p_schedule_type = 'recurring' then p_interval_months::smallint else null end,
    case when p_schedule_type = 'installment' then p_installment_count::smallint else null end,
    nullif(btrim(p_notes), '')
  )
  returning id into v_schedule_id;

  v_month := date_trunc('month', p_starts_on)::date;
  perform public.ensure_finance_month(v_month);

  select id
  into v_occurrence_id
  from public.finance_occurrences
  where schedule_id = v_schedule_id
    and user_id = v_user_id
    and competence_month = v_month
  for update;

  if v_occurrence_id is null then
    raise exception using errcode = 'P0001', message = 'The created occurrence was not found.';
  end if;

  if p_initially_settled then
    update public.finance_occurrences
    set status = 'settled',
        actual_amount_cents = planned_amount_cents,
        settled_at = now()
    where id = v_occurrence_id
      and user_id = v_user_id;
  end if;

  return v_occurrence_id;
end;
$$;


ALTER FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) IS 'Atomically creates a financial schedule and its first occurrence.';



CREATE OR REPLACE FUNCTION "public"."create_note"("p_kind" "text", "p_title" "text", "p_body" "text", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_note_id uuid;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  if p_kind is null or p_kind not in ('text', 'list') then
    raise exception using errcode = '22023', message = 'Tipo de nota invalido.';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception using errcode = '22023', message = 'A lista de itens deve ser um array.';
  end if;

  if p_kind = 'text' then
    if jsonb_array_length(v_items) > 0 then
      raise exception using errcode = '22023', message = 'Notas de texto nao podem ter itens.';
    end if;
  else
    if p_body is not null then
      raise exception using errcode = '22023', message = 'Notas de lista nao podem ter texto corrido.';
    end if;

    if jsonb_array_length(v_items) not between 1 and 200 then
      raise exception using errcode = '22023', message = 'Uma lista deve ter entre 1 e 200 itens.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) as item(value)
      where jsonb_typeof(item.value) <> 'object'
        or jsonb_typeof(item.value -> 'content') <> 'string'
        or (
          item.value ? 'is_checked'
          and jsonb_typeof(item.value -> 'is_checked') <> 'boolean'
        )
    ) then
      raise exception using errcode = '22023', message = 'Um ou mais itens da lista sao invalidos.';
    end if;
  end if;

  insert into public.notes (kind, title, body)
  values (p_kind, btrim(p_title), p_body)
  returning id into v_note_id;

  if p_kind = 'list' then
    insert into public.note_items (note_id, content, is_checked, position)
    select
      v_note_id,
      btrim(item.value ->> 'content'),
      coalesce((item.value ->> 'is_checked')::boolean, false),
      (item.ordinality - 1)::integer
    from jsonb_array_elements(v_items) with ordinality as item(value, ordinality);
  end if;

  return v_note_id;
end;
$$;


ALTER FUNCTION "public"."create_note"("p_kind" "text", "p_title" "text", "p_body" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workout_with_exercises"("p_name" "text", "p_day_of_week" smallint, "p_exercises" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
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

  insert into public.workouts (user_id, name, day_of_week)
  values (v_user_id, btrim(p_name), p_day_of_week)
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


ALTER FUNCTION "public"."create_workout_with_exercises"("p_name" "text", "p_day_of_week" smallint, "p_exercises" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_finance_month"("p_month" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_month date;
  v_last_day date;
  v_schedule public.finance_schedules%rowtype;
  v_month_offset integer;
  v_sequence integer;
  v_due_day integer;
  v_due_on date;
  v_planned_amount bigint;
  v_created integer := 0;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_month is null then
    raise exception using errcode = '22023', message = 'A month is required.';
  end if;

  v_month := date_trunc('month', p_month)::date;
  v_last_day := (v_month + interval '1 month' - interval '1 day')::date;

  for v_schedule in
    select schedule.*
    from public.finance_schedules as schedule
    where schedule.user_id = v_user_id
      and schedule.starts_on < (v_month + interval '1 month')::date
      and (schedule.ends_on is null or schedule.ends_on >= v_month)
    order by schedule.id
  loop
    v_month_offset :=
      (
        extract(year from v_month)::integer
        - extract(year from v_schedule.starts_on)::integer
      ) * 12
      + extract(month from v_month)::integer
      - extract(month from v_schedule.starts_on)::integer;

    if v_month_offset < 0 then
      continue;
    end if;

    case v_schedule.schedule_type
      when 'one_time' then
        if v_month_offset <> 0 then
          continue;
        end if;
        v_sequence := 1;
      when 'fixed' then
        v_sequence := v_month_offset + 1;
      when 'recurring' then
        if mod(v_month_offset, v_schedule.interval_months::integer) <> 0 then
          continue;
        end if;
        v_sequence := (v_month_offset / v_schedule.interval_months::integer) + 1;
      when 'installment' then
        if v_month_offset >= v_schedule.installment_count::integer then
          continue;
        end if;
        v_sequence := v_month_offset + 1;
      else
        continue;
    end case;

    v_due_day := least(
      extract(day from v_schedule.starts_on)::integer,
      extract(day from v_last_day)::integer
    );
    v_due_on := v_month + (v_due_day - 1);

    if v_schedule.ends_on is not null and v_due_on > v_schedule.ends_on then
      continue;
    end if;

    if v_schedule.schedule_type = 'installment' then
      v_planned_amount :=
        (v_schedule.total_amount_cents / v_schedule.installment_count::bigint)
        + case
            when v_sequence <= mod(
              v_schedule.total_amount_cents,
              v_schedule.installment_count::bigint
            ) then 1
            else 0
          end;
    else
      v_planned_amount := v_schedule.occurrence_amount_cents;
    end if;

    insert into public.finance_occurrences (
      user_id,
      schedule_id,
      direction,
      schedule_type,
      title,
      category,
      competence_month,
      due_on,
      sequence_number,
      planned_amount_cents,
      notes
    )
    values (
      v_user_id,
      v_schedule.id,
      v_schedule.direction,
      v_schedule.schedule_type,
      v_schedule.title,
      v_schedule.category,
      v_month,
      v_due_on,
      v_sequence,
      v_planned_amount,
      v_schedule.notes
    )
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;
  end loop;

  return v_created;
end;
$$;


ALTER FUNCTION "public"."ensure_finance_month"("p_month" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_finance_month"("p_month" "date") IS 'Idempotently materializes the authenticated user financial entries for a month.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_current_updated_at timestamp with time zone;
  v_day jsonb;
  v_day_id uuid;
  v_day_ids uuid[] := array[]::uuid[];
  v_day_of_week smallint;
  v_meal_record record;
  v_meal jsonb;
  v_meal_id uuid;
  v_meal_ids uuid[];
  v_meal_name text;
  v_meal_dish text;
  v_meal_time time(0) without time zone;
  v_position smallint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_water_reminders_enabled is null or p_meal_reminders_enabled is null then
    raise exception using errcode = '22023', message = 'Reminder settings are required.';
  end if;

  if p_water_start_time is null
    or p_water_end_time is null
    or p_water_start_time >= p_water_end_time then
    raise exception using errcode = '22023', message = 'The water reminder time window is invalid.';
  end if;

  if p_water_interval_minutes is null or p_water_interval_minutes not between 30 and 360 then
    raise exception using errcode = '22023', message = 'The water interval must be between 30 and 360 minutes.';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception using errcode = '22023', message = 'Days must be a JSON array.';
  end if;

  if jsonb_array_length(p_days) > 7 then
    raise exception using errcode = '22023', message = 'A plan can contain at most seven days.';
  end if;

  -- Validate the complete payload before changing any rows.
  for v_day in select value from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(v_day) is distinct from 'object'
      or not (v_day ? 'day_of_week')
      or jsonb_typeof(v_day -> 'day_of_week') is distinct from 'number'
      or (v_day ->> 'day_of_week') !~ '^[0-6]$' then
      raise exception using errcode = '22023', message = 'Each day must contain a numeric day_of_week.';
    end if;

    v_day_of_week := (v_day ->> 'day_of_week')::smallint;

    if v_day_of_week not between 0 and 6 then
      raise exception using errcode = '22023', message = 'day_of_week must be between 0 and 6.';
    end if;

    if not (v_day ? 'meals') or jsonb_typeof(v_day -> 'meals') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Each day must contain a meals array.';
    end if;

    if jsonb_array_length(v_day -> 'meals') > 24 then
      raise exception using errcode = '22023', message = 'A day can contain at most 24 meals.';
    end if;

    for v_meal in select value from jsonb_array_elements(v_day -> 'meals')
    loop
      if jsonb_typeof(v_meal) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'Each meal must be a JSON object.';
      end if;

      if jsonb_typeof(v_meal -> 'name') is distinct from 'string'
        or char_length(btrim(v_meal ->> 'name')) not between 1 and 80 then
        raise exception using errcode = '22023', message = 'Meal names must contain between 1 and 80 characters.';
      end if;

      if jsonb_typeof(v_meal -> 'dish') is distinct from 'string'
        or char_length(btrim(v_meal ->> 'dish')) not between 1 and 500 then
        raise exception using errcode = '22023', message = 'Recommended dishes must contain between 1 and 500 characters.';
      end if;

      if jsonb_typeof(v_meal -> 'meal_time') is distinct from 'string'
        or (v_meal ->> 'meal_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode = '22023', message = 'Meal times must use the HH:MM format.';
      end if;

      if v_meal ? 'id'
        and v_meal ->> 'id' is not null
        and btrim(v_meal ->> 'id') <> ''
        and (v_meal ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'Meal IDs must be valid UUIDs.';
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_days) as day_item
    group by day_item ->> 'day_of_week'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'The same weekday cannot appear more than once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_days) as day_item
    cross join lateral jsonb_array_elements(day_item -> 'meals') as meal_item
    where meal_item ->> 'id' is not null
      and btrim(meal_item ->> 'id') <> ''
    group by meal_item ->> 'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'The same meal ID cannot appear more than once.';
  end if;

  select id, updated_at
  into v_plan_id, v_current_updated_at
  from public.diet_plans
  where user_id = v_user_id
  for update;

  if v_plan_id is null then
    if p_expected_updated_at is not null then
      raise exception using errcode = '40001', message = 'The diet plan changed. Reload it before saving.';
    end if;

    insert into public.diet_plans (
      user_id,
      water_reminders_enabled,
      water_start_time,
      water_end_time,
      water_interval_minutes,
      meal_reminders_enabled
    )
    values (
      v_user_id,
      p_water_reminders_enabled,
      p_water_start_time,
      p_water_end_time,
      p_water_interval_minutes,
      p_meal_reminders_enabled
    )
    returning id into v_plan_id;
  else
    if p_expected_updated_at is not null
      and v_current_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'The diet plan changed. Reload it before saving.';
    end if;

    update public.diet_plans
    set water_reminders_enabled = p_water_reminders_enabled,
        water_start_time = p_water_start_time,
        water_end_time = p_water_end_time,
        water_interval_minutes = p_water_interval_minutes,
        meal_reminders_enabled = p_meal_reminders_enabled
    where id = v_plan_id;
  end if;

  for v_day in select value from jsonb_array_elements(p_days)
  loop
    v_day_of_week := (v_day ->> 'day_of_week')::smallint;

    insert into public.diet_days (diet_plan_id, day_of_week)
    values (v_plan_id, v_day_of_week)
    on conflict (diet_plan_id, day_of_week)
    do update set updated_at = now()
    returning id into v_day_id;

    v_day_ids := array_append(v_day_ids, v_day_id);
    v_meal_ids := array[]::uuid[];

    for v_meal_record in
      select value as meal, ordinality
      from jsonb_array_elements(v_day -> 'meals') with ordinality
    loop
      v_meal := v_meal_record.meal;
      v_meal_name := btrim(v_meal ->> 'name');
      v_meal_dish := btrim(v_meal ->> 'dish');
      v_meal_time := (v_meal ->> 'meal_time')::time(0);
      v_position := (v_meal_record.ordinality - 1)::smallint;

      if v_meal ->> 'id' is not null and btrim(v_meal ->> 'id') <> '' then
        v_meal_id := (v_meal ->> 'id')::uuid;

        update public.diet_meals
        set name = v_meal_name,
            dish = v_meal_dish,
            meal_time = v_meal_time,
            position = v_position
        where id = v_meal_id
          and diet_day_id = v_day_id;

        if not found then
          raise exception using errcode = '22023', message = 'A meal does not belong to the selected day.';
        end if;
      else
        insert into public.diet_meals (
          diet_day_id,
          name,
          dish,
          meal_time,
          position
        )
        values (
          v_day_id,
          v_meal_name,
          v_meal_dish,
          v_meal_time,
          v_position
        )
        returning id into v_meal_id;
      end if;

      v_meal_ids := array_append(v_meal_ids, v_meal_id);
    end loop;

    delete from public.diet_meals
    where diet_day_id = v_day_id
      and not (id = any(v_meal_ids));
  end loop;

  delete from public.diet_days
  where diet_plan_id = v_plan_id
    and not (id = any(v_day_ids));

  update public.diet_plans
  set updated_at = now()
  where id = v_plan_id;

  return v_plan_id;
end;
$_$;


ALTER FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone) IS 'Atomically creates or replaces the authenticated user weekly diet plan.';



CREATE OR REPLACE FUNCTION "public"."set_diet_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_diet_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_current_updated_at timestamp with time zone;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_settled is null then
    raise exception using errcode = '22023', message = 'The settlement status is required.';
  end if;

  select updated_at
  into v_current_updated_at
  from public.finance_occurrences
  where id = p_occurrence_id
    and user_id = v_user_id
  for update;

  if v_current_updated_at is null then
    raise exception using errcode = 'P0002', message = 'Financial occurrence not found.';
  end if;

  if p_expected_updated_at is null
    or v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'The financial occurrence changed. Reload it before saving.';
  end if;

  update public.finance_occurrences
  set status = case when p_settled then 'settled' else 'pending' end,
      actual_amount_cents = case when p_settled then planned_amount_cents else null end,
      settled_at = case when p_settled then now() else null end
  where id = p_occurrence_id
    and user_id = v_user_id;

  return p_occurrence_id;
end;
$$;


ALTER FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) IS 'Settles or reopens one occurrence using the database clock.';



CREATE OR REPLACE FUNCTION "public"."set_finance_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_finance_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reminders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_reminders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tasks_before_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.title := pg_catalog.btrim(new.title);
  new.description := pg_catalog.btrim(new.description);
  new.priority := pg_catalog.lower(pg_catalog.btrim(new.priority));

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '22023',
        message = 'Os campos de identificacao da tarefa nao podem ser alterados.';
    end if;

    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."tasks_before_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_current_updated_at timestamp with time zone;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select updated_at
  into v_current_updated_at
  from public.finance_occurrences
  where id = p_occurrence_id
    and user_id = v_user_id
  for update;

  if v_current_updated_at is null then
    raise exception using errcode = 'P0002', message = 'Financial occurrence not found.';
  end if;

  if p_expected_updated_at is null
    or v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'The financial occurrence changed. Reload it before saving.';
  end if;

  update public.finance_occurrences
  set title = btrim(p_title),
      category = p_category,
      due_on = p_due_on,
      planned_amount_cents = p_planned_amount_cents,
      notes = nullif(btrim(p_notes), '')
  where id = p_occurrence_id
    and user_id = v_user_id;

  return p_occurrence_id;
end;
$$;


ALTER FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) IS 'Updates one monthly occurrence with optimistic concurrency control.';



CREATE OR REPLACE FUNCTION "public"."update_note"("p_id" "uuid", "p_title" "text", "p_body" "text", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_kind text;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  select kind
  into v_kind
  from public.notes
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Nota nao encontrada.';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception using errcode = '22023', message = 'A lista de itens deve ser um array.';
  end if;

  if v_kind = 'text' then
    if jsonb_array_length(v_items) > 0 then
      raise exception using errcode = '22023', message = 'Notas de texto nao podem ter itens.';
    end if;
  else
    if p_body is not null then
      raise exception using errcode = '22023', message = 'Notas de lista nao podem ter texto corrido.';
    end if;

    if jsonb_array_length(v_items) not between 1 and 200 then
      raise exception using errcode = '22023', message = 'Uma lista deve ter entre 1 e 200 itens.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) as item(value)
      where jsonb_typeof(item.value) <> 'object'
        or jsonb_typeof(item.value -> 'content') <> 'string'
        or (
          item.value ? 'is_checked'
          and jsonb_typeof(item.value -> 'is_checked') <> 'boolean'
        )
    ) then
      raise exception using errcode = '22023', message = 'Um ou mais itens da lista sao invalidos.';
    end if;
  end if;

  update public.notes
  set
    title = btrim(p_title),
    body = p_body
  where id = p_id;

  if v_kind = 'list' then
    delete from public.note_items
    where note_id = p_id;

    insert into public.note_items (note_id, content, is_checked, position)
    select
      p_id,
      btrim(item.value ->> 'content'),
      coalesce((item.value ->> 'is_checked')::boolean, false),
      (item.ordinality - 1)::integer
    from jsonb_array_elements(v_items) with ordinality as item(value, ordinality);
  end if;

  return p_id;
end;
$$;


ALTER FUNCTION "public"."update_note"("p_id" "uuid", "p_title" "text", "p_body" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout_with_exercises"("p_id" "uuid", "p_name" "text", "p_day_of_week" integer, "p_exercises" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_user_id uuid;
  v_workout_id uuid;
  v_temporary_order_start integer;
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

  select greatest(
    coalesce(max(exercises.order_index), -1) + 1,
    jsonb_array_length(p_exercises)
  )
  into v_temporary_order_start
  from public.exercises
  where exercises.workout_id = p_id;

  update public.exercises
  set order_index = v_temporary_order_start + (exercise.ordinality - 1)::integer
  from jsonb_array_elements(p_exercises) with ordinality as exercise(value, ordinality)
  where exercise.value ? 'id'
    and exercises.id = (exercise.value ->> 'id')::uuid
    and exercises.workout_id = p_id;

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


ALTER FUNCTION "public"."update_workout_with_exercises"("p_id" "uuid", "p_name" "text", "p_day_of_week" integer, "p_exercises" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_note_item_parent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if not exists (
    select 1
    from public.notes
    where id = new.note_id
      and kind = 'list'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Itens so podem pertencer a notas do tipo lista.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_note_item_parent"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."diet_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "diet_plan_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diet_days_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."diet_days" OWNER TO "postgres";


COMMENT ON TABLE "public"."diet_days" IS 'Active weekdays in a user diet plan; Sunday is 0 and Saturday is 6.';



CREATE TABLE IF NOT EXISTS "public"."diet_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "diet_day_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "dish" "text" NOT NULL,
    "meal_time" time(0) without time zone NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diet_meals_dish_check" CHECK ((("char_length"("btrim"("dish")) >= 1) AND ("char_length"("btrim"("dish")) <= 500))),
    CONSTRAINT "diet_meals_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "diet_meals_position_check" CHECK ((("position" >= 0) AND ("position" <= 99)))
);


ALTER TABLE "public"."diet_meals" OWNER TO "postgres";


COMMENT ON TABLE "public"."diet_meals" IS 'Ordered meals with a local time and recommended dish.';



CREATE TABLE IF NOT EXISTS "public"."diet_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "water_reminders_enabled" boolean DEFAULT false NOT NULL,
    "water_start_time" time(0) without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "water_end_time" time(0) without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    "water_interval_minutes" smallint DEFAULT 120 NOT NULL,
    "meal_reminders_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diet_plans_water_interval_check" CHECK ((("water_interval_minutes" >= 30) AND ("water_interval_minutes" <= 360))),
    CONSTRAINT "diet_plans_water_window_check" CHECK (("water_start_time" < "water_end_time"))
);


ALTER TABLE "public"."diet_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."diet_plans" IS 'One weekly diet plan and notification settings per user.';



CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sets" "text" DEFAULT '3'::"text" NOT NULL,
    "reps" "text" DEFAULT '10'::"text" NOT NULL,
    "category" "text" DEFAULT 'exercicios'::"text" NOT NULL,
    "rest_minutes" numeric(4,2) DEFAULT 1 NOT NULL,
    "order_index" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exercises_category_check" CHECK (("category" = ANY (ARRAY['alongamentos'::"text", 'exercicios'::"text", 'cardio'::"text"]))),
    CONSTRAINT "exercises_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "exercises_order_index_check" CHECK ((("order_index" >= 0) AND ("order_index" <= 39))),
    CONSTRAINT "exercises_reps_check" CHECK ((("char_length"("btrim"("reps")) >= 1) AND ("char_length"("btrim"("reps")) <= 40))),
    CONSTRAINT "exercises_rest_minutes_check" CHECK ((("rest_minutes" >= (0)::numeric) AND ("rest_minutes" <= (30)::numeric))),
    CONSTRAINT "exercises_sets_check" CHECK ((("char_length"("btrim"("sets")) >= 1) AND ("char_length"("btrim"("sets")) <= 40)))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "schedule_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "competence_month" "date" NOT NULL,
    "due_on" "date" NOT NULL,
    "sequence_number" integer NOT NULL,
    "planned_amount_cents" bigint NOT NULL,
    "actual_amount_cents" bigint,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "settled_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_occurrences_actual_amount_check" CHECK ((("actual_amount_cents" IS NULL) OR (("actual_amount_cents" >= 1) AND ("actual_amount_cents" <= '99999999999'::bigint)))),
    CONSTRAINT "finance_occurrences_category_check" CHECK (((("direction" = 'income'::"text") AND ("category" = ANY (ARRAY['salary'::"text", 'freelance'::"text", 'investments'::"text", 'sales'::"text", 'other'::"text"]))) OR (("direction" = 'expense'::"text") AND ("category" = ANY (ARRAY['housing'::"text", 'food'::"text", 'transport'::"text", 'health'::"text", 'education'::"text", 'leisure'::"text", 'subscriptions'::"text", 'shopping'::"text", 'other'::"text"]))))),
    CONSTRAINT "finance_occurrences_competence_check" CHECK ((EXTRACT(day FROM "competence_month") = (1)::numeric)),
    CONSTRAINT "finance_occurrences_direction_check" CHECK (("direction" = ANY (ARRAY['income'::"text", 'expense'::"text"]))),
    CONSTRAINT "finance_occurrences_due_month_check" CHECK (((EXTRACT(year FROM "due_on") = EXTRACT(year FROM "competence_month")) AND (EXTRACT(month FROM "due_on") = EXTRACT(month FROM "competence_month")))),
    CONSTRAINT "finance_occurrences_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "finance_occurrences_planned_amount_check" CHECK ((("planned_amount_cents" >= 1) AND ("planned_amount_cents" <= '99999999999'::bigint))),
    CONSTRAINT "finance_occurrences_sequence_check" CHECK (("sequence_number" >= 1)),
    CONSTRAINT "finance_occurrences_settlement_check" CHECK (((("status" = 'settled'::"text") AND ("actual_amount_cents" IS NOT NULL) AND ("settled_at" IS NOT NULL)) OR (("status" = ANY (ARRAY['pending'::"text", 'cancelled'::"text"])) AND ("actual_amount_cents" IS NULL) AND ("settled_at" IS NULL)))),
    CONSTRAINT "finance_occurrences_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'settled'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "finance_occurrences_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 100))),
    CONSTRAINT "finance_occurrences_type_check" CHECK (((("direction" = 'income'::"text") AND ("schedule_type" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"]))) OR (("direction" = 'expense'::"text") AND ("schedule_type" = ANY (ARRAY['fixed'::"text", 'recurring'::"text", 'installment'::"text"])))))
);


ALTER TABLE "public"."finance_occurrences" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_occurrences" IS 'Monthly snapshots used to calculate planned and settled account balances.';



COMMENT ON COLUMN "public"."finance_occurrences"."status" IS 'pending, settled (paid/received), or cancelled.';



CREATE TABLE IF NOT EXISTS "public"."finance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "direction" "text" NOT NULL,
    "schedule_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "currency_code" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "occurrence_amount_cents" bigint,
    "total_amount_cents" bigint,
    "starts_on" "date" NOT NULL,
    "ends_on" "date",
    "interval_months" smallint,
    "installment_count" smallint,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_schedules_amount_check" CHECK (((("schedule_type" = 'installment'::"text") AND ("occurrence_amount_cents" IS NULL) AND ("total_amount_cents" IS NOT NULL) AND ("installment_count" IS NOT NULL) AND (("total_amount_cents" >= ("installment_count")::bigint) AND ("total_amount_cents" <= '99999999999'::bigint))) OR (("schedule_type" <> 'installment'::"text") AND ("occurrence_amount_cents" IS NOT NULL) AND (("occurrence_amount_cents" >= 1) AND ("occurrence_amount_cents" <= '99999999999'::bigint)) AND ("total_amount_cents" IS NULL)))),
    CONSTRAINT "finance_schedules_category_check" CHECK (((("direction" = 'income'::"text") AND ("category" = ANY (ARRAY['salary'::"text", 'freelance'::"text", 'investments'::"text", 'sales'::"text", 'other'::"text"]))) OR (("direction" = 'expense'::"text") AND ("category" = ANY (ARRAY['housing'::"text", 'food'::"text", 'transport'::"text", 'health'::"text", 'education'::"text", 'leisure'::"text", 'subscriptions'::"text", 'shopping'::"text", 'other'::"text"]))))),
    CONSTRAINT "finance_schedules_currency_check" CHECK (("currency_code" = 'BRL'::"text")),
    CONSTRAINT "finance_schedules_dates_check" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "finance_schedules_direction_check" CHECK (("direction" = ANY (ARRAY['income'::"text", 'expense'::"text"]))),
    CONSTRAINT "finance_schedules_frequency_check" CHECK (
CASE "schedule_type"
    WHEN 'one_time'::"text" THEN (("interval_months" IS NULL) AND ("installment_count" IS NULL) AND ("ends_on" IS NULL))
    WHEN 'fixed'::"text" THEN (("interval_months" IS NULL) AND ("installment_count" IS NULL))
    WHEN 'recurring'::"text" THEN (("interval_months" IS NOT NULL) AND (("interval_months" >= 1) AND ("interval_months" <= 120)) AND ("installment_count" IS NULL))
    WHEN 'installment'::"text" THEN (("interval_months" IS NULL) AND ("installment_count" IS NOT NULL) AND (("installment_count" >= 2) AND ("installment_count" <= 600)) AND ("ends_on" IS NULL))
    ELSE false
END),
    CONSTRAINT "finance_schedules_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "finance_schedules_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 100))),
    CONSTRAINT "finance_schedules_type_check" CHECK (((("direction" = 'income'::"text") AND ("schedule_type" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"]))) OR (("direction" = 'expense'::"text") AND ("schedule_type" = ANY (ARRAY['fixed'::"text", 'recurring'::"text", 'installment'::"text"])))))
);


ALTER TABLE "public"."finance_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_schedules" IS 'Rules for one-time, fixed, recurring and installment financial entries.';



COMMENT ON COLUMN "public"."finance_schedules"."occurrence_amount_cents" IS 'Amount of each occurrence for non-installment schedules, stored in BRL cents.';



COMMENT ON COLUMN "public"."finance_schedules"."total_amount_cents" IS 'Total purchase amount for installment schedules, stored in BRL cents.';



CREATE TABLE IF NOT EXISTS "public"."note_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_checked" boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "note_items_content_check" CHECK ((("char_length"("btrim"("content")) >= 1) AND ("char_length"("content") <= 300))),
    CONSTRAINT "note_items_position_check" CHECK (("position" >= 0))
);


ALTER TABLE "public"."note_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notes_body_check" CHECK (((("kind" = 'text'::"text") AND ("body" IS NOT NULL) AND ("char_length"("btrim"("body")) >= 1) AND ("char_length"("body") <= 20000)) OR (("kind" = 'list'::"text") AND ("body" IS NULL)))),
    CONSTRAINT "notes_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'list'::"text"]))),
    CONSTRAINT "notes_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("title") <= 80)))
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "reminder_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT 'orange'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reminders_color_check" CHECK (("color" = ANY (ARRAY['orange'::"text", 'blue'::"text", 'green'::"text", 'purple'::"text", 'pink'::"text"]))),
    CONSTRAINT "reminders_description_check" CHECK ((("description" IS NULL) OR (("char_length"("btrim"("description")) >= 1) AND ("char_length"("btrim"("description")) <= 500)))),
    CONSTRAINT "reminders_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80)))
);


ALTER TABLE "public"."reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_description_length_check" CHECK ((("char_length"("btrim"("description")) >= 1) AND ("char_length"("btrim"("description")) <= 500))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "tasks_title_length_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80)))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."tasks" IS 'Tarefas pessoais com prazo, prioridade e estado de conclusao.';



COMMENT ON COLUMN "public"."tasks"."priority" IS 'Frequencia local: urgent diariamente, normal a cada 2 dias e low a cada 3 dias.';



COMMENT ON COLUMN "public"."tasks"."due_at" IS 'Instante final da tarefa; o aplicativo agenda uma notificacao local para este horario.';



COMMENT ON COLUMN "public"."tasks"."completed_at" IS 'Nulo enquanto pendente; preenchido quando a tarefa e concluida.';



CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workouts_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "workouts_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80)))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."diet_days"
    ADD CONSTRAINT "diet_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_days"
    ADD CONSTRAINT "diet_days_plan_day_key" UNIQUE ("diet_plan_id", "day_of_week");



ALTER TABLE ONLY "public"."diet_meals"
    ADD CONSTRAINT "diet_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_plans"
    ADD CONSTRAINT "diet_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_plans"
    ADD CONSTRAINT "diet_plans_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_workout_order_key" UNIQUE ("workout_id", "order_index");



ALTER TABLE ONLY "public"."finance_occurrences"
    ADD CONSTRAINT "finance_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_occurrences"
    ADD CONSTRAINT "finance_occurrences_schedule_month_key" UNIQUE ("schedule_id", "competence_month");



ALTER TABLE ONLY "public"."finance_occurrences"
    ADD CONSTRAINT "finance_occurrences_schedule_sequence_key" UNIQUE ("schedule_id", "sequence_number");



ALTER TABLE ONLY "public"."finance_schedules"
    ADD CONSTRAINT "finance_schedules_id_user_key" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."finance_schedules"
    ADD CONSTRAINT "finance_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_items"
    ADD CONSTRAINT "note_items_note_position_key" UNIQUE ("note_id", "position");



ALTER TABLE ONLY "public"."note_items"
    ADD CONSTRAINT "note_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "diet_meals_day_order_idx" ON "public"."diet_meals" USING "btree" ("diet_day_id", "meal_time", "position");



CREATE INDEX "exercises_workout_idx" ON "public"."exercises" USING "btree" ("workout_id", "order_index");



CREATE INDEX "finance_occurrences_user_due_idx" ON "public"."finance_occurrences" USING "btree" ("user_id", "due_on");



CREATE INDEX "finance_occurrences_user_month_idx" ON "public"."finance_occurrences" USING "btree" ("user_id", "competence_month");



CREATE INDEX "finance_occurrences_user_month_status_idx" ON "public"."finance_occurrences" USING "btree" ("user_id", "competence_month", "status");



CREATE INDEX "finance_schedules_user_end_idx" ON "public"."finance_schedules" USING "btree" ("user_id", "ends_on") WHERE ("ends_on" IS NOT NULL);



CREATE INDEX "finance_schedules_user_start_idx" ON "public"."finance_schedules" USING "btree" ("user_id", "starts_on");



CREATE INDEX "note_items_note_position_idx" ON "public"."note_items" USING "btree" ("note_id", "position", "id");



CREATE INDEX "notes_user_updated_at_idx" ON "public"."notes" USING "btree" ("user_id", "updated_at" DESC, "id");



CREATE INDEX "reminders_user_date_idx" ON "public"."reminders" USING "btree" ("user_id", "reminder_date");



CREATE INDEX "tasks_completed_at_idx" ON "public"."tasks" USING "btree" ("user_id", "completed_at" DESC) WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "tasks_open_due_at_idx" ON "public"."tasks" USING "btree" ("user_id", "due_at", "priority") WHERE ("completed_at" IS NULL);



CREATE INDEX "workouts_user_day_idx" ON "public"."workouts" USING "btree" ("user_id", "day_of_week");



CREATE OR REPLACE TRIGGER "diet_days_set_updated_at" BEFORE UPDATE ON "public"."diet_days" FOR EACH ROW EXECUTE FUNCTION "public"."set_diet_updated_at"();



CREATE OR REPLACE TRIGGER "diet_meals_set_updated_at" BEFORE UPDATE ON "public"."diet_meals" FOR EACH ROW EXECUTE FUNCTION "public"."set_diet_updated_at"();



CREATE OR REPLACE TRIGGER "diet_plans_set_updated_at" BEFORE UPDATE ON "public"."diet_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_diet_updated_at"();



CREATE OR REPLACE TRIGGER "finance_occurrences_set_updated_at" BEFORE UPDATE ON "public"."finance_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."set_finance_updated_at"();



CREATE OR REPLACE TRIGGER "finance_schedules_set_updated_at" BEFORE UPDATE ON "public"."finance_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_finance_updated_at"();



CREATE OR REPLACE TRIGGER "note_items_set_updated_at" BEFORE UPDATE ON "public"."note_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_notes_updated_at"();



CREATE OR REPLACE TRIGGER "note_items_validate_parent" BEFORE INSERT OR UPDATE OF "note_id" ON "public"."note_items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_note_item_parent"();



CREATE OR REPLACE TRIGGER "notes_set_updated_at" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_notes_updated_at"();



CREATE OR REPLACE TRIGGER "reminders_set_updated_at" BEFORE UPDATE ON "public"."reminders" FOR EACH ROW EXECUTE FUNCTION "public"."set_reminders_updated_at"();



CREATE OR REPLACE TRIGGER "tasks_before_write_trigger" BEFORE INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."tasks_before_write"();



ALTER TABLE ONLY "public"."diet_days"
    ADD CONSTRAINT "diet_days_diet_plan_id_fkey" FOREIGN KEY ("diet_plan_id") REFERENCES "public"."diet_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_meals"
    ADD CONSTRAINT "diet_meals_diet_day_id_fkey" FOREIGN KEY ("diet_day_id") REFERENCES "public"."diet_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_plans"
    ADD CONSTRAINT "diet_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_occurrences"
    ADD CONSTRAINT "finance_occurrences_schedule_user_fkey" FOREIGN KEY ("schedule_id", "user_id") REFERENCES "public"."finance_schedules"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_occurrences"
    ADD CONSTRAINT "finance_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_schedules"
    ADD CONSTRAINT "finance_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_items"
    ADD CONSTRAINT "note_items_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."diet_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diet_days_delete_own" ON "public"."diet_days" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."diet_plans"
  WHERE (("diet_plans"."id" = "diet_days"."diet_plan_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_days_insert_own" ON "public"."diet_days" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."diet_plans"
  WHERE (("diet_plans"."id" = "diet_days"."diet_plan_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_days_select_own" ON "public"."diet_days" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."diet_plans"
  WHERE (("diet_plans"."id" = "diet_days"."diet_plan_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_days_update_own" ON "public"."diet_days" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."diet_plans"
  WHERE (("diet_plans"."id" = "diet_days"."diet_plan_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."diet_plans"
  WHERE (("diet_plans"."id" = "diet_days"."diet_plan_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."diet_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diet_meals_delete_own" ON "public"."diet_meals" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."diet_days"
     JOIN "public"."diet_plans" ON (("diet_plans"."id" = "diet_days"."diet_plan_id")))
  WHERE (("diet_days"."id" = "diet_meals"."diet_day_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_meals_insert_own" ON "public"."diet_meals" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."diet_days"
     JOIN "public"."diet_plans" ON (("diet_plans"."id" = "diet_days"."diet_plan_id")))
  WHERE (("diet_days"."id" = "diet_meals"."diet_day_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_meals_select_own" ON "public"."diet_meals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."diet_days"
     JOIN "public"."diet_plans" ON (("diet_plans"."id" = "diet_days"."diet_plan_id")))
  WHERE (("diet_days"."id" = "diet_meals"."diet_day_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "diet_meals_update_own" ON "public"."diet_meals" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."diet_days"
     JOIN "public"."diet_plans" ON (("diet_plans"."id" = "diet_days"."diet_plan_id")))
  WHERE (("diet_days"."id" = "diet_meals"."diet_day_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."diet_days"
     JOIN "public"."diet_plans" ON (("diet_plans"."id" = "diet_days"."diet_plan_id")))
  WHERE (("diet_days"."id" = "diet_meals"."diet_day_id") AND ("diet_plans"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."diet_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diet_plans_delete_own" ON "public"."diet_plans" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "diet_plans_insert_own" ON "public"."diet_plans" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "diet_plans_select_own" ON "public"."diet_plans" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "diet_plans_update_own" ON "public"."diet_plans" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_insert_own" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workouts"
  WHERE (("workouts"."id" = "exercises"."workout_id") AND ("workouts"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "exercises_select_own" ON "public"."exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workouts"
  WHERE (("workouts"."id" = "exercises"."workout_id") AND ("workouts"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."finance_occurrences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_occurrences_delete_own" ON "public"."finance_occurrences" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_occurrences_insert_own" ON "public"."finance_occurrences" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_occurrences_select_own" ON "public"."finance_occurrences" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_occurrences_update_own" ON "public"."finance_occurrences" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."finance_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_schedules_delete_own" ON "public"."finance_schedules" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_schedules_insert_own" ON "public"."finance_schedules" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_schedules_select_own" ON "public"."finance_schedules" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "finance_schedules_update_own" ON "public"."finance_schedules" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."note_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "note_items_delete_own" ON "public"."note_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."notes"
  WHERE (("notes"."id" = "note_items"."note_id") AND ("notes"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "note_items_insert_own" ON "public"."note_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."notes"
  WHERE (("notes"."id" = "note_items"."note_id") AND ("notes"."kind" = 'list'::"text") AND ("notes"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "note_items_select_own" ON "public"."note_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."notes"
  WHERE (("notes"."id" = "note_items"."note_id") AND ("notes"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "note_items_update_own" ON "public"."note_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."notes"
  WHERE (("notes"."id" = "note_items"."note_id") AND ("notes"."kind" = 'list'::"text") AND ("notes"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."notes"
  WHERE (("notes"."id" = "note_items"."note_id") AND ("notes"."kind" = 'list'::"text") AND ("notes"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes_delete_own" ON "public"."notes" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "notes_insert_own" ON "public"."notes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "notes_select_own" ON "public"."notes" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "notes_update_own" ON "public"."notes" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminders_delete_own" ON "public"."reminders" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "reminders_insert_own" ON "public"."reminders" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "reminders_select_own" ON "public"."reminders" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "reminders_update_own" ON "public"."reminders" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_own" ON "public"."tasks" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tasks_insert_own" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tasks_select_own" ON "public"."tasks" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tasks_update_own" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workouts_delete_own" ON "public"."workouts" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "workouts_insert_own" ON "public"."workouts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "workouts_select_own" ON "public"."workouts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_finance_schedule"("p_direction" "text", "p_schedule_type" "text", "p_title" "text", "p_category" "text", "p_amount_cents" bigint, "p_starts_on" "date", "p_ends_on" "date", "p_interval_months" integer, "p_installment_count" integer, "p_notes" "text", "p_initially_settled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_note"("p_kind" "text", "p_title" "text", "p_body" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_note"("p_kind" "text", "p_title" "text", "p_body" "text", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_note"("p_kind" "text", "p_title" "text", "p_body" "text", "p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_workout_with_exercises"("p_name" "text", "p_day_of_week" smallint, "p_exercises" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_workout_with_exercises"("p_name" "text", "p_day_of_week" smallint, "p_exercises" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workout_with_exercises"("p_name" "text", "p_day_of_week" smallint, "p_exercises" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_finance_month"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_finance_month"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_finance_month"("p_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_diet_plan"("p_water_reminders_enabled" boolean, "p_water_start_time" time without time zone, "p_water_end_time" time without time zone, "p_water_interval_minutes" integer, "p_meal_reminders_enabled" boolean, "p_days" "jsonb", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_diet_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_diet_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_finance_occurrence_settled"("p_occurrence_id" "uuid", "p_settled" boolean, "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_finance_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_finance_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_notes_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_notes_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_reminders_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_reminders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_reminders_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tasks_before_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tasks_before_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_finance_occurrence"("p_occurrence_id" "uuid", "p_title" "text", "p_category" "text", "p_due_on" "date", "p_planned_amount_cents" bigint, "p_notes" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_note"("p_id" "uuid", "p_title" "text", "p_body" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_note"("p_id" "uuid", "p_title" "text", "p_body" "text", "p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_note"("p_id" "uuid", "p_title" "text", "p_body" "text", "p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_workout_with_exercises"("p_id" "uuid", "p_name" "text", "p_day_of_week" integer, "p_exercises" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workout_with_exercises"("p_id" "uuid", "p_name" "text", "p_day_of_week" integer, "p_exercises" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_workout_with_exercises"("p_id" "uuid", "p_name" "text", "p_day_of_week" integer, "p_exercises" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validate_note_item_parent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_note_item_parent"() TO "service_role";


















GRANT ALL ON TABLE "public"."diet_days" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_days" TO "service_role";



GRANT ALL ON TABLE "public"."diet_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_meals" TO "service_role";



GRANT ALL ON TABLE "public"."diet_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_plans" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finance_occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."finance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."note_items" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."note_items" TO "authenticated";



GRANT INSERT("note_id") ON TABLE "public"."note_items" TO "authenticated";



GRANT INSERT("content"),UPDATE("content") ON TABLE "public"."note_items" TO "authenticated";



GRANT INSERT("is_checked"),UPDATE("is_checked") ON TABLE "public"."note_items" TO "authenticated";



GRANT INSERT("position"),UPDATE("position") ON TABLE "public"."note_items" TO "authenticated";



GRANT ALL ON TABLE "public"."notes" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."notes" TO "authenticated";



GRANT INSERT("kind") ON TABLE "public"."notes" TO "authenticated";



GRANT INSERT("title"),UPDATE("title") ON TABLE "public"."notes" TO "authenticated";



GRANT INSERT("body"),UPDATE("body") ON TABLE "public"."notes" TO "authenticated";



GRANT ALL ON TABLE "public"."reminders" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."reminders" TO "authenticated";



GRANT INSERT("reminder_date"),UPDATE("reminder_date") ON TABLE "public"."reminders" TO "authenticated";



GRANT INSERT("title"),UPDATE("title") ON TABLE "public"."reminders" TO "authenticated";



GRANT INSERT("description"),UPDATE("description") ON TABLE "public"."reminders" TO "authenticated";



GRANT INSERT("color"),UPDATE("color") ON TABLE "public"."reminders" TO "authenticated";



GRANT ALL ON TABLE "public"."tasks" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."tasks" TO "authenticated";



GRANT INSERT("title"),UPDATE("title") ON TABLE "public"."tasks" TO "authenticated";



GRANT INSERT("description"),UPDATE("description") ON TABLE "public"."tasks" TO "authenticated";



GRANT INSERT("priority"),UPDATE("priority") ON TABLE "public"."tasks" TO "authenticated";



GRANT INSERT("due_at"),UPDATE("due_at") ON TABLE "public"."tasks" TO "authenticated";



GRANT UPDATE("completed_at") ON TABLE "public"."tasks" TO "authenticated";



GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

revoke delete on table "public"."diet_days" from "anon";

revoke insert on table "public"."diet_days" from "anon";

revoke references on table "public"."diet_days" from "anon";

revoke select on table "public"."diet_days" from "anon";

revoke trigger on table "public"."diet_days" from "anon";

revoke truncate on table "public"."diet_days" from "anon";

revoke update on table "public"."diet_days" from "anon";

revoke delete on table "public"."diet_meals" from "anon";

revoke insert on table "public"."diet_meals" from "anon";

revoke references on table "public"."diet_meals" from "anon";

revoke select on table "public"."diet_meals" from "anon";

revoke trigger on table "public"."diet_meals" from "anon";

revoke truncate on table "public"."diet_meals" from "anon";

revoke update on table "public"."diet_meals" from "anon";

revoke delete on table "public"."diet_plans" from "anon";

revoke insert on table "public"."diet_plans" from "anon";

revoke references on table "public"."diet_plans" from "anon";

revoke select on table "public"."diet_plans" from "anon";

revoke trigger on table "public"."diet_plans" from "anon";

revoke truncate on table "public"."diet_plans" from "anon";

revoke update on table "public"."diet_plans" from "anon";

revoke delete on table "public"."exercises" from "anon";

revoke insert on table "public"."exercises" from "anon";

revoke references on table "public"."exercises" from "anon";

revoke select on table "public"."exercises" from "anon";

revoke trigger on table "public"."exercises" from "anon";

revoke truncate on table "public"."exercises" from "anon";

revoke update on table "public"."exercises" from "anon";

revoke delete on table "public"."finance_occurrences" from "anon";

revoke insert on table "public"."finance_occurrences" from "anon";

revoke references on table "public"."finance_occurrences" from "anon";

revoke select on table "public"."finance_occurrences" from "anon";

revoke trigger on table "public"."finance_occurrences" from "anon";

revoke truncate on table "public"."finance_occurrences" from "anon";

revoke update on table "public"."finance_occurrences" from "anon";

revoke delete on table "public"."finance_occurrences" from "authenticated";

revoke insert on table "public"."finance_occurrences" from "authenticated";

revoke update on table "public"."finance_occurrences" from "authenticated";

revoke delete on table "public"."finance_schedules" from "anon";

revoke insert on table "public"."finance_schedules" from "anon";

revoke references on table "public"."finance_schedules" from "anon";

revoke select on table "public"."finance_schedules" from "anon";

revoke trigger on table "public"."finance_schedules" from "anon";

revoke truncate on table "public"."finance_schedules" from "anon";

revoke update on table "public"."finance_schedules" from "anon";

revoke delete on table "public"."note_items" from "anon";

revoke insert on table "public"."note_items" from "anon";

revoke references on table "public"."note_items" from "anon";

revoke select on table "public"."note_items" from "anon";

revoke trigger on table "public"."note_items" from "anon";

revoke truncate on table "public"."note_items" from "anon";

revoke update on table "public"."note_items" from "anon";

revoke insert on table "public"."note_items" from "authenticated";

revoke references on table "public"."note_items" from "authenticated";

revoke trigger on table "public"."note_items" from "authenticated";

revoke truncate on table "public"."note_items" from "authenticated";

revoke update on table "public"."note_items" from "authenticated";

revoke delete on table "public"."notes" from "anon";

revoke insert on table "public"."notes" from "anon";

revoke references on table "public"."notes" from "anon";

revoke select on table "public"."notes" from "anon";

revoke trigger on table "public"."notes" from "anon";

revoke truncate on table "public"."notes" from "anon";

revoke update on table "public"."notes" from "anon";

revoke insert on table "public"."notes" from "authenticated";

revoke references on table "public"."notes" from "authenticated";

revoke trigger on table "public"."notes" from "authenticated";

revoke truncate on table "public"."notes" from "authenticated";

revoke update on table "public"."notes" from "authenticated";

revoke delete on table "public"."reminders" from "anon";

revoke insert on table "public"."reminders" from "anon";

revoke references on table "public"."reminders" from "anon";

revoke select on table "public"."reminders" from "anon";

revoke trigger on table "public"."reminders" from "anon";

revoke truncate on table "public"."reminders" from "anon";

revoke update on table "public"."reminders" from "anon";

revoke insert on table "public"."reminders" from "authenticated";

revoke references on table "public"."reminders" from "authenticated";

revoke trigger on table "public"."reminders" from "authenticated";

revoke truncate on table "public"."reminders" from "authenticated";

revoke update on table "public"."reminders" from "authenticated";

revoke delete on table "public"."tasks" from "anon";

revoke insert on table "public"."tasks" from "anon";

revoke references on table "public"."tasks" from "anon";

revoke select on table "public"."tasks" from "anon";

revoke trigger on table "public"."tasks" from "anon";

revoke truncate on table "public"."tasks" from "anon";

revoke update on table "public"."tasks" from "anon";

revoke insert on table "public"."tasks" from "authenticated";

revoke references on table "public"."tasks" from "authenticated";

revoke trigger on table "public"."tasks" from "authenticated";

revoke truncate on table "public"."tasks" from "authenticated";

revoke update on table "public"."tasks" from "authenticated";

revoke delete on table "public"."workouts" from "anon";

revoke insert on table "public"."workouts" from "anon";

revoke references on table "public"."workouts" from "anon";

revoke select on table "public"."workouts" from "anon";

revoke trigger on table "public"."workouts" from "anon";

revoke truncate on table "public"."workouts" from "anon";

revoke update on table "public"."workouts" from "anon";


