"""Comprueba la configuración local sin imprimir ninguna credencial."""

import sys
from pathlib import Path
from urllib.parse import urlparse

# Permite ejecutar el archivo directamente desde la raíz del repositorio.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from supabase import create_client

from config import APP_URL, SUPABASE_ANON_KEY, SUPABASE_KEY, SUPABASE_URL


def referencia(url):
    return (urlparse(url or "").hostname or "").split(".")[0] or None


def comprobar_publica():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False, "Faltan SUPABASE_URL o SUPABASE_ANON_KEY."
    try:
        respuesta = httpx.get(
            SUPABASE_URL.rstrip("/") + "/auth/v1/settings",
            headers={"apikey": SUPABASE_ANON_KEY}, timeout=15,
        )
        return respuesta.status_code == 200, f"HTTP {respuesta.status_code}"
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__


def comprobar_servicio():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False, "Faltan SUPABASE_URL o SUPABASE_KEY."
    try:
        create_client(SUPABASE_URL, SUPABASE_KEY).table("roles").select("id").limit(1).execute()
        return True, "acceso de servicio correcto"
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__


if __name__ == "__main__":
    publica_ok, publica_detalle = comprobar_publica()
    servicio_ok, servicio_detalle = comprobar_servicio()
    print(f"Proyecto Supabase: {referencia(SUPABASE_URL) or 'no configurado'}")
    print(f"Clave pública: {'OK' if publica_ok else 'ERROR'} ({publica_detalle})")
    print(f"Clave de servicio: {'OK' if servicio_ok else 'ERROR'} ({servicio_detalle})")
    print(f"APP_URL: {APP_URL}")
    if not servicio_ok:
        raise SystemExit(1)
