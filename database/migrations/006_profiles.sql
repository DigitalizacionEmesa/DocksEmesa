create table public.profiles (

    id uuid primary key
        references auth.users(id)
        on delete cascade,


    first_name text not null,

    last_name text not null,


    phone text,


    user_type text not null
        check (
            user_type in (
                'internal',
                'supplier'
            )
        ),


    active boolean
        not null default true,


    preferred_language text
        not null default 'es',


    created_at timestamptz
        not null default now(),


    updated_at timestamptz
        not null default now()

);