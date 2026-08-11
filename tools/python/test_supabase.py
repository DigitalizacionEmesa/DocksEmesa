from supabase import create_client


url = "https://aeqvtjenbnhglhuchokw.supabase.co"
key = "sb_secret_n8E2Un5frdLYqyQn5KKjCA_z2uXszUd"



supabase = create_client(url,key)



response = (
    supabase
    .table("profiles")
    .select("*")
    .execute()
)


print(response.data)