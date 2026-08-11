create table public.audit_log (

    id uuid primary key default gen_random_uuid(),


    organization_id uuid
        references public.organizations(id),


    plant_id uuid
        references public.plants(id),


    user_id uuid
        references public.profiles(id),



    action text not null,


    entity_type text not null,


    entity_id uuid,



    old_values jsonb,


    new_values jsonb,


    source text,


    created_at timestamptz
        default now()

);