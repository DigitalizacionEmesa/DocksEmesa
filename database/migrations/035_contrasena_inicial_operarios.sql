-- Permite al backend guardar la primera contraseña creada por un operario.
-- La tabla permanece inaccesible para anon y authenticated.

begin;

grant select, update on table public.operarios_login to service_role;

comment on column public.operarios_login.password_hash is
    'Hash de contraseña. Cadena vacía significa que el operario debe crear su primera contraseña.';

commit;
