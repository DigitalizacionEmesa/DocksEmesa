"""Importa operarios CSV en Supabase sin enviar contrasenas en claro.

Uso:
  set SUPABASE_URL=...
  set SUPABASE_KEY=...  # clave secreta valida, solo local
  venv\\Scripts\\python.exe tools\\python\\import_operarios_supabase.py operarios.csv
"""

import csv
import os
import secrets
import sys
from collections import Counter

from supabase import create_client


def normalizar_email(valor, numero):
    email = (valor or "").strip().lower()
    return email if "@" in email else f"operario-{numero}@docksemesa.invalid"


def cargar_existentes(cliente):
    existentes = {}
    pagina = 1
    while True:
        respuesta = cliente.auth.admin.list_users(page=pagina, per_page=1000)
        usuarios = list(getattr(respuesta, "users", None) or respuesta)
        for usuario in usuarios:
            email = (getattr(usuario, "email", "") or "").lower()
            if email:
                existentes[email] = usuario.id
        if len(usuarios) < 1000:
            return existentes
        pagina += 1


def main(ruta_csv):
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL o SUPABASE_KEY en el entorno.")

    cliente = create_client(url, key)
    with open(ruta_csv, encoding="utf-8-sig", newline="") as archivo:
        filas = list(csv.DictReader(archivo, delimiter=";"))

    existentes = cargar_existentes(cliente)
    usados = Counter()
    creados_auth = 0
    importados = 0

    for fila in filas:
        numero = str(fila["Num_Operario"]).strip()
        password_hash = str(fila["Contrasena"]).strip()
        if not numero or not password_hash:
            continue

        email_base = normalizar_email(fila.get("Correo"), numero)
        usados[email_base] += 1
        email = email_base if usados[email_base] == 1 else f"operario-{numero}@docksemesa.invalid"

        usuario_id = existentes.get(email)
        if not usuario_id:
            creado = cliente.auth.admin.create_user({
                "email": email,
                "password": secrets.token_urlsafe(32),
                "email_confirm": True,
            })
            usuario_id = creado.user.id
            existentes[email] = usuario_id
            creados_auth += 1

        rol = (cliente.table("roles").select("id").eq("nombre", "interno").limit(1).execute().data or [])
        if not rol:
            raise RuntimeError("No existe el rol 'interno' en Supabase.")

        nombre_completo = (fila.get("Nombre") or "").strip()
        partes = nombre_completo.split(None, 1)
        perfil = {
            "id": usuario_id,
            "nombre": partes[0] if partes else numero,
            "apellidos": partes[1] if len(partes) > 1 else None,
            "rol_id": rol[0]["id"],
            "activo": True,
            "numero_operario": numero,
            "origen_operario": "EMESA",
        }
        cliente.table("usuarios").upsert(perfil).execute()
        cliente.table("operarios_login").upsert({
            "usuario_id": usuario_id,
            "numero_operario": numero,
            "nombre": nombre_completo or None,
            "correo": fila.get("Correo") or None,
            "password_hash": password_hash,
            "nivel_permisos": fila.get("Nivel_Permisos") or None,
            "roles_origen": fila.get("Roles") or None,
            "activo": True,
        }).execute()
        importados += 1

    print({"importados": importados, "usuarios_auth_creados": creados_auth})


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: import_operarios_supabase.py <operarios.csv>")
    main(sys.argv[1])
