"""Ejecuta la sincronización diaria de operarios desde la red corporativa.

Uso desde la raíz del proyecto:
    venv\\Scripts\\python.exe tools\\python\\sync_operarios.py
"""

from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import SUPABASE_KEY, SUPABASE_URL  # noqa: E402
from datalake import listar_operarios  # noqa: E402
from operarios_sync import ejecutar_sincronizacion  # noqa: E402
from supabase import create_client  # noqa: E402


def main() -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("Faltan SUPABASE_URL o SUPABASE_KEY.")
    cliente = create_client(SUPABASE_URL, SUPABASE_KEY)
    resultado = ejecutar_sincronizacion(
        cliente,
        listar_operarios,
    )
    # Una ejecución programada también satisface las peticiones manuales que
    # estuvieran esperando al agente. Así el menú no se queda mostrando una
    # sincronización pendiente aunque el censo ya se haya actualizado.
    pendientes = (
        cliente.table("solicitudes_sincronizacion_operarios")
        .select("id")
        .eq("estado", "PENDIENTE")
        .execute()
        .data
        or []
    )
    if pendientes:
        ahora = datetime.now(timezone.utc).isoformat()
        for solicitud in pendientes:
            cliente.table("solicitudes_sincronizacion_operarios").update({
                "estado": "COMPLETADA",
                "iniciado_en": ahora,
                "finalizado_en": ahora,
                "resultado": resultado.como_dict(),
            }).eq("id", solicitud["id"]).eq("estado", "PENDIENTE").execute()
    print(resultado.como_dict())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
