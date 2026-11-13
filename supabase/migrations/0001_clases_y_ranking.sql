-- Pipo y los verbos irregulares: clases y ranking (fase 2).
--
-- Principios (ver «Privacidad y menores» en el README):
--   * Solo se guarda un apodo, el código de una clase y resultados. Nada de email, nombre real ni analítica.
--   * Las tablas están cerradas: el navegador solo puede llamar a las funciones de abajo (RPC), que validan todo.
--   * Quien se une a una clase recibe un secreto aleatorio que solo guarda su navegador; en la base de datos
--     solo queda su hash (SHA-256). Lo mismo con la clave de la persona que crea la clase.
--   * Los puntos los calcula el servidor. Un juego que corre en el navegador no se puede blindar del todo:
--     el servidor rechaza valores imposibles y limita la frecuencia, pero no puede probar que una partida fuera real.
--   * Se puede borrar todo: el propio alumno, quien creó la clase, o automáticamente por inactividad.
--
-- Pensado para Supabase (PostgreSQL, región de la UE). Los roles «anon» y «authenticated» y el esquema
-- «extensions» ya existen allí.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Esquema privado: ayudantes que nunca se exponen por la API
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.hash(p_secret text) returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') $$;

create function private.secreto() returns text
language sql volatile
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(16), 'hex') $$;

-- Código de clase: 6 caracteres de un alfabeto de 32 (sin I, O, 0 ni 1, que se confunden). 32 divide a 256,
-- así que el módulo no introduce sesgo.
create function private.codigo_clase() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(6);
  res text := '';
begin
  for i in 0..5 loop
    res := res || substr(alfabeto, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return res;
end;
$$;

-- Apodo limpio: espacios de más fuera. Devuelve null si no es válido (2 a 20 caracteres, sin símbolos
-- peligrosos ni caracteres de control).
create function private.apodo_limpio(p_alias text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when a is not null
     and char_length(a) between 2 and 20
     and a ~ '^[^[:cntrl:]<>&"''`\\/@]+$'
    then a
  end
  from (select btrim(regexp_replace(coalesce(p_alias, ''), '\s+', ' ', 'g')) as a) t
$$;

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------
create table public.classes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name         text not null check (char_length(name) between 1 and 40),
  teacher_hash text not null,
  created_at   timestamptz not null default now()
);

create table public.players (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  alias       text not null check (private.apodo_limpio(alias) = alias),
  secret_hash text not null,
  created_at  timestamptz not null default now()
);
create unique index players_apodo_unico on public.players (class_id, lower(alias));

create table public.runs (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  level      smallint not null check (level between 0 and 4),
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  correct    integer not null check (correct between 1 and 200),
  mistakes   integer not null check (mistakes between 0 and 24),
  stars      smallint not null check (stars between 1 and 3),
  points     integer not null check (points >= 0),
  created_at timestamptz not null default now()
);
create index runs_por_jugador on public.runs (player_id, created_at desc);

-- Tablas cerradas: con RLS activado y sin ninguna política, ni «anon» ni «authenticated» pueden leer ni escribir.
-- Además se quitan los permisos (Supabase concede por defecto a esos roles en las tablas nuevas).
alter table public.classes enable row level security;
alter table public.players enable row level security;
alter table public.runs enable row level security;
revoke all on public.classes, public.players, public.runs from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Funciones que usa el juego (RPC). Todas «security definer»: se ejecutan con los permisos del propietario,
-- que es quien puede tocar las tablas, y validan cada entrada.
-- ---------------------------------------------------------------------------------------------

-- Crea una clase. Devuelve el código (para los alumnos) y la clave de quien la crea, que no se puede recuperar.
create function public.create_class(p_name text)
returns table (code text, teacher_secret text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_code text;
  v_secret text := private.secreto();
begin
  if char_length(v_name) not between 1 and 40 or v_name ~ '[[:cntrl:]<>&"''`\\]' then
    raise exception 'nombre_invalido';
  end if;
  for intento in 1..10 loop
    v_code := private.codigo_clase();
    begin
      insert into public.classes (code, name, teacher_hash) values (v_code, v_name, private.hash(v_secret));
      return query select v_code, v_secret;
      return;
    exception when unique_violation then
      null; -- código repetido: se prueba con otro
    end;
  end loop;
  raise exception 'sin_codigo_libre';
end;
$$;

-- Un alumno se une a una clase con su apodo. Devuelve su identificador y su secreto (solo se muestran ahora).
create function public.join_class(p_code text, p_alias text)
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
  if (select count(*) from public.players where class_id = v_class.id) >= 60 then
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

-- Envía una partida terminada. Los puntos y las estrellas los calcula el servidor.
-- PROVISIONAL: la fórmula de puntos está pendiente de decidir (ver «Fórmula de puntos» en el README).
--   puntos = aciertos x (10 + extra de dificultad) + estrellas x 50,  con extra = 0 / 2 / 5 (fácil / normal / difícil)
create function public.submit_run(
  p_player uuid, p_secret text, p_level integer, p_difficulty text, p_correct integer, p_mistakes integer
) returns table (points integer, stars integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_stars integer;
  v_points integer;
  v_extra integer;
begin
  select * into v_player from public.players where id = p_player and secret_hash = private.hash(p_secret);
  if not found then
    raise exception 'jugador_no_valido';
  end if;
  if p_level is null or p_level not between 0 and 4
     or p_difficulty is null or p_difficulty not in ('easy', 'normal', 'hard')
     or p_correct is null or p_correct not between 1 and 200
     or p_mistakes is null or p_mistakes < 0
     -- Una partida terminada tiene al menos una vida: 5 al empezar, +1 cada 10 aciertos seguidos.
     or p_mistakes > 4 + p_correct / 10 then
    raise exception 'partida_imposible';
  end if;
  if exists (select 1 from public.runs where player_id = p_player and created_at > now() - interval '10 seconds') then
    raise exception 'demasiado_rapido';
  end if;
  v_stars := case when p_mistakes = 0 then 3 when p_mistakes <= 2 then 2 else 1 end;
  v_extra := case p_difficulty when 'easy' then 0 when 'normal' then 2 else 5 end;
  v_points := p_correct * (10 + v_extra) + v_stars * 50;
  insert into public.runs (player_id, level, difficulty, correct, mistakes, stars, points)
  values (p_player, p_level, p_difficulty, p_correct, p_mistakes, v_stars, v_points);
  return query select v_points, v_stars;
end;
$$;

-- Ranking de una clase: solo apodos y puntos (sin identificadores). Cuenta la mejor partida de cada
-- nivel y dificultad, para que repetir un nivel no permita acumular puntos sin límite.
create function public.class_ranking(p_code text)
returns table (alias text, points integer, levels integer)
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  select id into v_class_id from public.classes where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'clase_no_existe';
  end if;
  return query
    select p.alias, coalesce(sum(b.mejor), 0)::integer, count(b.mejor)::integer
    from public.players p
    left join (
      select r.player_id, max(r.points) as mejor
      from public.runs r
      group by r.player_id, r.level, r.difficulty
    ) b on b.player_id = p.id
    where p.class_id = v_class_id
    group by p.id, p.alias
    order by 2 desc, p.alias
    limit 100;
end;
$$;

-- El propio alumno puede borrarse (y con él, sus partidas).
create function public.leave_class(p_player uuid, p_secret text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.players where id = p_player and secret_hash = private.hash(p_secret);
  return found;
end;
$$;

-- Quien creó la clase puede borrar a un alumno concreto...
create function public.teacher_remove_player(p_code text, p_teacher_secret text, p_alias text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.players p
  using public.classes c
  where p.class_id = c.id
    and c.code = upper(btrim(coalesce(p_code, '')))
    and c.teacher_hash = private.hash(p_teacher_secret)
    and lower(p.alias) = lower(btrim(coalesce(p_alias, '')));
  return found;
end;
$$;

-- ...o la clase entera (alumnos y partidas incluidos).
create function public.teacher_delete_class(p_code text, p_teacher_secret text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.classes
  where code = upper(btrim(coalesce(p_code, ''))) and teacher_hash = private.hash(p_teacher_secret);
  return found;
end;
$$;

-- Limpieza por inactividad: borra las clases sin ninguna partida en los últimos 12 meses (o sin partidas y creadas
-- hace más de 12 meses). NO es pública. Hay que programarla en Supabase (pg_cron), por ejemplo una vez al día:
--   select cron.schedule('purgar-clases-inactivas', '0 4 * * *', 'select private.purgar_clases_inactivas()');
create function private.purgar_clases_inactivas() returns integer
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
        ) < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Permisos de ejecución: por defecto PostgreSQL deja ejecutar cualquier función a todo el mundo; aquí solo las siete públicas.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_class(text),
  public.join_class(text, text),
  public.submit_run(uuid, text, integer, text, integer, integer),
  public.class_ranking(text),
  public.leave_class(uuid, text),
  public.teacher_remove_player(text, text, text),
  public.teacher_delete_class(text, text)
to anon, authenticated;
