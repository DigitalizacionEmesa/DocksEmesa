create table public.booking_status_history (

    id uuid primary key default gen_random_uuid(),


    booking_id uuid not null
        references public.bookings(id)
        on delete cascade,


    previous_status text,


    new_status text not null,


    changed_by uuid
        references public.profiles(id),


    reason text,


    created_at timestamptz
        default now()

);