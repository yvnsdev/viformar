-- Migración idempotente de permisos para Viformar.
-- Roles admitidos: admin, teacher y student.
begin;

-- Convierte datos legados antes de restringir los valores permitidos.
update public.user_roles set role = 'teacher' where role = 'assistant';
update public.inscripciones set role_in_curso = 'teacher' where role_in_curso = 'assistant';
update public.inscripciones i
set role_in_curso = case when ur.role = 'teacher' then 'teacher' else 'student' end
from public.user_roles ur
where i.estudiante_id = ur.user_id and i.role_in_curso is null;
update public.inscripciones set role_in_curso = 'student' where role_in_curso is null;

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'teacher', 'student'));

alter table public.inscripciones drop constraint if exists inscripciones_role_in_curso_check;
alter table public.inscripciones alter column role_in_curso set default 'student';
alter table public.inscripciones alter column role_in_curso set not null;
alter table public.inscripciones add constraint inscripciones_role_in_curso_check
  check (role_in_curso in ('teacher', 'student'));

-- Algunas instalaciones antiguas no tienen aún las tablas de la ruta de aprendizaje.
create table if not exists public.curso_modulos (
  id uuid primary key default gen_random_uuid(),
  curso_id integer not null references public.cursos(id) on delete cascade,
  titulo text not null,
  orden integer not null default 1,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tests (
  id serial primary key,
  curso_id integer not null references public.cursos(id) on delete cascade,
  modulo_id uuid null references public.curso_modulos(id) on delete set null,
  titulo text not null,
  descripcion text null,
  fecha_limite timestamptz not null,
  puntaje_total numeric(8,2) not null,
  porcentaje_aprobacion numeric(5,2) not null default 60,
  preguntas jsonb not null default '[]'::jsonb,
  estado text not null default 'publicado',
  orden integer not null default 1,
  user_id uuid not null references auth.users(id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz null
);

create table if not exists public.test_intentos (
  id uuid primary key default gen_random_uuid(),
  test_id integer not null references public.tests(id) on delete cascade,
  curso_id integer not null references public.cursos(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id) on delete cascade,
  email text null,
  respuestas jsonb not null default '[]'::jsonb,
  puntaje_obtenido numeric(8,2) not null default 0,
  estado text not null default 'enviado',
  fecha_envio timestamptz not null default now(),
  fecha_correccion timestamptz null,
  corregido_por uuid null references auth.users(id),
  unique (test_id, estudiante_id)
);

create table if not exists public.progreso_contenido (
  id uuid primary key default gen_random_uuid(),
  curso_id integer not null references public.cursos(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id) on delete cascade,
  contenido_tipo text not null check (contenido_tipo in ('guia', 'capsula', 'test')),
  contenido_id text not null,
  estado text not null default 'completado' check (estado = 'completado'),
  completado_en timestamptz not null default now(),
  unique (estudiante_id, contenido_tipo, contenido_id)
);

create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  curso_id integer not null references public.cursos(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id) on delete cascade,
  nombre_estudiante text not null,
  documento_identidad text null,
  nombre_curso text not null,
  emitido_en timestamptz not null default now(),
  vigente_hasta date null,
  created_at timestamptz not null default now(),
  unique (curso_id, estudiante_id)
);

alter table public.guias add column if not exists modulo_id uuid null references public.curso_modulos(id) on delete set null;
alter table public.guias add column if not exists orden integer not null default 1;
alter table public.capsulas add column if not exists modulo_id uuid null references public.curso_modulos(id) on delete set null;
alter table public.capsulas add column if not exists orden integer not null default 1;
alter table public.tests add column if not exists modulo_id uuid null references public.curso_modulos(id) on delete set null;
alter table public.tests add column if not exists porcentaje_aprobacion numeric(5,2) not null default 60;
alter table public.tests add column if not exists orden integer not null default 1;
alter table public.tests add column if not exists preguntas jsonb not null default '[]'::jsonb;
alter table public.tests add column if not exists estado text not null default 'publicado';

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.current_user_has_any_role(roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_user_role() = any(roles), false);
$$;

create or replace function public.can_read_user_profile(profile_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select profile_user_id = auth.uid()
    or public.current_user_role() in ('admin', 'teacher')
    or exists (
      select 1
      from public.cursos c
      join public.inscripciones i on i.curso_id = c.id
      where c.user_id = profile_user_id and i.estudiante_id = auth.uid()
    );
$$;

create or replace function public.protect_user_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.current_user_is_admin() then
    raise exception 'Sólo un administrador puede cambiar roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_role_before_update on public.user_roles;
create trigger protect_user_role_before_update
before update on public.user_roles
for each row execute function public.protect_user_role();

create or replace function public.can_read_course(course_id integer)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_user_is_admin()
    or exists (
      select 1 from public.cursos c
      where c.id = $1
        and c.user_id = auth.uid()
        and public.current_user_role() = 'teacher'
    )
    or exists (
      select 1 from public.inscripciones i
      where i.curso_id = $1 and i.estudiante_id = auth.uid()
    );
$$;

create or replace function public.can_manage_course(course_id integer)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_user_is_admin()
    or (
      public.current_user_role() = 'teacher'
      and (
        exists (select 1 from public.cursos c where c.id = $1 and c.user_id = auth.uid())
        or exists (
          select 1 from public.inscripciones i
          where i.curso_id = $1
            and i.estudiante_id = auth.uid()
            and i.role_in_curso = 'teacher'
        )
      )
    );
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_has_any_role(text[]) from public;
revoke all on function public.can_read_user_profile(uuid) from public;
revoke all on function public.can_read_course(integer) from public;
revoke all on function public.can_manage_course(integer) from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_has_any_role(text[]) to authenticated;
grant execute on function public.can_read_user_profile(uuid) to authenticated;
grant execute on function public.can_read_course(integer) to authenticated;
grant execute on function public.can_manage_course(integer) to authenticated;

alter table public.user_roles enable row level security;
alter table public.cursos enable row level security;
alter table public.guias enable row level security;
alter table public.tareas enable row level security;
alter table public.capsulas enable row level security;
alter table public.inscripciones enable row level security;
alter table public.reuniones enable row level security;
alter table public.avisos enable row level security;
alter table public.clases enable row level security;
alter table public.asistencias enable row level security;
alter table public.entregas enable row level security;
alter table public.curso_modulos enable row level security;
alter table public.tests enable row level security;
alter table public.test_intentos enable row level security;
alter table public.progreso_contenido enable row level security;
alter table public.certificados enable row level security;

grant select, insert, update, delete on
  public.curso_modulos,
  public.tests,
  public.test_intentos,
  public.progreso_contenido,
  public.certificados
to authenticated;
do $$
begin
  if to_regclass('public.tests_id_seq') is not null then
    grant usage, select on sequence public.tests_id_seq to authenticated;
  end if;
end;
$$;

-- Perfiles y roles.
drop policy if exists "Usuarios autenticados pueden leer roles" on public.user_roles;
drop policy if exists "Usuarios pueden crear su rol inicial" on public.user_roles;
drop policy if exists "Usuarios pueden actualizar su perfil basico" on public.user_roles;
drop policy if exists "Admins pueden administrar roles" on public.user_roles;
create policy "Usuarios autenticados pueden leer roles" on public.user_roles
  for select to authenticated using (public.can_read_user_profile(user_id));
create policy "Usuarios pueden crear su rol inicial" on public.user_roles
  for insert to authenticated with check (user_id = auth.uid() and role = 'student');
create policy "Usuarios pueden actualizar su perfil basico" on public.user_roles
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = public.current_user_role());
create policy "Admins pueden administrar roles" on public.user_roles
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Cursos.
drop policy if exists "Cursos visibles segun rol" on public.cursos;
drop policy if exists "Profesores y admins crean cursos" on public.cursos;
drop policy if exists "Admins y creadores editan cursos" on public.cursos;
drop policy if exists "Admins y creadores eliminan cursos" on public.cursos;
create policy "Cursos visibles segun rol" on public.cursos
  for select to authenticated using (public.can_read_course(id));
create policy "Profesores y admins crean cursos" on public.cursos
  for insert to authenticated with check (user_id = auth.uid() and public.current_user_role() in ('admin', 'teacher'));
create policy "Admins y creadores editan cursos" on public.cursos
  for update to authenticated using (public.can_manage_course(id))
  with check (public.can_manage_course(id));
create policy "Admins y creadores eliminan cursos" on public.cursos
  for delete to authenticated using (public.current_user_is_admin() or (user_id = auth.uid() and public.current_user_role() = 'teacher'));

-- Contenido del curso.
drop policy if exists "Contenido visible por curso" on public.guias;
drop policy if exists "Contenido editable por gestores" on public.guias;
drop policy if exists "Contenido actualizable por gestores" on public.guias;
drop policy if exists "Contenido eliminable por profesores y admins" on public.guias;
create policy "Contenido visible por curso" on public.guias for select to authenticated
  using (public.can_manage_course(curso_id) or (public.can_read_course(curso_id) and visibilidad = 'publico'));
create policy "Contenido editable por gestores" on public.guias for insert to authenticated
  with check (user_id = auth.uid() and public.can_manage_course(curso_id));
create policy "Contenido actualizable por gestores" on public.guias for update to authenticated
  using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));
create policy "Contenido eliminable por profesores y admins" on public.guias for delete to authenticated
  using (public.can_manage_course(curso_id));

drop policy if exists "Tareas visibles por curso" on public.tareas;
drop policy if exists "Tareas creables por gestores" on public.tareas;
drop policy if exists "Tareas actualizables por gestores" on public.tareas;
drop policy if exists "Tareas eliminables por profesores y admins" on public.tareas;
create policy "Tareas visibles por curso" on public.tareas for select to authenticated using (public.can_read_course(curso_id));
create policy "Tareas creables por gestores" on public.tareas for insert to authenticated with check (user_id = auth.uid() and public.can_manage_course(curso_id));
create policy "Tareas actualizables por gestores" on public.tareas for update to authenticated using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));
create policy "Tareas eliminables por profesores y admins" on public.tareas for delete to authenticated using (public.can_manage_course(curso_id));

drop policy if exists "Capsulas visibles por curso" on public.capsulas;
drop policy if exists "Capsulas creables por gestores" on public.capsulas;
drop policy if exists "Capsulas actualizables por gestores" on public.capsulas;
drop policy if exists "Capsulas eliminables por profesores y admins" on public.capsulas;
create policy "Capsulas visibles por curso" on public.capsulas for select to authenticated using (public.can_read_course(curso_id));
create policy "Capsulas creables por gestores" on public.capsulas for insert to authenticated with check (user_id = auth.uid() and public.can_manage_course(curso_id));
create policy "Capsulas actualizables por gestores" on public.capsulas for update to authenticated using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));
create policy "Capsulas eliminables por profesores y admins" on public.capsulas for delete to authenticated using (public.can_manage_course(curso_id));

drop policy if exists "Modulos visibles por curso" on public.curso_modulos;
drop policy if exists "Modulos gestionables" on public.curso_modulos;
create policy "Modulos visibles por curso" on public.curso_modulos for select to authenticated using (public.can_read_course(curso_id));
create policy "Modulos gestionables" on public.curso_modulos for all to authenticated
  using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id) and user_id = auth.uid());

drop policy if exists "Tests visibles por curso" on public.tests;
drop policy if exists "Tests gestionables" on public.tests;
create policy "Tests visibles por curso" on public.tests for select to authenticated
  using (public.can_manage_course(curso_id) or (public.can_read_course(curso_id) and estado = 'publicado'));
create policy "Tests gestionables" on public.tests for all to authenticated
  using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id) and user_id = auth.uid());

-- Matrículas: el alumno sólo ve la propia; el profesor sólo administra alumnos de sus cursos.
drop policy if exists "Inscripciones visibles segun curso" on public.inscripciones;
drop policy if exists "Inscripciones creables por profesores y admins" on public.inscripciones;
drop policy if exists "Inscripciones actualizables por administradores" on public.inscripciones;
drop policy if exists "Inscripciones eliminables por profesores y admins" on public.inscripciones;
create policy "Inscripciones visibles segun curso" on public.inscripciones for select to authenticated
  using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));
create policy "Inscripciones creables por profesores y admins" on public.inscripciones for insert to authenticated
  with check (public.current_user_is_admin() or (public.current_user_role() = 'teacher' and public.can_manage_course(curso_id) and role_in_curso = 'student'));
create policy "Inscripciones actualizables por administradores" on public.inscripciones for update to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "Inscripciones eliminables por profesores y admins" on public.inscripciones for delete to authenticated
  using (public.current_user_is_admin() or (public.current_user_role() = 'teacher' and role_in_curso = 'student' and public.can_manage_course(curso_id)));

-- Clases, asistencia, entregas, evaluaciones y progreso privado.
drop policy if exists "Clases visibles por curso" on public.clases;
drop policy if exists "Clases creables por gestores" on public.clases;
drop policy if exists "Clases actualizables por gestores" on public.clases;
drop policy if exists "Clases eliminables por profesores y admins" on public.clases;
create policy "Clases visibles por curso" on public.clases for select to authenticated using (public.can_read_course(curso_id));
create policy "Clases creables por gestores" on public.clases for insert to authenticated with check (user_id = auth.uid() and public.can_manage_course(curso_id));
create policy "Clases actualizables por gestores" on public.clases for update to authenticated using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));
create policy "Clases eliminables por profesores y admins" on public.clases for delete to authenticated using (public.can_manage_course(curso_id));

drop policy if exists "Asistencias visibles por clase" on public.asistencias;
drop policy if exists "Asistencias creables por gestores" on public.asistencias;
drop policy if exists "Asistencias actualizables por gestores" on public.asistencias;
drop policy if exists "Asistencias eliminables por profesores y admins" on public.asistencias;
create policy "Asistencias visibles por clase" on public.asistencias for select to authenticated using (
  estudiante_id = auth.uid() or exists (select 1 from public.clases c where c.id = clase_id and public.can_manage_course(c.curso_id))
);
create policy "Asistencias creables por gestores" on public.asistencias for insert to authenticated with check (
  exists (select 1 from public.clases c where c.id = clase_id and public.can_manage_course(c.curso_id))
);
create policy "Asistencias actualizables por gestores" on public.asistencias for update to authenticated using (
  exists (select 1 from public.clases c where c.id = clase_id and public.can_manage_course(c.curso_id))
) with check (
  exists (select 1 from public.clases c where c.id = clase_id and public.can_manage_course(c.curso_id))
);
create policy "Asistencias eliminables por profesores y admins" on public.asistencias for delete to authenticated using (
  exists (select 1 from public.clases c where c.id = clase_id and public.can_manage_course(c.curso_id))
);

drop policy if exists "Entregas visibles por curso o estudiante" on public.entregas;
drop policy if exists "Entregas creables por estudiante" on public.entregas;
drop policy if exists "Entregas actualizables por gestores" on public.entregas;
drop policy if exists "Entregas eliminables por estudiante o admin" on public.entregas;
create policy "Entregas visibles por curso o estudiante" on public.entregas for select to authenticated
  using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));
create policy "Entregas creables por estudiante" on public.entregas for insert to authenticated with check (
  estudiante_id = auth.uid() and public.current_user_role() = 'student'
  and exists (select 1 from public.inscripciones i where i.curso_id = entregas.curso_id and i.estudiante_id = auth.uid() and i.role_in_curso = 'student')
);
create policy "Entregas actualizables por gestores" on public.entregas for update to authenticated
  using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));
create policy "Entregas eliminables por estudiante o admin" on public.entregas for delete to authenticated
  using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));

drop policy if exists "Intentos visibles para participante" on public.test_intentos;
drop policy if exists "Estudiantes crean sus intentos" on public.test_intentos;
drop policy if exists "Gestores corrigen intentos" on public.test_intentos;
create policy "Intentos visibles para participante" on public.test_intentos for select to authenticated using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));
create policy "Estudiantes crean sus intentos" on public.test_intentos for insert to authenticated with check (estudiante_id = auth.uid() and public.current_user_role() = 'student' and public.can_read_course(curso_id));
create policy "Gestores corrigen intentos" on public.test_intentos for update to authenticated using (public.can_manage_course(curso_id)) with check (public.can_manage_course(curso_id));

drop policy if exists "Progreso propio" on public.progreso_contenido;
drop policy if exists "Estudiantes registran su progreso" on public.progreso_contenido;
drop policy if exists "Estudiantes actualizan su progreso" on public.progreso_contenido;
create policy "Progreso propio" on public.progreso_contenido for select to authenticated using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));
create policy "Estudiantes registran su progreso" on public.progreso_contenido for insert to authenticated with check (estudiante_id = auth.uid() and public.current_user_role() = 'student' and public.can_read_course(curso_id));
create policy "Estudiantes actualizan su progreso" on public.progreso_contenido for update to authenticated using (estudiante_id = auth.uid() and public.current_user_role() = 'student') with check (estudiante_id = auth.uid() and public.current_user_role() = 'student');

drop policy if exists "Certificados propios o gestionables" on public.certificados;
create policy "Certificados propios o gestionables" on public.certificados for select to authenticated using (estudiante_id = auth.uid() or public.can_manage_course(curso_id));

-- Reuniones y avisos.
drop policy if exists "Reuniones visibles por curso" on public.reuniones;
drop policy if exists "Reuniones creables por gestores" on public.reuniones;
drop policy if exists "Reuniones actualizables por gestores" on public.reuniones;
drop policy if exists "Reuniones eliminables por gestores" on public.reuniones;
create policy "Reuniones visibles por curso" on public.reuniones for select to authenticated using (curso_id is null or public.can_read_course(curso_id::integer));
create policy "Reuniones creables por gestores" on public.reuniones for insert to authenticated with check (user_id = auth.uid() and curso_id is not null and public.can_manage_course(curso_id::integer));
create policy "Reuniones actualizables por gestores" on public.reuniones for update to authenticated using (curso_id is not null and public.can_manage_course(curso_id::integer)) with check (curso_id is not null and public.can_manage_course(curso_id::integer));
create policy "Reuniones eliminables por gestores" on public.reuniones for delete to authenticated using (curso_id is not null and public.can_manage_course(curso_id::integer));

drop policy if exists "Avisos visibles para autenticados" on public.avisos;
drop policy if exists "Avisos creables por staff" on public.avisos;
drop policy if exists "Avisos actualizables por staff" on public.avisos;
drop policy if exists "Avisos eliminables por profesores y admins" on public.avisos;
create policy "Avisos visibles para autenticados" on public.avisos for select to authenticated using (true);
create policy "Avisos creables por staff" on public.avisos for insert to authenticated with check (user_id = auth.uid() and public.current_user_role() in ('admin', 'teacher'));
create policy "Avisos actualizables por staff" on public.avisos for update to authenticated using (public.current_user_is_admin() or (user_id = auth.uid() and public.current_user_role() = 'teacher')) with check (public.current_user_is_admin() or (user_id = auth.uid() and public.current_user_role() = 'teacher'));
create policy "Avisos eliminables por profesores y admins" on public.avisos for delete to authenticated using (public.current_user_is_admin() or (user_id = auth.uid() and public.current_user_role() = 'teacher'));

-- Archivos: alumnos sólo controlan su carpeta de entregas; docentes, sus propios objetos.
drop policy if exists "Staff puede subir archivos de contenido" on storage.objects;
drop policy if exists "Staff puede subir archivos" on storage.objects;
drop policy if exists "Staff puede actualizar archivos de contenido" on storage.objects;
drop policy if exists "Staff puede actualizar archivos" on storage.objects;
drop policy if exists "Staff puede eliminar archivos" on storage.objects;
create policy "Staff puede subir archivos de contenido" on storage.objects for insert to authenticated with check (
  bucket_id = 'archivos' and public.current_user_role() in ('admin', 'teacher')
  and (name like 'guias/%' or name like 'tareas/%' or name like 'entregas/%')
);
create policy "Staff puede actualizar archivos de contenido" on storage.objects for update to authenticated
  using (bucket_id = 'archivos' and (public.current_user_is_admin() or (public.current_user_role() = 'teacher' and owner_id::text = auth.uid()::text)))
  with check (bucket_id = 'archivos' and public.current_user_role() in ('admin', 'teacher'));
create policy "Staff puede eliminar archivos" on storage.objects for delete to authenticated using (
  bucket_id = 'archivos' and (
    public.current_user_is_admin()
    or (public.current_user_role() = 'teacher' and owner_id::text = auth.uid()::text)
    or name like ('entregas/' || auth.uid()::text || '/%')
  )
);

commit;
