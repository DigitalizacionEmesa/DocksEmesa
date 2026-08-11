create or replace function public.current_user_id()

returns uuid

language sql

stable

as $$

    select auth.uid();

$$;



create or replace function public.is_admin()

returns boolean

language sql

stable

as $$

select exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

    and p.user_type in
    (
        'super_admin',
        'company_admin'
    )

);

$$;



create or replace function public.get_user_supplier()

returns uuid

language sql

stable

as $$

select supplier_id

from public.user_supplier_access

where user_id = auth.uid()

limit 1;

$$;