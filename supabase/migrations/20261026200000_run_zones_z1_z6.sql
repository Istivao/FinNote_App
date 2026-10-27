-- Zonas de intensidade da Corrida passam a ser Z1 a Z6 (sem LAn).
-- Nenhum bloco usava LAn quando esta migration foi escrita; por seguranca, LAn vira Z6.

update public.run_blocks set intensity = 'Z6' where intensity = 'LAn';
update public.run_blocks set recovery_intensity = 'Z6' where recovery_intensity = 'LAn';

alter table public.run_blocks
  drop constraint run_blocks_intensity_check,
  drop constraint run_blocks_recovery_intensity_check;

alter table public.run_blocks
  add constraint run_blocks_intensity_check
    check (intensity in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6')),
  add constraint run_blocks_recovery_intensity_check
    check (recovery_intensity is null or recovery_intensity in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'));

create or replace function public.is_valid_run_blocks(p_blocks jsonb) returns boolean
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
        or coalesce(block.value ->> 'intensity', '') not in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6')
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
            or block.value ->> 'recovery_intensity' not in ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6')
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
