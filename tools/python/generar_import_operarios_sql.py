"""Genera lotes SQL para importar operarios desde el CSV corporativo.

Las contrasenas ya llegan cifradas y se insertan exclusivamente en
public.operarios_login. El usuario auth resultante es tecnico: el acceso de
operarios se valida por numero y hash, no mediante Supabase Auth.
"""

import argparse
import csv


def sql_text(valor):
    if valor is None or not str(valor).strip():
        return "null"
    return "'" + str(valor).strip().replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    # El export de SQL Server corporativo se genera en Windows-1252.
    with open(args.csv, encoding="cp1252", newline="") as archivo:
        filas = list(csv.DictReader(archivo, delimiter=";"))
    filas = filas[args.offset:args.offset + args.limit]
    valores = ",\n".join(
        "(" + ", ".join([
            sql_text(fila["Num_Operario"]),
            sql_text(fila.get("Nombre")),
            sql_text(fila.get("Correo")),
            sql_text(fila["Contrasena"]),
            sql_text(fila.get("Nivel_Permisos")),
            sql_text(fila.get("Roles")),
        ]) + ")"
        for fila in filas
    )
    print(f"""with fuente(numero_operario, nombre, correo, password_hash, nivel_permisos, roles_origen) as (
    values
    {valores}
), usuarios_auth as (
    insert into auth.users (
        id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        is_sso_user, is_anonymous
    )
    select
        gen_random_uuid(), 'authenticated', 'authenticated',
        'operario-' || numero_operario || '@docksemesa.invalid', now(),
        '{{"provider":"email","providers":["email"]}}'::jsonb, '{{}}'::jsonb,
        now(), now(), false, false
    from fuente
    returning id, email
), perfiles as (
    insert into public.usuarios (id, nombre, rol_id, activo, numero_operario, origen_operario)
    select
        a.id, f.nombre,
        (select id from public.roles where nombre = 'interno' limit 1),
        true, f.numero_operario, 'EMESA'
    from usuarios_auth a
    join fuente f on a.email = 'operario-' || f.numero_operario || '@docksemesa.invalid'
    returning id, numero_operario
)
insert into public.operarios_login (
    usuario_id, numero_operario, nombre, correo, password_hash,
    nivel_permisos, roles_origen, activo
)
select p.id, f.numero_operario, f.nombre, f.correo, f.password_hash,
       f.nivel_permisos, f.roles_origen, true
from perfiles p
join fuente f using (numero_operario);""")


if __name__ == "__main__":
    main()
