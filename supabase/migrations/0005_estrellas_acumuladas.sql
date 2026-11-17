-- Pipo y los verbos irregulares: el progreso del alumno guarda también el contador de estrellas de por vida.
--
-- Al elegir otros verbos, el mapa de niveles (estrellas por nivel y dificultad) empieza de nuevo, porque los niveles
-- se forman con los verbos elegidos; pero las estrellas conseguidas se acumulan en un contador de por vida («total»).
-- Solo cambia private.progreso_limpio: acepta «total» (entero de 0 a 999999). Es compatible hacia atrás.

-- Progreso del alumno: se acepta solo la forma que guarda el juego y se devuelve ya limpio; null si no es válido.
--   { stars: {easy|normal|hard: [5 números de 0 a 3]}, total: entero, sel: [verbos], miss: {verbo: veces}, diff: easy|normal|hard }
create or replace function private.progreso_limpio(p jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  v_out jsonb := '{}';
  v_stars jsonb := '{}';
  k text;
  v jsonb;
  c_verbo constant text := '^[a-z][a-z '' -]{0,29}$';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return null;
  end if;
  if p ? 'stars' then
    if jsonb_typeof(p -> 'stars') <> 'object' then return null; end if;
    for k, v in select * from jsonb_each(p -> 'stars') loop
      if k not in ('easy', 'normal', 'hard') or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 5
         or exists (select 1 from jsonb_array_elements(v) e
                    where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric not in (0, 1, 2, 3)) then
        return null;
      end if;
      v_stars := v_stars || jsonb_build_object(k, v);
    end loop;
    v_out := v_out || jsonb_build_object('stars', v_stars);
  end if;
  if p ? 'total' then
    -- Contador de estrellas de por vida: sigue sumando aunque el mapa de niveles empiece de nuevo.
    if jsonb_typeof(p -> 'total') <> 'number' or (p ->> 'total') !~ '^[0-9]{1,6}$' then return null; end if;
    v_out := v_out || jsonb_build_object('total', p -> 'total');
  end if;
  if p ? 'sel' then
    if jsonb_typeof(p -> 'sel') <> 'array' or jsonb_array_length(p -> 'sel') > 200
       or exists (select 1 from jsonb_array_elements(p -> 'sel') e
                  where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ c_verbo) then
      return null;
    end if;
    v_out := v_out || jsonb_build_object('sel', p -> 'sel');
  end if;
  if p ? 'miss' then
    if jsonb_typeof(p -> 'miss') <> 'object' or (select count(*) from jsonb_object_keys(p -> 'miss')) > 200 then
      return null;
    end if;
    for k, v in select * from jsonb_each(p -> 'miss') loop
      if k !~ c_verbo or jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,4}$' or (v #>> '{}')::int < 1 then
        return null;
      end if;
    end loop;
    v_out := v_out || jsonb_build_object('miss', p -> 'miss');
  end if;
  if p ? 'diff' then
    if jsonb_typeof(p -> 'diff') <> 'string' or (p ->> 'diff') not in ('easy', 'normal', 'hard') then return null; end if;
    v_out := v_out || jsonb_build_object('diff', p -> 'diff');
  end if;
  return v_out;
end;
$$;
