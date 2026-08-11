create table public.user_roles (

    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    role text not null
        check(
            role in
            (
                'super_admin',
                'company_admin',
                'plant_admin',
                'planner',
                'department_manager',
                'dock_operator',
                'internal_viewer',
                'supplier_admin',
                'supplier_user'
            )
        ),


    created_at timestamptz default now()

);



create table public.user_plant_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    plant_id uuid not null
        references public.plants(id)
        on delete cascade,


    created_at timestamptz default now(),


    unique(
        user_id,
        plant_id
    )

);



create table public.user_dock_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    created_at timestamptz default now(),


    unique(
        user_id,
        dock_id
    )

);



create table public.user_supplier_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    supplier_id uuid not null
        references public.suppliers(id)
        on delete cascade,


    created_at timestamptz default now(),


    unique(
        user_id,
        supplier_id
    )

);



create policy "authenticated can view organizations"

on public.organizations

for select

to authenticated

using (

    true

);



create policy "view allowed plants"

on public.plants

for select

to authenticated

using

(

    public.is_admin()

    OR

    exists (

        select 1

        from public.user_plant_access upa

        where upa.plant_id = plants.id

        and upa.user_id = auth.uid()

    )

);



create policy "view bookings"

on public.bookings

for select

to authenticated

using

(

    public.is_admin()


    OR


    exists (

        select 1

        from public.user_plant_access upa

        where upa.user_id = auth.uid()

        and upa.plant_id = bookings.plant_id

    )


    OR


    bookings.supplier_id = public.get_user_supplier()

);



create policy "create bookings"

on public.bookings

for insert

to authenticated

with check

(

    true

);



create policy "update bookings"

on public.bookings

for update

to authenticated

using

(

    public.is_admin()


    OR


    bookings.supplier_id =
    public.get_user_supplier()

);