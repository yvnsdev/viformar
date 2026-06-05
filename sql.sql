create table public.asistencias (
  id uuid not null default extensions.uuid_generate_v4 (),
  clase_id uuid not null,
  estudiante_id uuid not null,
  estado text not null,
  observaciones text null,
  fecha_actualizacion timestamp with time zone not null,
  registrado_por uuid null,
  actualizado_por uuid null,
  constraint asistencias_pkey primary key (clase_id, estudiante_id),
  constraint asistencias_actualizado_por_fkey foreign KEY (actualizado_por) references auth.users (id),
  constraint asistencias_clase_id_fkey foreign KEY (clase_id) references clases (id) on delete CASCADE,
  constraint asistencias_estudiante_id_fkey foreign KEY (estudiante_id) references auth.users (id) on delete CASCADE,
  constraint asistencias_registrado_por_fkey foreign KEY (registrado_por) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.avisos (
  id uuid not null default extensions.uuid_generate_v4 (),
  titulo text not null,
  contenido text not null,
  user_id uuid not null,
  fecha_creacion timestamp with time zone not null default now(),
  fecha_actualizacion timestamp with time zone null,
  leido boolean null default false,
  constraint avisos_pkey primary key (id),
  constraint avisos_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.capsulas (
  id serial not null,
  curso_id integer null,
  titulo text not null,
  tipo text not null,
  url text not null,
  descripcion text null,
  duracion integer null default 10,
  fecha_creacion timestamp with time zone null default now(),
  fecha_actualizacion timestamp with time zone null,
  user_id uuid null,
  constraint capsulas_pkey primary key (id),
  constraint capsulas_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint capsulas_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.clases (
  id uuid not null default extensions.uuid_generate_v4 (),
  titulo text not null,
  descripcion text null,
  fecha timestamp with time zone not null,
  curso_id integer not null,
  user_id uuid not null,
  created_at timestamp with time zone null default now(),
  constraint clases_pkey primary key (id),
  constraint clases_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint clases_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.cursos (
  id serial not null,
  nombre text not null,
  descripcion text null,
  color text null default '#c62828'::text,
  fecha_creacion timestamp with time zone null default now(),
  user_id uuid not null,
  objetivos text null,
  requisitos text null,
  video_url text null,
  constraint cursos_pkey primary key (id),
  constraint cursos_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.entregas (
  id uuid not null default extensions.uuid_generate_v4 (),
  tarea_id integer not null,
  estudiante_id uuid not null,
  curso_id integer not null,
  enlace text null,
  comentario text null,
  calificacion numeric(4, 2) null,
  comentario_calificacion text null,
  estado text null default 'entregado'::text,
  fecha_entrega timestamp with time zone null default now(),
  fecha_calificacion timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  email character varying null,
  user_email text null,
  archivos jsonb null default '[]'::jsonb,
  constraint entregas_pkey primary key (id),
  constraint entregas_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint entregas_estudiante_id_fkey foreign KEY (estudiante_id) references auth.users (id) on delete CASCADE,
  constraint entregas_estudiante_user_roles_fkey foreign KEY (estudiante_id) references user_roles (user_id) on update CASCADE on delete CASCADE,
  constraint entregas_tarea_id_fkey foreign KEY (tarea_id) references tareas (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.guias (
  id serial not null,
  curso_id integer null,
  titulo text not null,
  contenido text not null,
  visibilidad text not null default 'publico'::text,
  fecha timestamp with time zone null default now(),
  fecha_actualizacion timestamp with time zone null,
  user_id uuid not null,
  enlaces jsonb null default '[]'::jsonb,
  archivos jsonb null,
  constraint guias_pkey primary key (id),
  constraint guias_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint guias_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.inscripciones (
  id uuid not null default extensions.uuid_generate_v4 (),
  curso_id integer not null,
  estudiante_id uuid not null,
  fecha_inscripcion timestamp with time zone null default now(),
  role_in_curso text null,
  constraint inscripciones_pkey primary key (id),
  constraint inscripciones_unique unique (curso_id, estudiante_id),
  constraint inscripciones_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint inscripciones_estudiante_id_fkey foreign KEY (estudiante_id) references user_roles (user_id),
  constraint inscripciones_estudiante_id_fkey1 foreign KEY (estudiante_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.reuniones (
  id uuid not null default gen_random_uuid (),
  titulo text not null,
  descripcion text null,
  fecha_hora timestamp with time zone not null,
  estado text null default 'programada'::text,
  curso_id bigint null,
  user_id uuid null,
  enlace_videollamada text null,
  grabacion_url text null,
  created_at timestamp with time zone null default now(),
  constraint reuniones_pkey primary key (id),
  constraint reuniones_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint reuniones_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete SET null
) TABLESPACE pg_default;

alter table public.reuniones
  add column if not exists enlace_videollamada text null;

alter table public.reuniones
  add column if not exists grabacion_url text null;

create table public.tareas (
  id serial not null,
  curso_id integer null,
  titulo text not null,
  descripcion text not null,
  fecha_limite timestamp with time zone not null,
  puntos integer null default 0,
  completada boolean null default false,
  fecha_creacion timestamp with time zone null default now(),
  fecha_actualizacion timestamp with time zone null,
  fecha_completada timestamp with time zone null,
  user_id uuid not null,
  enlaces jsonb null default '[]'::jsonb,
  archivos jsonb null,
  constraint tareas_pkey primary key (id),
  constraint tareas_curso_id_fkey foreign KEY (curso_id) references cursos (id) on delete CASCADE,
  constraint tareas_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.user_roles (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  role text not null,
  created_at timestamp with time zone null default now(),
  nombre text null,
  email text null,
  avatar_url text null default ''::text,
  constraint user_roles_pkey primary key (id),
  constraint user_roles_user_id_key unique (user_id),
  constraint user_roles_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint user_roles_role_check check (
    (
      role = any (
        array[
          'student'::text,
          'teacher'::text,
          'admin'::text,
          'assistant'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

alter table public.entregas
  add column if not exists archivos jsonb null default '[]'::jsonb;

alter table public.entregas
  alter column enlace drop not null;

alter table public.entregas
  drop constraint if exists entregas_enlace_o_archivo_check;

alter table public.entregas
  add constraint entregas_enlace_o_archivo_check
  check (
    nullif(trim(coalesce(enlace, '')), '') is not null or
    jsonb_array_length(coalesce(archivos, '[]'::jsonb)) > 0
  );

-- Cascadas para mantener limpia la jerarquia:
-- curso -> contenido/participantes/reuniones/entregas
-- tarea -> entregas
-- clase -> asistencias
alter table public.entregas
  drop constraint if exists entregas_tarea_id_fkey;

alter table public.entregas
  add constraint entregas_tarea_id_fkey
  foreign key (tarea_id) references public.tareas (id)
  on delete cascade;

alter table public.entregas
  drop constraint if exists entregas_curso_id_fkey;

alter table public.entregas
  add constraint entregas_curso_id_fkey
  foreign key (curso_id) references public.cursos (id)
  on delete cascade;

alter table public.entregas
  drop constraint if exists entregas_estudiante_id_fkey;

alter table public.entregas
  add constraint entregas_estudiante_id_fkey
  foreign key (estudiante_id) references auth.users (id)
  on delete cascade;

alter table public.reuniones
  drop constraint if exists reuniones_curso_id_fkey;

alter table public.reuniones
  add constraint reuniones_curso_id_fkey
  foreign key (curso_id) references public.cursos (id)
  on delete cascade;

alter table public.reuniones
  drop constraint if exists reuniones_user_id_fkey;

alter table public.reuniones
  add constraint reuniones_user_id_fkey
  foreign key (user_id) references auth.users (id)
  on delete set null;

-- Ajustes para que los cambios de rol se reflejen desde la base de datos.
insert into public.user_roles (user_id, role, nombre, email, avatar_url)
select
  au.id,
  'student',
  coalesce(au.raw_user_meta_data->>'nombre', split_part(au.email, '@', 1)),
  au.email,
  ''
from auth.users au
where not exists (
  select 1
  from public.user_roles ur
  where ur.user_id = au.id
);

update public.user_roles ur
set
  email = coalesce(ur.email, au.email),
  nombre = coalesce(ur.nombre, split_part(au.email, '@', 1))
from auth.users au
where ur.user_id = au.id;

-- 1) El email queda indexado para que el panel admin pueda encontrar usuarios
--    directamente en user_roles, sin depender de una tabla profiles.
create unique index if not exists user_roles_email_lower_key
on public.user_roles (lower(email))
where email is not null;

-- 2) Si se elimina un usuario de auth.users, se elimina también su fila de rol.
alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey;

alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id) references auth.users (id)
  on delete cascade;

-- 3) El rol dentro de un curso usa el mismo set de roles que user_roles.role.
alter table public.inscripciones
  drop constraint if exists inscripciones_role_in_curso_check;

alter table public.inscripciones
  add constraint inscripciones_role_in_curso_check
  check (
    role_in_curso is null or
    role_in_curso = any (
      array[
        'student'::text,
        'teacher'::text,
        'admin'::text,
        'assistant'::text
      ]
    )
  );

-- 4) Crea automáticamente user_roles para nuevos usuarios registrados.
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role, nombre, email, avatar_url)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    ''
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    nombre = coalesce(public.user_roles.nombre, excluded.nombre);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_role on auth.users;

create trigger on_auth_user_created_user_role
after insert on auth.users
for each row execute function public.handle_new_user_role();

-- 5) Habilita realtime para que la app refresque permisos al cambiar user_roles.
alter table public.user_roles replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_roles'
  ) then
    alter publication supabase_realtime add table public.user_roles;
  end if;
end;
$$;

-- 6) Policies para proyectos con RLS activado en user_roles.
--    La app necesita leer user_roles para participantes, matrícula y permisos.
alter table public.user_roles enable row level security;

grant select, insert, update on public.user_roles to authenticated;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_role() to authenticated;

drop policy if exists "Usuarios autenticados pueden leer roles" on public.user_roles;
create policy "Usuarios autenticados pueden leer roles"
on public.user_roles
for select
to authenticated
using (true);

drop policy if exists "Usuarios pueden crear su rol inicial" on public.user_roles;
create policy "Usuarios pueden crear su rol inicial"
on public.user_roles
for insert
to authenticated
with check (user_id = auth.uid() and role = 'student');

drop policy if exists "Usuarios pueden actualizar su perfil basico" on public.user_roles;
create policy "Usuarios pueden actualizar su perfil basico"
on public.user_roles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and role = public.current_user_role());

drop policy if exists "Admins pueden administrar roles" on public.user_roles;
create policy "Admins pueden administrar roles"
on public.user_roles
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

-- 7) RLS para las tablas usadas por la app.
grant usage, select on all sequences in schema public to authenticated;

grant select, insert, update, delete on
  public.cursos,
  public.guias,
  public.tareas,
  public.capsulas,
  public.inscripciones,
  public.reuniones,
  public.avisos,
  public.clases,
  public.asistencias,
  public.entregas
to authenticated;

create or replace function public.current_user_has_any_role(roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(roles), false);
$$;

create or replace function public.can_read_course(course_id integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) or
    exists (
      select 1
      from public.inscripciones i
      where i.curso_id = course_id
        and i.estudiante_id = auth.uid()
    );
$$;

create or replace function public.can_manage_course(course_id integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) or
    exists (
      select 1
      from public.cursos c
      where c.id = course_id
        and c.user_id = auth.uid()
        and public.current_user_has_any_role(array['teacher'])
    ) or
    exists (
      select 1
      from public.inscripciones i
      where i.curso_id = course_id
        and i.estudiante_id = auth.uid()
        and i.role_in_curso in ('teacher', 'assistant')
    );
$$;

grant execute on function public.current_user_has_any_role(text[]) to authenticated;
grant execute on function public.can_read_course(integer) to authenticated;
grant execute on function public.can_manage_course(integer) to authenticated;

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

drop policy if exists "Cursos visibles segun rol" on public.cursos;
create policy "Cursos visibles segun rol"
on public.cursos for select to authenticated
using (
  public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) or
  exists (
    select 1
    from public.inscripciones i
    where i.curso_id = cursos.id
      and i.estudiante_id = auth.uid()
  )
);

drop policy if exists "Profesores y admins crean cursos" on public.cursos;
create policy "Profesores y admins crean cursos"
on public.cursos for insert to authenticated
with check (
  user_id = auth.uid() and
  public.current_user_has_any_role(array['admin', 'teacher'])
);

drop policy if exists "Admins y creadores editan cursos" on public.cursos;
create policy "Admins y creadores editan cursos"
on public.cursos for update to authenticated
using (
  public.current_user_has_any_role(array['admin']) or
  (user_id = auth.uid() and public.current_user_has_any_role(array['teacher']))
)
with check (
  public.current_user_has_any_role(array['admin']) or
  (user_id = auth.uid() and public.current_user_has_any_role(array['teacher']))
);

drop policy if exists "Admins y creadores eliminan cursos" on public.cursos;
create policy "Admins y creadores eliminan cursos"
on public.cursos for delete to authenticated
using (
  public.current_user_has_any_role(array['admin']) or
  (user_id = auth.uid() and public.current_user_has_any_role(array['teacher']))
);

drop policy if exists "Contenido visible por curso" on public.guias;
create policy "Contenido visible por curso"
on public.guias for select to authenticated
using (public.can_read_course(curso_id));

drop policy if exists "Contenido editable por gestores" on public.guias;
create policy "Contenido editable por gestores"
on public.guias for insert to authenticated
with check (user_id = auth.uid() and public.can_manage_course(curso_id));

drop policy if exists "Contenido actualizable por gestores" on public.guias;
create policy "Contenido actualizable por gestores"
on public.guias for update to authenticated
using (public.can_manage_course(curso_id))
with check (public.can_manage_course(curso_id));

drop policy if exists "Contenido eliminable por profesores y admins" on public.guias;
create policy "Contenido eliminable por profesores y admins"
on public.guias for delete to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher']) and public.can_manage_course(curso_id));

drop policy if exists "Tareas visibles por curso" on public.tareas;
create policy "Tareas visibles por curso"
on public.tareas for select to authenticated
using (public.can_read_course(curso_id));

drop policy if exists "Tareas creables por gestores" on public.tareas;
create policy "Tareas creables por gestores"
on public.tareas for insert to authenticated
with check (user_id = auth.uid() and public.can_manage_course(curso_id));

drop policy if exists "Tareas actualizables por gestores" on public.tareas;
create policy "Tareas actualizables por gestores"
on public.tareas for update to authenticated
using (public.can_manage_course(curso_id))
with check (public.can_manage_course(curso_id));

drop policy if exists "Tareas eliminables por profesores y admins" on public.tareas;
create policy "Tareas eliminables por profesores y admins"
on public.tareas for delete to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher']) and public.can_manage_course(curso_id));

drop policy if exists "Capsulas visibles por curso" on public.capsulas;
create policy "Capsulas visibles por curso"
on public.capsulas for select to authenticated
using (public.can_read_course(curso_id));

drop policy if exists "Capsulas creables por gestores" on public.capsulas;
create policy "Capsulas creables por gestores"
on public.capsulas for insert to authenticated
with check (user_id = auth.uid() and public.can_manage_course(curso_id));

drop policy if exists "Capsulas actualizables por gestores" on public.capsulas;
create policy "Capsulas actualizables por gestores"
on public.capsulas for update to authenticated
using (public.can_manage_course(curso_id))
with check (public.can_manage_course(curso_id));

drop policy if exists "Capsulas eliminables por profesores y admins" on public.capsulas;
create policy "Capsulas eliminables por profesores y admins"
on public.capsulas for delete to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher']) and public.can_manage_course(curso_id));

drop policy if exists "Inscripciones visibles segun curso" on public.inscripciones;
create policy "Inscripciones visibles segun curso"
on public.inscripciones for select to authenticated
using (public.can_read_course(curso_id) or estudiante_id = auth.uid());

drop policy if exists "Inscripciones creables por profesores y admins" on public.inscripciones;
create policy "Inscripciones creables por profesores y admins"
on public.inscripciones for insert to authenticated
with check (
  public.current_user_has_any_role(array['admin', 'teacher']) and
  public.can_manage_course(curso_id)
);

drop policy if exists "Inscripciones eliminables por profesores y admins" on public.inscripciones;
create policy "Inscripciones eliminables por profesores y admins"
on public.inscripciones for delete to authenticated
using (
  public.current_user_has_any_role(array['admin', 'teacher']) and
  public.can_manage_course(curso_id)
);

drop policy if exists "Reuniones visibles por curso" on public.reuniones;
create policy "Reuniones visibles por curso"
on public.reuniones for select to authenticated
using (curso_id is null or public.can_read_course(curso_id::integer));

drop policy if exists "Reuniones creables por gestores" on public.reuniones;
create policy "Reuniones creables por gestores"
on public.reuniones for insert to authenticated
with check (
  user_id = auth.uid() and
  (curso_id is null or public.can_manage_course(curso_id::integer))
);

drop policy if exists "Reuniones actualizables por gestores" on public.reuniones;
create policy "Reuniones actualizables por gestores"
on public.reuniones for update to authenticated
using (user_id = auth.uid() or public.current_user_is_admin())
with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Reuniones eliminables por gestores" on public.reuniones;
create policy "Reuniones eliminables por gestores"
on public.reuniones for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Avisos visibles para autenticados" on public.avisos;
create policy "Avisos visibles para autenticados"
on public.avisos for select to authenticated
using (true);

drop policy if exists "Avisos creables por staff" on public.avisos;
create policy "Avisos creables por staff"
on public.avisos for insert to authenticated
with check (user_id = auth.uid() and public.current_user_has_any_role(array['admin', 'teacher', 'assistant']));

drop policy if exists "Avisos actualizables por staff" on public.avisos;
create policy "Avisos actualizables por staff"
on public.avisos for update to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher', 'assistant']))
with check (public.current_user_has_any_role(array['admin', 'teacher', 'assistant']));

drop policy if exists "Avisos eliminables por profesores y admins" on public.avisos;
create policy "Avisos eliminables por profesores y admins"
on public.avisos for delete to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher']));

drop policy if exists "Clases visibles por curso" on public.clases;
create policy "Clases visibles por curso"
on public.clases for select to authenticated
using (public.can_read_course(curso_id));

drop policy if exists "Clases creables por gestores" on public.clases;
create policy "Clases creables por gestores"
on public.clases for insert to authenticated
with check (user_id = auth.uid() and public.can_manage_course(curso_id));

drop policy if exists "Clases actualizables por gestores" on public.clases;
create policy "Clases actualizables por gestores"
on public.clases for update to authenticated
using (public.can_manage_course(curso_id))
with check (public.can_manage_course(curso_id));

drop policy if exists "Clases eliminables por profesores y admins" on public.clases;
create policy "Clases eliminables por profesores y admins"
on public.clases for delete to authenticated
using (public.current_user_has_any_role(array['admin', 'teacher']) and public.can_manage_course(curso_id));

drop policy if exists "Asistencias visibles por clase" on public.asistencias;
create policy "Asistencias visibles por clase"
on public.asistencias for select to authenticated
using (
  estudiante_id = auth.uid() or
  exists (
    select 1
    from public.clases c
    where c.id = clase_id
      and public.can_read_course(c.curso_id)
  )
);

drop policy if exists "Asistencias creables por gestores" on public.asistencias;
create policy "Asistencias creables por gestores"
on public.asistencias for insert to authenticated
with check (
  exists (
    select 1
    from public.clases c
    where c.id = clase_id
      and public.can_manage_course(c.curso_id)
  )
);

drop policy if exists "Asistencias actualizables por gestores" on public.asistencias;
create policy "Asistencias actualizables por gestores"
on public.asistencias for update to authenticated
using (
  exists (
    select 1
    from public.clases c
    where c.id = clase_id
      and public.can_manage_course(c.curso_id)
  )
)
with check (
  exists (
    select 1
    from public.clases c
    where c.id = clase_id
      and public.can_manage_course(c.curso_id)
  )
);

drop policy if exists "Asistencias eliminables por profesores y admins" on public.asistencias;
create policy "Asistencias eliminables por profesores y admins"
on public.asistencias for delete to authenticated
using (
  public.current_user_has_any_role(array['admin', 'teacher']) and
  exists (
    select 1
    from public.clases c
    where c.id = clase_id
      and public.can_manage_course(c.curso_id)
  )
);

drop policy if exists "Entregas visibles por curso o estudiante" on public.entregas;
create policy "Entregas visibles por curso o estudiante"
on public.entregas for select to authenticated
using (estudiante_id = auth.uid() or public.can_read_course(curso_id));

drop policy if exists "Entregas creables por estudiante" on public.entregas;
create policy "Entregas creables por estudiante"
on public.entregas for insert to authenticated
with check (
  estudiante_id = auth.uid() and
  exists (
    select 1
    from public.inscripciones i
    where i.curso_id = entregas.curso_id
      and i.estudiante_id = auth.uid()
      and i.role_in_curso = 'student'
  )
);

drop policy if exists "Entregas actualizables por gestores" on public.entregas;
create policy "Entregas actualizables por gestores"
on public.entregas for update to authenticated
using (public.can_manage_course(curso_id))
with check (public.can_manage_course(curso_id));

drop policy if exists "Entregas eliminables por estudiante o admin" on public.entregas;
create policy "Entregas eliminables por estudiante o admin"
on public.entregas for delete to authenticated
using (estudiante_id = auth.uid() or public.current_user_is_admin());

-- 8) Storage RLS para el bucket usado por guias y tareas.
insert into storage.buckets (id, name, public)
values ('archivos', 'archivos', true)
on conflict (id) do update
set public = true;

grant select on storage.objects to anon;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "Archivos publicos se pueden leer" on storage.objects;
create policy "Archivos publicos se pueden leer"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'archivos');

drop policy if exists "Staff puede subir archivos" on storage.objects;
drop policy if exists "Staff puede subir archivos de contenido" on storage.objects;
create policy "Staff puede subir archivos de contenido"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'archivos' and
  public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) and
  (name like 'guias/%' or name like 'tareas/%' or name like 'entregas/%')
);

drop policy if exists "Usuarios pueden subir sus entregas" on storage.objects;
create policy "Usuarios pueden subir sus entregas"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'archivos' and
  name like ('entregas/' || auth.uid()::text || '/%')
);

drop policy if exists "Staff puede actualizar archivos" on storage.objects;
drop policy if exists "Staff puede actualizar archivos de contenido" on storage.objects;
create policy "Staff puede actualizar archivos de contenido"
on storage.objects for update
to authenticated
using (
  bucket_id = 'archivos' and
  public.current_user_has_any_role(array['admin', 'teacher', 'assistant'])
)
with check (
  bucket_id = 'archivos' and
  public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) and
  (name like 'guias/%' or name like 'tareas/%' or name like 'entregas/%')
);

drop policy if exists "Usuarios pueden actualizar sus entregas" on storage.objects;
create policy "Usuarios pueden actualizar sus entregas"
on storage.objects for update
to authenticated
using (
  bucket_id = 'archivos' and
  name like ('entregas/' || auth.uid()::text || '/%')
)
with check (
  bucket_id = 'archivos' and
  name like ('entregas/' || auth.uid()::text || '/%')
);

drop policy if exists "Staff puede eliminar archivos" on storage.objects;
create policy "Staff puede eliminar archivos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'archivos' and
  (
    public.current_user_has_any_role(array['admin', 'teacher', 'assistant']) or
    name like ('entregas/' || auth.uid()::text || '/%')
  )
);
