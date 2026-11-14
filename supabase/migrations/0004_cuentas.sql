-- Pipo y los verbos irregulares: cuentas para todos (alumnado y profesorado).
--
-- Cambios respecto a 0003:
--   * Una sola tabla de cuentas («accounts», antes «teachers») con rol 'alumno' o 'profe': usuario, contraseña (bcrypt)
--     y código de recuperación, como ya tenía el profesorado. El usuario con el que se inicia sesión es privado;
--     lo que ven los demás en el ranking es el apodo que se elige en cada clase.
--   * Las cuentas de alumno guardan su progreso (estrellas, verbos elegidos, fallos y dificultad) para cambiar de
--     dispositivo sin perderlo. Se valida la forma y el tamaño en el servidor.
--   * Quien está en una clase pertenece a ella POR SU CUENTA (players.account_id) y solo a una clase a la vez.
--     Los retos pertenecen a la cuenta que los creó (classes.owner_id), no a una clave guardada en el navegador.
--   * Si un alumno olvida la contraseña, su profesor puede ponerle una temporal (prof_reset_student); en cualquier
--     caso se puede recuperar con el código que se mostró al crear la cuenta.
--
-- Compatible con el juego ya publicado: NO se quita nada de lo que usa el cliente actual (join_class, submit_run,
-- leave_class, create_class, create_challenge y las dos de «teacher_»). Esas funciones, que identifican con un secreto
-- guardado en el navegador, se quitarán en una migración posterior, cuando el cliente nuevo esté publicado.
-- Las funciones de cuenta de profesor de 0003 (prof_register, prof_login...) nunca llegaron a usarse y se sustituyen
-- por las account_* de aquí.

-- ---------------------------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------------------------
alter table public.teachers rename to accounts;
alter table public.teacher_sessions rename to account_sessions;
alter table public.account_sessions rename column teacher_id to account_id;
alter index public.teachers_usuario_unico rename to accounts_usuario_unico;
alter index public.teacher_sessions_por_profe rename to account_sessions_por_cuenta;
alter table public.account_sessions alter column expires_at set default now() + interval '90 days';

alter table public.accounts
  add column role text not null default 'profe' check (role in ('alumno', 'profe')),
  add column progress jsonb not null default '{}' check (octet_length(progress::text) <= 20000),
  add column must_change_password boolean not null default false;
alter table public.accounts alter column role drop default;

-- Clases: quien las posee es una cuenta (profe en las de aula, alumno en los retos). Los retos antiguos, creados con
-- una clave guardada en el navegador, siguen con su hash hasta que caduquen.
alter table public.classes rename column teacher_id to owner_id;
alter index public.classes_por_profe rename to classes_por_dueno;
alter table public.classes drop constraint classes_tipo;
alter table public.classes add constraint classes_tipo check (
  (kind = 'aula' and owner_id is not null and teacher_hash is null)
  or (kind = 'reto' and ((owner_id is not null) <> (teacher_hash is not null))));

-- Jugadores: ahora pertenecen a una cuenta. Los antiguos (con secreto en el navegador) siguen valiendo.
alter table public.players
  add column account_id uuid references public.accounts (id) on delete cascade,
  alter column secret_hash drop not null,
  add constraint players_identidad check (account_id is not null or secret_hash is not null);
create unique index players_una_clase on public.players (account_id) where account_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Ayudantes privados
-- ---------------------------------------------------------------------------------------------
-- Las funciones de cuenta de 0003 se sustituyen por las account_* de más abajo.
drop function public.prof_register(text, text);
drop function public.prof_login(text, text);
drop function public.prof_reset_password(text, text, text);
drop function public.prof_logout(text);
drop function public.prof_delete_account(text, text);
drop function private.sesion_nueva(uuid);

create function private.sesion_nueva(p_account uuid) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_token text := private.secreto();
begin
  delete from public.account_sessions where account_id = p_account and expires_at < now();
  insert into public.account_sessions (token_hash, account_id) values (private.hash(v_token), p_account);
  return v_token;
end;
$$;

-- La cuenta de una sesión. Con p_role, además comprueba que sea de ese tipo.
create function private.cuenta_de_sesion(p_token text, p_role text default null) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid;
  v_role text;
begin
  select s.account_id, a.role into v_id, v_role
  from public.account_sessions s join public.accounts a on a.id = s.account_id
  where s.token_hash = private.hash(p_token) and s.expires_at > now();
  if v_id is null then
    raise exception 'sesion_no_valida';
  end if;
  if p_role is not null and v_role <> p_role then
    raise exception 'rol_no_permitido';
  end if;
  return v_id;
end;
$$;

create or replace function private.profe_de_sesion(p_token text) returns uuid
language sql stable
set search_path = ''
as $$ select private.cuenta_de_sesion(p_token, 'profe') $$;

create or replace function private.clase_de_profe(p_teacher uuid, p_code text) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.classes
  where owner_id = p_teacher and kind = 'aula' and code = upper(btrim(coalesce(p_code, '')));
  if v_id is null then
    raise exception 'clase_no_existe';
  end if;
  return v_id;
end;
$$;

-- Contraseña temporal legible (sin letras ni números que se confundan).
create function private.contrasena_temporal() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  res text := '';
begin
  for i in 0..7 loop
    res := res || substr(alfabeto, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return res;
end;
$$;

-- Progreso del alumno: se acepta solo la forma que guarda el juego y se devuelve ya limpio; null si no es válido.
--   { stars: {easy|normal|hard: [5 números de 0 a 3]}, sel: [verbos], miss: {verbo: veces}, diff: easy|normal|hard }
create function private.progreso_limpio(p jsonb) returns jsonb
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

-- La lógica de guardar una partida, compartida por la función antigua (con secreto) y la de cuentas.
create function private.guardar_partida(
  p_player uuid, p_level integer, p_difficulty text, p_correct integer, p_mistakes integer, p_misses text[]
) returns table (points integer, stars integer)
language plpgsql
set search_path = ''
as $$
declare
  v_class public.classes;
  v_stars integer;
  v_points integer;
  v_extra integer;
  v_run bigint;
begin
  select c.* into v_class from public.classes c join public.players p on p.class_id = c.id where p.id = p_player;
  if p_level is null or p_level not between 0 and 4
     or p_difficulty is null or p_difficulty not in ('easy', 'normal', 'hard')
     or p_correct is null or p_correct not between 1 and 200
     or p_mistakes is null or p_mistakes < 0
     -- Una partida terminada tiene al menos una vida: 5 al empezar, +1 cada 10 aciertos seguidos.
     or p_mistakes > 4 + p_correct / 10 then
    raise exception 'partida_imposible';
  end if;
  if not (p_difficulty = any (v_class.allowed_difficulties)) then
    raise exception 'dificultad_no_permitida';
  end if;
  if exists (select 1 from public.runs where player_id = p_player and created_at > now() - interval '10 seconds') then
    raise exception 'demasiado_rapido';
  end if;
  if p_misses is not null and (
       cardinality(p_misses) > p_mistakes
       or exists (select 1 from unnest(p_misses) v where v is null or v !~ '^[a-z][a-z '' -]{0,29}$')) then
    raise exception 'partida_imposible';
  end if;
  -- Fórmula de puntos decidida: aciertos x (10 + extra de dificultad) + estrellas x 50, con extra 0 / 2 / 5.
  v_stars := case when p_mistakes = 0 then 3 when p_mistakes <= 2 then 2 else 1 end;
  v_extra := case p_difficulty when 'easy' then 0 when 'normal' then 2 else 5 end;
  v_points := p_correct * (10 + v_extra) + v_stars * 50;
  insert into public.runs (player_id, level, difficulty, correct, mistakes, stars, points)
  values (p_player, p_level, p_difficulty, p_correct, p_mistakes, v_stars, v_points)
  returning id into v_run;
  -- Los fallos por verbo solo se guardan en las clases de aula; en los retos entre amigos, nunca.
  if v_class.kind = 'aula' and p_misses is not null and cardinality(p_misses) > 0 then
    insert into public.run_misses (run_id, verb, times)
    select v_run, v, count(*) from unnest(p_misses) v group by v;
  end if;
  return query select v_points, v_stars;
end;
$$;

-- La función antigua (identificada por secreto) pasa a usar la lógica compartida.
create or replace function public.submit_run(
  p_player uuid, p_secret text, p_level integer, p_difficulty text, p_correct integer, p_mistakes integer,
  p_misses text[] default null
) returns table (points integer, stars integer)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.players where id = p_player and secret_hash = private.hash(p_secret)) then
    raise exception 'jugador_no_valido';
  end if;
  return query select * from private.guardar_partida(p_player, p_level, p_difficulty, p_correct, p_mistakes, p_misses);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Cuentas: alta, entrada, recuperación, cambio de contraseña y borrado
-- ---------------------------------------------------------------------------------------------
create function public.account_register(p_role text, p_username text, p_password text)
returns table (token text, recovery_code text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user text := btrim(coalesce(p_username, ''));
  v_id uuid;
  v_recovery text := private.clave_recuperacion();
  v_tope integer;
begin
  if p_role is null or p_role not in ('alumno', 'profe') then
    raise exception 'rol_invalido';
  end if;
  if v_user !~ '^[A-Za-z0-9._-]{3,30}$' then
    raise exception 'usuario_invalido';
  end if;
  if not private.contrasena_valida(p_password) then
    raise exception 'contrasena_invalida';
  end if;
  -- Freno general contra el alta masiva. Un colegio entero puede registrarse a la vez desde la misma red,
  -- así que para el alumnado el tope es alto.
  v_tope := case p_role when 'profe' then 30 else 300 end;
  if (select count(*) from public.accounts where role = p_role and created_at > now() - interval '1 hour') >= v_tope then
    raise exception 'demasiado_rapido';
  end if;
  begin
    insert into public.accounts (role, username, pass_hash, recovery_hash)
    values (p_role, v_user, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), private.hash_recuperacion(v_recovery))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'usuario_en_uso';
  end;
  return query select private.sesion_nueva(v_id), v_recovery;
end;
$$;

create function public.account_login(p_username text, p_password text)
returns table (token text, role text, must_change_password boolean, error text)
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.accounts;
begin
  select * into t from public.accounts where lower(username) = lower(btrim(coalesce(p_username, ''))) for update;
  if not found then
    -- Se gasta el mismo tiempo que con un usuario real, para no delatar qué usuarios existen.
    perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10));
    return query select null::text, null::text, null::boolean, 'credenciales_invalidas'::text;
    return;
  end if;
  if t.locked_until is not null and t.locked_until > now() then
    return query select null::text, null::text, null::boolean, 'cuenta_bloqueada'::text;
    return;
  end if;
  if t.pass_hash = extensions.crypt(coalesce(p_password, ''), t.pass_hash) then
    update public.accounts set failed_attempts = 0, locked_until = null, last_login = now() where id = t.id;
    return query select private.sesion_nueva(t.id), t.role, t.must_change_password, null::text;
    return;
  end if;
  if t.failed_attempts + 1 >= 5 then
    update public.accounts set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = t.id;
    return query select null::text, null::text, null::boolean, 'cuenta_bloqueada'::text;
  else
    update public.accounts set failed_attempts = failed_attempts + 1 where id = t.id;
    return query select null::text, null::text, null::boolean, 'credenciales_invalidas'::text;
  end if;
end;
$$;

-- Contraseña olvidada: con el código de recuperación se pone una nueva. El código se renueva y se cierran
-- todas las sesiones abiertas.
create function public.account_reset_password(p_username text, p_recovery_code text, p_new_password text)
returns table (token text, recovery_code text, role text, error text)
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.accounts;
  v_recovery text := private.clave_recuperacion();
begin
  if not private.contrasena_valida(p_new_password) then
    raise exception 'contrasena_invalida';
  end if;
  select * into t from public.accounts where lower(username) = lower(btrim(coalesce(p_username, ''))) for update;
  if not found then
    return query select null::text, null::text, null::text, 'credenciales_invalidas'::text;
    return;
  end if;
  if t.locked_until is not null and t.locked_until > now() then
    return query select null::text, null::text, null::text, 'cuenta_bloqueada'::text;
    return;
  end if;
  if t.recovery_hash <> private.hash_recuperacion(p_recovery_code) then
    if t.failed_attempts + 1 >= 5 then
      update public.accounts set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = t.id;
      return query select null::text, null::text, null::text, 'cuenta_bloqueada'::text;
    else
      update public.accounts set failed_attempts = failed_attempts + 1 where id = t.id;
      return query select null::text, null::text, null::text, 'credenciales_invalidas'::text;
    end if;
    return;
  end if;
  update public.accounts
  set pass_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      recovery_hash = private.hash_recuperacion(v_recovery),
      failed_attempts = 0, locked_until = null, must_change_password = false, last_login = now()
  where id = t.id;
  delete from public.account_sessions where account_id = t.id;
  return query select private.sesion_nueva(t.id), v_recovery, t.role, null::text;
end;
$$;

create function public.account_logout(p_token text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.account_sessions where token_hash = private.hash(p_token);
  return found;
end;
$$;

-- Quién es la sesión y su progreso. También cuenta como actividad (para la limpieza por inactividad).
create function public.account_me(p_token text)
returns table (role text, username text, progress jsonb, must_change_password boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token);
begin
  update public.accounts set last_login = now() where id = v_id;
  return query select a.role, a.username, a.progress, a.must_change_password from public.accounts a where a.id = v_id;
end;
$$;

-- Cambiar la contraseña sabiendo la actual (por ejemplo, tras una temporal). Cierra las demás sesiones.
create function public.account_change_password(p_token text, p_old text, p_new text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token);
  t public.accounts;
begin
  if not private.contrasena_valida(p_new) then
    raise exception 'contrasena_invalida';
  end if;
  select * into t from public.accounts where id = v_id;
  if t.pass_hash <> extensions.crypt(coalesce(p_old, ''), t.pass_hash) then
    raise exception 'credenciales_invalidas';
  end if;
  update public.accounts
  set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), must_change_password = false
  where id = v_id;
  delete from public.account_sessions where account_id = v_id and token_hash <> private.hash(p_token);
  return true;
end;
$$;

-- Borra la cuenta y con ella su progreso, su sitio en la clase y sus partidas. Si tiene retos o clases, también.
create function public.account_delete(p_token text, p_password text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token);
  t public.accounts;
begin
  select * into t from public.accounts where id = v_id;
  if t.pass_hash <> extensions.crypt(coalesce(p_password, ''), t.pass_hash) then
    raise exception 'credenciales_invalidas';
  end if;
  delete from public.accounts where id = v_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Alumnado: progreso, clase y partidas
-- ---------------------------------------------------------------------------------------------
create function public.alu_save_progress(p_token text, p_progress jsonb)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
  v_limpio jsonb := private.progreso_limpio(p_progress);
begin
  if v_limpio is null then
    raise exception 'progreso_invalido';
  end if;
  update public.accounts set progress = v_limpio where id = v_id;
  return true;
end;
$$;

-- La clase en la que está esta cuenta (ninguna fila si no está en ninguna).
create function public.alu_my_class(p_token text)
returns table (
  code text, name text, alias text, kind text, allowed_lists smallint[], allowed_difficulties text[], is_owner boolean
)
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
begin
  return query
    select c.code, c.name, p.alias, c.kind, c.allowed_lists, c.allowed_difficulties, (c.owner_id = v_id)
    from public.players p join public.classes c on c.id = p.class_id
    where p.account_id = v_id;
end;
$$;

create function public.alu_join_class(p_token text, p_code text, p_alias text)
returns table (class_name text, alias text, kind text, allowed_lists smallint[], allowed_difficulties text[])
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
  v_class public.classes;
  v_alias text := private.apodo_limpio(p_alias);
begin
  if v_alias is null then
    raise exception 'apodo_invalido';
  end if;
  if exists (select 1 from public.players where account_id = v_id) then
    raise exception 'ya_en_clase';
  end if;
  select * into v_class from public.classes where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'clase_no_existe';
  end if;
  if (select count(*) from public.players where class_id = v_class.id) >= v_class.max_players then
    raise exception 'clase_llena';
  end if;
  begin
    insert into public.players (class_id, alias, account_id) values (v_class.id, v_alias, v_id);
  exception when unique_violation then
    raise exception 'apodo_en_uso';
  end;
  return query select v_class.name, v_alias, v_class.kind, v_class.allowed_lists, v_class.allowed_difficulties;
end;
$$;

-- Salir de la clase: se borran el apodo y las partidas de esta cuenta en ella (la cuenta sigue existiendo).
create function public.alu_leave_class(p_token text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
begin
  delete from public.players where account_id = v_id;
  return found;
end;
$$;

create function public.alu_submit_run(
  p_token text, p_level integer, p_difficulty text, p_correct integer, p_mistakes integer, p_misses text[] default null
) returns table (points integer, stars integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
  v_player uuid;
begin
  select id into v_player from public.players where account_id = v_id;
  if v_player is null then
    raise exception 'sin_clase';
  end if;
  return query select * from private.guardar_partida(v_player, p_level, p_difficulty, p_correct, p_mistakes, p_misses);
end;
$$;

-- «Reta a tus amigos»: crea un reto cuyo dueño es esta cuenta y mete dentro a quien lo crea con su apodo.
create function public.alu_create_challenge(p_token text, p_name text, p_alias text)
returns table (code text, class_name text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
  v_alias text := private.apodo_limpio(p_alias);
  v_name text := private.nombre_de_clase_valido(p_name);
  v_code text;
  v_class uuid;
begin
  if v_name is null then
    raise exception 'nombre_invalido';
  end if;
  if v_alias is null then
    raise exception 'apodo_invalido';
  end if;
  if exists (select 1 from public.players where account_id = v_id) then
    raise exception 'ya_en_clase';
  end if;
  if (select count(*) from public.classes where owner_id = v_id and kind = 'reto') >= 5 then
    raise exception 'demasiados_retos';
  end if;
  if (select count(*) from public.classes where kind = 'reto' and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'demasiado_rapido';
  end if;
  for intento in 1..10 loop
    v_code := private.codigo_clase();
    begin
      insert into public.classes (code, name, kind, owner_id, max_players)
      values (v_code, v_name, 'reto', v_id, 30)
      returning id into v_class;
      insert into public.players (class_id, alias, account_id) values (v_class, v_alias, v_id);
      return query select v_code, v_name;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'sin_codigo_libre';
end;
$$;

create function public.alu_delete_challenge(p_token text, p_code text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.cuenta_de_sesion(p_token, 'alumno');
begin
  delete from public.classes
  where owner_id = v_id and kind = 'reto' and code = upper(btrim(coalesce(p_code, '')));
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Profesorado: las funciones de 0003 siguen, ahora sobre las cuentas unificadas
-- ---------------------------------------------------------------------------------------------
create or replace function public.prof_create_class(p_token text, p_name text)
returns table (code text, name text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.profe_de_sesion(p_token);
  v_name text := private.nombre_de_clase_valido(p_name);
  v_code text;
begin
  if v_name is null then
    raise exception 'nombre_invalido';
  end if;
  if (select count(*) from public.classes where owner_id = v_id) >= 20 then
    raise exception 'demasiadas_clases';
  end if;
  for intento in 1..10 loop
    v_code := private.codigo_clase();
    begin
      insert into public.classes (code, name, kind, owner_id, teacher_hash, max_players)
      values (v_code, v_name, 'aula', v_id, null, 60);
      return query select v_code, v_name;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'sin_codigo_libre';
end;
$$;

create or replace function public.prof_classes(p_token text)
returns table (
  code text, name text, players integer, last_run timestamptz,
  allowed_lists smallint[], allowed_difficulties text[], created_at timestamptz
)
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_id uuid := private.profe_de_sesion(p_token);
begin
  return query
    select c.code, c.name,
           (select count(*) from public.players p where p.class_id = c.id)::integer,
           (select max(r.created_at) from public.runs r join public.players p on p.id = r.player_id where p.class_id = c.id),
           c.allowed_lists, c.allowed_difficulties, c.created_at
    from public.classes c
    where c.owner_id = v_id and c.kind = 'aula'
    order by c.created_at desc;
end;
$$;

-- Si un alumno de la clase olvida su contraseña, el profesor le pone una temporal (se enseña una sola vez).
-- El alumno entra con ella y el juego le obliga a cambiarla. Se cierran sus sesiones abiertas.
create function public.prof_reset_student(p_token text, p_code text, p_alias text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
  v_account uuid;
  v_pass text := private.contrasena_temporal();
begin
  select account_id into v_account from public.players
  where class_id = v_class and lower(alias) = lower(btrim(coalesce(p_alias, '')));
  if not found then
    raise exception 'alumno_no_existe';
  end if;
  if v_account is null then
    raise exception 'alumno_sin_cuenta';
  end if;
  update public.accounts
  set pass_hash = extensions.crypt(v_pass, extensions.gen_salt('bf', 10)), must_change_password = true,
      failed_attempts = 0, locked_until = null
  where id = v_account;
  delete from public.account_sessions where account_id = v_account;
  return v_pass;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Limpieza por inactividad: ahora también cuentas de alumnado que llevan 12 meses sin entrar.
-- ---------------------------------------------------------------------------------------------
create or replace function private.purgar_clases_inactivas() returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.classes c
  where greatest(
          c.created_at,
          coalesce((select max(r.created_at) from public.runs r join public.players p on p.id = r.player_id where p.class_id = c.id), c.created_at)
        ) < now() - case c.kind when 'reto' then interval '3 months' else interval '12 months' end;
  get diagnostics n = row_count;
  delete from public.accounts a
  where a.last_login < now() - interval '12 months'
    and (a.role = 'alumno' or not exists (select 1 from public.classes c where c.owner_id = a.id));
  delete from public.account_sessions where expires_at < now();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos: solo estas funciones son ejecutables desde el navegador.
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  -- las anteriores a las cuentas (se quitarán cuando el cliente nuevo esté publicado)
  public.create_class(text),
  public.create_challenge(text, text),
  public.join_class(text, text),
  public.submit_run(uuid, text, integer, text, integer, integer, text[]),
  public.leave_class(uuid, text),
  public.teacher_remove_player(text, text, text),
  public.teacher_delete_class(text, text),
  -- públicas sin sesión
  public.class_info(text),
  public.class_ranking(text),
  -- cuentas
  public.account_register(text, text, text),
  public.account_login(text, text),
  public.account_reset_password(text, text, text),
  public.account_logout(text),
  public.account_me(text),
  public.account_change_password(text, text, text),
  public.account_delete(text, text),
  -- alumnado
  public.alu_save_progress(text, jsonb),
  public.alu_my_class(text),
  public.alu_join_class(text, text, text),
  public.alu_leave_class(text),
  public.alu_submit_run(text, integer, text, integer, integer, text[]),
  public.alu_create_challenge(text, text, text),
  public.alu_delete_challenge(text, text),
  -- profesorado
  public.prof_create_class(text, text),
  public.prof_classes(text),
  public.prof_set_config(text, text, smallint[], text[]),
  public.prof_progress(text, text),
  public.prof_misses(text, text),
  public.prof_remove_student(text, text, text),
  public.prof_reset_student(text, text, text),
  public.prof_delete_class(text, text)
to anon, authenticated;
