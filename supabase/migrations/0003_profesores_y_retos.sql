-- Pipo y los verbos irregulares: cuentas de profesor, clases de aula y retos entre amigos.
--
-- Hay dos tipos de clase:
--   * «aula»: la crea un profesor con cuenta (usuario y contraseña, sin correo). Puede tener varias, configurar
--     qué dificultades y listas de verbos se pueden jugar, y ver por alumno los niveles jugados y los verbos fallados.
--   * «reto»: la crea un alumno para sus amigos («Reta a tus amigos»). Hasta 30 personas, todo abierto, solo ranking:
--     NO se guardan los verbos fallados. Es lo que ya hacía create_class, que sigue funcionando igual.
--
-- Contraseñas: bcrypt (pgcrypto), nunca en claro. Sin correo, la recuperación es con un código que se enseña una
-- sola vez al crear la cuenta (y cada vez que se cambia la contraseña); en la base de datos solo queda su hash.
-- Tras 5 fallos seguidos la cuenta se bloquea 15 minutos. Los fallos NO lanzan excepción: una excepción
-- desharía el contador de intentos, así que devuelven una fila con el campo «error».
--
-- Se aplica DESPUÉS de 0001. Es compatible con el juego ya publicado (create_class y submit_run con 6 argumentos
-- siguen funcionando).

-- ---------------------------------------------------------------------------------------------
-- Tablas nuevas
-- ---------------------------------------------------------------------------------------------
create table public.teachers (
  id              uuid primary key default gen_random_uuid(),
  username        text not null check (username ~ '^[A-Za-z0-9._-]{3,30}$'),
  pass_hash       text not null,
  recovery_hash   text not null,
  failed_attempts smallint not null default 0,
  locked_until    timestamptz,
  last_login      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create unique index teachers_usuario_unico on public.teachers (lower(username));

create table public.teacher_sessions (
  token_hash text primary key,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days'
);
create index teacher_sessions_por_profe on public.teacher_sessions (teacher_id);

-- Verbos fallados en una partida de una clase de aula (solo el verbo y las veces; nunca lo que se escribió).
create table public.run_misses (
  run_id bigint not null references public.runs (id) on delete cascade,
  verb   text not null check (verb ~ '^[a-z][a-z '' -]{0,29}$'),
  times  smallint not null check (times between 1 and 24),
  primary key (run_id, verb)
);

alter table public.classes
  add column kind text not null default 'reto' check (kind in ('aula', 'reto')),
  add column teacher_id uuid references public.teachers (id) on delete cascade,
  add column allowed_lists smallint[] not null default '{1,2,3,4,5,6}',
  add column allowed_difficulties text[] not null default '{easy,normal,hard}',
  add column max_players smallint not null default 30,
  alter column teacher_hash drop not null,
  add constraint classes_tipo check (
    (kind = 'reto' and teacher_hash is not null and teacher_id is null)
    or (kind = 'aula' and teacher_id is not null and teacher_hash is null)),
  add constraint classes_config check (
    cardinality(allowed_lists) between 1 and 6
    and allowed_lists <@ array[1, 2, 3, 4, 5, 6]::smallint[]
    and cardinality(allowed_difficulties) between 1 and 3
    and allowed_difficulties <@ array['easy', 'normal', 'hard']);
create index classes_por_profe on public.classes (teacher_id);

alter table public.teachers enable row level security;
alter table public.teacher_sessions enable row level security;
alter table public.run_misses enable row level security;
revoke all on public.teachers, public.teacher_sessions, public.run_misses from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ayudantes privados
-- ---------------------------------------------------------------------------------------------
create function private.nombre_de_clase_valido(p_name text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when char_length(n) between 1 and 40 and n !~ '[[:cntrl:]<>&"''`\\]' then n
  end
  from (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as n) t
$$;

create function private.contrasena_valida(p_password text) returns boolean
language sql immutable
set search_path = ''
as $$ select char_length(coalesce(p_password, '')) between 8 and 72 $$;

-- Código de recuperación: 40 caracteres hexadecimales (160 bits).
create function private.clave_recuperacion() returns text
language sql volatile
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(20), 'hex') $$;

-- Las comparaciones ignoran mayúsculas, espacios y guiones, para que se pueda escribir agrupado.
create function private.hash_recuperacion(p_code text) returns text
language sql immutable
set search_path = ''
as $$ select private.hash(regexp_replace(lower(coalesce(p_code, '')), '[^0-9a-f]', '', 'g')) $$;

create function private.sesion_nueva(p_teacher uuid) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_token text := private.secreto();
begin
  delete from public.teacher_sessions where teacher_id = p_teacher and expires_at < now();
  insert into public.teacher_sessions (token_hash, teacher_id) values (private.hash(v_token), p_teacher);
  return v_token;
end;
$$;

create function private.profe_de_sesion(p_token text) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select teacher_id into v_id
  from public.teacher_sessions
  where token_hash = private.hash(p_token) and expires_at > now();
  if v_id is null then
    raise exception 'sesion_no_valida';
  end if;
  return v_id;
end;
$$;

create function private.clase_de_profe(p_teacher uuid, p_code text) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.classes
  where teacher_id = p_teacher and code = upper(btrim(coalesce(p_code, '')));
  if v_id is null then
    raise exception 'clase_no_existe';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Cuentas de profesor
-- ---------------------------------------------------------------------------------------------
create function public.prof_register(p_username text, p_password text)
returns table (token text, recovery_code text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user text := btrim(coalesce(p_username, ''));
  v_id uuid;
  v_recovery text := private.clave_recuperacion();
begin
  if v_user !~ '^[A-Za-z0-9._-]{3,30}$' then
    raise exception 'usuario_invalido';
  end if;
  if not private.contrasena_valida(p_password) then
    raise exception 'contrasena_invalida';
  end if;
  -- Freno general contra el alta masiva de cuentas.
  if (select count(*) from public.teachers where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'demasiado_rapido';
  end if;
  begin
    insert into public.teachers (username, pass_hash, recovery_hash)
    values (v_user, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), private.hash_recuperacion(v_recovery))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'usuario_en_uso';
  end;
  return query select private.sesion_nueva(v_id), v_recovery;
end;
$$;

create function public.prof_login(p_username text, p_password text)
returns table (token text, error text)
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.teachers;
begin
  select * into t from public.teachers where lower(username) = lower(btrim(coalesce(p_username, ''))) for update;
  if not found then
    -- Se gasta el mismo tiempo que con un usuario real, para no delatar qué usuarios existen.
    perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10));
    return query select null::text, 'credenciales_invalidas'::text;
    return;
  end if;
  if t.locked_until is not null and t.locked_until > now() then
    return query select null::text, 'cuenta_bloqueada'::text;
    return;
  end if;
  if t.pass_hash = extensions.crypt(coalesce(p_password, ''), t.pass_hash) then
    update public.teachers set failed_attempts = 0, locked_until = null, last_login = now() where id = t.id;
    return query select private.sesion_nueva(t.id), null::text;
    return;
  end if;
  if t.failed_attempts + 1 >= 5 then
    update public.teachers set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = t.id;
    return query select null::text, 'cuenta_bloqueada'::text;
  else
    update public.teachers set failed_attempts = failed_attempts + 1 where id = t.id;
    return query select null::text, 'credenciales_invalidas'::text;
  end if;
end;
$$;

-- Contraseña olvidada: con el código de recuperación se pone una nueva. El código se renueva y se cierran
-- todas las sesiones abiertas.
create function public.prof_reset_password(p_username text, p_recovery_code text, p_new_password text)
returns table (token text, recovery_code text, error text)
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.teachers;
  v_recovery text := private.clave_recuperacion();
begin
  if not private.contrasena_valida(p_new_password) then
    raise exception 'contrasena_invalida';
  end if;
  select * into t from public.teachers where lower(username) = lower(btrim(coalesce(p_username, ''))) for update;
  if not found then
    return query select null::text, null::text, 'credenciales_invalidas'::text;
    return;
  end if;
  if t.locked_until is not null and t.locked_until > now() then
    return query select null::text, null::text, 'cuenta_bloqueada'::text;
    return;
  end if;
  if t.recovery_hash <> private.hash_recuperacion(p_recovery_code) then
    if t.failed_attempts + 1 >= 5 then
      update public.teachers set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = t.id;
      return query select null::text, null::text, 'cuenta_bloqueada'::text;
    else
      update public.teachers set failed_attempts = failed_attempts + 1 where id = t.id;
      return query select null::text, null::text, 'credenciales_invalidas'::text;
    end if;
    return;
  end if;
  update public.teachers
  set pass_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      recovery_hash = private.hash_recuperacion(v_recovery),
      failed_attempts = 0, locked_until = null, last_login = now()
  where id = t.id;
  delete from public.teacher_sessions where teacher_id = t.id;
  return query select private.sesion_nueva(t.id), v_recovery, null::text;
end;
$$;

create function public.prof_logout(p_token text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.teacher_sessions where token_hash = private.hash(p_token);
  return found;
end;
$$;

-- Borra la cuenta y, con ella, todas sus clases, alumnos y partidas. Pide la contraseña otra vez.
create function public.prof_delete_account(p_token text, p_password text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := private.profe_de_sesion(p_token);
  t public.teachers;
begin
  select * into t from public.teachers where id = v_id;
  if t.pass_hash <> extensions.crypt(coalesce(p_password, ''), t.pass_hash) then
    raise exception 'credenciales_invalidas';
  end if;
  delete from public.teachers where id = v_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Clases de aula (profesor)
-- ---------------------------------------------------------------------------------------------
create function public.prof_create_class(p_token text, p_name text)
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
  if (select count(*) from public.classes where teacher_id = v_id) >= 20 then
    raise exception 'demasiadas_clases';
  end if;
  for intento in 1..10 loop
    v_code := private.codigo_clase();
    begin
      insert into public.classes (code, name, kind, teacher_id, teacher_hash, max_players)
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

create function public.prof_classes(p_token text)
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
    where c.teacher_id = v_id
    order by c.created_at desc;
end;
$$;

-- Qué listas de verbos y qué dificultades pueden jugar los alumnos de la clase.
create function public.prof_set_config(p_token text, p_code text, p_lists smallint[], p_difficulties text[])
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
  v_lists smallint[] := array(select distinct x from unnest(coalesce(p_lists, '{}')) x order by 1);
  v_diffs text[] := array(select distinct x from unnest(coalesce(p_difficulties, '{}')) x order by 1);
begin
  if cardinality(v_lists) not between 1 and 6 or not (v_lists <@ array[1, 2, 3, 4, 5, 6]::smallint[])
     or cardinality(v_diffs) not between 1 and 3 or not (v_diffs <@ array['easy', 'normal', 'hard']) then
    raise exception 'configuracion_invalida';
  end if;
  update public.classes set allowed_lists = v_lists, allowed_difficulties = v_diffs where id = v_class;
  return true;
end;
$$;

-- Seguimiento: por alumno, qué niveles y dificultades ha jugado (una fila por combinación; los alumnos que
-- aún no han jugado salen con el nivel vacío).
create function public.prof_progress(p_token text, p_code text)
returns table (
  alias text, level smallint, difficulty text, plays integer,
  best_stars smallint, best_points integer, last_played timestamptz
)
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
begin
  return query
    select p.alias, r.level, r.difficulty, count(r.id)::integer, max(r.stars)::smallint, max(r.points)::integer,
           max(r.created_at)
    from public.players p
    left join public.runs r on r.player_id = p.id
    where p.class_id = v_class
    group by p.id, p.alias, r.level, r.difficulty
    order by lower(p.alias), r.level, r.difficulty;
end;
$$;

-- Seguimiento: verbos fallados por alumno y cuántas veces.
create function public.prof_misses(p_token text, p_code text)
returns table (alias text, verb text, times integer)
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
begin
  return query
    select p.alias, m.verb, sum(m.times)::integer
    from public.players p
    join public.runs r on r.player_id = p.id
    join public.run_misses m on m.run_id = r.id
    where p.class_id = v_class
    group by p.id, p.alias, m.verb
    order by lower(p.alias), 3 desc, m.verb;
end;
$$;

create function public.prof_remove_student(p_token text, p_code text, p_alias text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
begin
  delete from public.players where class_id = v_class and lower(alias) = lower(btrim(coalesce(p_alias, '')));
  return found;
end;
$$;

create function public.prof_delete_class(p_token text, p_code text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class uuid := private.clase_de_profe(private.profe_de_sesion(p_token), p_code);
begin
  delete from public.classes where id = v_class;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Retos entre amigos (alumno) y datos públicos de una clase
-- ---------------------------------------------------------------------------------------------

-- create_class sigue igual que antes, con un freno general contra la creación masiva de retos.
create or replace function public.create_class(p_name text)
returns table (code text, teacher_secret text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.nombre_de_clase_valido(p_name);
  v_code text;
  v_secret text := private.secreto();
begin
  if v_name is null then
    raise exception 'nombre_invalido';
  end if;
  if (select count(*) from public.classes where kind = 'reto' and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'demasiado_rapido';
  end if;
  for intento in 1..10 loop
    v_code := private.codigo_clase();
    begin
      insert into public.classes (code, name, teacher_hash) values (v_code, v_name, private.hash(v_secret));
      return query select v_code, v_secret;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'sin_codigo_libre';
end;
$$;

-- «Reta a tus amigos»: crea el reto y mete dentro a quien lo crea, con su apodo.
create function public.create_challenge(p_name text, p_alias text)
returns table (code text, teacher_secret text, player_id uuid, player_secret text, class_name text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_alias text := private.apodo_limpio(p_alias);
  v_code text;
  v_teacher_secret text;
  v_player_secret text := private.secreto();
  v_player uuid;
  v_name text := private.nombre_de_clase_valido(p_name);
begin
  if v_alias is null then
    raise exception 'apodo_invalido';
  end if;
  select c.code, c.teacher_secret into v_code, v_teacher_secret from public.create_class(p_name) c;
  insert into public.players (class_id, alias, secret_hash)
  select id, v_alias, private.hash(v_player_secret) from public.classes where classes.code = v_code
  returning id into v_player;
  return query select v_code, v_teacher_secret, v_player, v_player_secret, v_name;
end;
$$;

-- join_class igual que antes, pero el tope de alumnos depende del tipo de clase.
create or replace function public.join_class(p_code text, p_alias text)
returns table (player_id uuid, player_secret text, class_name text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_alias text := private.apodo_limpio(p_alias);
  v_secret text := private.secreto();
  v_id uuid;
begin
  if v_alias is null then
    raise exception 'apodo_invalido';
  end if;
  select * into v_class from public.classes where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'clase_no_existe';
  end if;
  if (select count(*) from public.players where class_id = v_class.id) >= v_class.max_players then
    raise exception 'clase_llena';
  end if;
  begin
    insert into public.players (class_id, alias, secret_hash)
    values (v_class.id, v_alias, private.hash(v_secret))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'apodo_en_uso';
  end;
  return query select v_id, v_secret, v_class.name;
end;
$$;

-- Lo que necesita saber el juego de una clase para configurarse (sin nada privado).
create function public.class_info(p_code text)
returns table (name text, kind text, allowed_lists smallint[], allowed_difficulties text[])
language plpgsql security definer stable
set search_path = ''
as $$
begin
  return query
    select c.name, c.kind, c.allowed_lists, c.allowed_difficulties
    from public.classes c where c.code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'clase_no_existe';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- submit_run: ahora respeta las dificultades permitidas y, solo en clases de aula, guarda los verbos fallados.
-- ---------------------------------------------------------------------------------------------
drop function public.submit_run(uuid, text, integer, text, integer, integer);
create function public.submit_run(
  p_player uuid, p_secret text, p_level integer, p_difficulty text, p_correct integer, p_mistakes integer,
  p_misses text[] default null
) returns table (points integer, stars integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_class public.classes;
  v_stars integer;
  v_points integer;
  v_extra integer;
  v_run bigint;
begin
  select * into v_player from public.players where id = p_player and secret_hash = private.hash(p_secret);
  if not found then
    raise exception 'jugador_no_valido';
  end if;
  select * into v_class from public.classes where id = v_player.class_id;
  if p_level is null or p_level not between 0 and 4
     or p_difficulty is null or p_difficulty not in ('easy', 'normal', 'hard')
     or p_correct is null or p_correct not between 1 and 200
     or p_mistakes is null or p_mistakes < 0
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

-- ---------------------------------------------------------------------------------------------
-- Limpieza por inactividad: retos a los 3 meses, clases de aula a los 12, y cuentas de profesor sin clases
-- y sin entrar en 12 meses. Sigue sin ser pública; la programación de pg_cron (0002) la llama por su nombre.
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
  delete from public.teachers t
  where t.last_login < now() - interval '12 months'
    and not exists (select 1 from public.classes c where c.teacher_id = t.id);
  delete from public.teacher_sessions where expires_at < now();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos: solo estas funciones son ejecutables desde el navegador.
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_class(text),
  public.create_challenge(text, text),
  public.join_class(text, text),
  public.class_info(text),
  public.submit_run(uuid, text, integer, text, integer, integer, text[]),
  public.class_ranking(text),
  public.leave_class(uuid, text),
  public.teacher_remove_player(text, text, text),
  public.teacher_delete_class(text, text),
  public.prof_register(text, text),
  public.prof_login(text, text),
  public.prof_reset_password(text, text, text),
  public.prof_logout(text),
  public.prof_delete_account(text, text),
  public.prof_create_class(text, text),
  public.prof_classes(text),
  public.prof_set_config(text, text, smallint[], text[]),
  public.prof_progress(text, text),
  public.prof_misses(text, text),
  public.prof_remove_student(text, text, text),
  public.prof_delete_class(text, text)
to anon, authenticated;
