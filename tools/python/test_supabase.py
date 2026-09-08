import os

from supabase import create_client


url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
if not url or not key:
    raise SystemExit("Faltan SUPABASE_URL o SUPABASE_KEY en el entorno.")

supabase = create_client(url, key)



response = (
    supabase
    .table("profiles")
    .select("*")
    .execute()
)


print(response.data)
