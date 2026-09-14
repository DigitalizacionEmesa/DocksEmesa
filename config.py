import os

from dotenv import load_dotenv

# Las variables definidas por Render, CI o la consola prevalecen sobre .env.
load_dotenv(override=False)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
# En Render, RENDER_EXTERNAL_URL es la URL pública del servicio. También se
# prioriza frente a un APP_URL local heredado, porque localhost nunca es un
# destino válido para enlaces enviados por correo desde producción.
_configured_app_url = os.environ.get("APP_URL")
_render_external_url = os.environ.get("RENDER_EXTERNAL_URL")
if _render_external_url and (
    not _configured_app_url
    or _configured_app_url.rstrip("/").startswith(("http://localhost", "https://localhost"))
):
    APP_URL = _render_external_url.rstrip("/")
else:
    APP_URL = (_configured_app_url or "http://localhost:5000").rstrip("/")
# Mantiene el acceso anterior mientras se validan cuentas técnicas de operario.
OPERARIOS_AUTH_SUPABASE_ONLY = os.environ.get(
    "OPERARIOS_AUTH_SUPABASE_ONLY", "0"
).strip().lower() in ("1", "true", "yes", "on")

# ---------------------------------------------------------------------------
# Data Lake corporativo (SQL Server). No se incluyen credenciales ni una
# conexión corporativa por defecto; se habilita explícitamente por entorno.
# ---------------------------------------------------------------------------
DATALAKE_ENABLED = os.environ.get("DATALAKE_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
DATALAKE_SERVER = os.environ.get("DATALAKE_SERVER", "")
DATALAKE_DATABASE = os.environ.get("DATALAKE_DATABASE", "")
DATALAKE_USER = os.environ.get("DATALAKE_USER", "")
DATALAKE_PASSWORD = os.environ.get("DATALAKE_PASSWORD", "")
DATALAKE_DRIVER = os.environ.get("DATALAKE_DRIVER", "ODBC Driver 18 for SQL Server")
DATALAKE_SERVERS = [s.strip() for s in os.environ.get("DATALAKE_SERVERS", "").split(",") if s.strip()]
DATALAKE_DRIVERS = [d.strip() for d in os.environ.get("DATALAKE_DRIVERS", "").split(",") if d.strip()]
# Algunos SQL Server internos antiguos no negocian TLS con ODBC 18. Mantener
# "yes" por defecto y usar "no" únicamente dentro de la red corporativa si
# el servidor lo requiere.
DATALAKE_ENCRYPT = os.environ.get("DATALAKE_ENCRYPT", "yes").strip().lower()
