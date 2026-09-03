import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# ---------------------------------------------------------------------------
# Datalake corporativo (SQL Server DataLakeSCCZ) para autenticar operarios.
# Credenciales por defecto: las mismas del entorno CZ de Omegas (se pueden
# sobreescribir vía variables de entorno o en el fichero .env).
# ---------------------------------------------------------------------------
DATALAKE_ENABLED = os.environ.get("DATALAKE_ENABLED", "1").strip().lower() in ("1", "true", "yes", "on")
DATALAKE_SERVER = os.environ.get("DATALAKE_SERVER", "172.16.10.10")
DATALAKE_DATABASE = os.environ.get("DATALAKE_DATABASE", "DataLakeSCCZ")
DATALAKE_USER = os.environ.get("DATALAKE_USER", "sccz")
DATALAKE_PASSWORD = os.environ.get("DATALAKE_PASSWORD", "S@vera,CZ,2024")
DATALAKE_DRIVER = os.environ.get("DATALAKE_DRIVER", "ODBC Driver 18 for SQL Server")
DATALAKE_SERVERS = [s.strip() for s in os.environ.get("DATALAKE_SERVERS", "").split(",") if s.strip()]
DATALAKE_DRIVERS = [d.strip() for d in os.environ.get("DATALAKE_DRIVERS", "").split(",") if d.strip()]