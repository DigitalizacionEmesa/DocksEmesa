-- =====================================================
-- SCCZ - RESERVAS DE MUELLES
-- SCRIPT SEGURO CON IF NOT EXISTS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =====================================================
-- ROLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.roles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    nombre TEXT NOT NULL UNIQUE,

    descripcion TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);


INSERT INTO public.roles(nombre, descripcion)
VALUES
('admin','Administrador del sistema'),
('interno','Usuario interno SCCZ'),
('proveedor','Usuario externo proveedor')
ON CONFLICT (nombre) DO NOTHING;



-- =====================================================
-- PLANTAS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.plantas (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    nombre TEXT NOT NULL,

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- NAVES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.naves (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    planta_id UUID NOT NULL 
        REFERENCES public.plantas(id)
        ON DELETE CASCADE,

    nombre TEXT NOT NULL,

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- MUELLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.muelles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    nave_id UUID NOT NULL 
        REFERENCES public.naves(id)
        ON DELETE CASCADE,

    nombre TEXT NOT NULL,

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- DISPONIBILIDAD MUELLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.disponibilidad_muelles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    muelle_id UUID NOT NULL
        REFERENCES public.muelles(id)
        ON DELETE CASCADE,

    dia_semana INTEGER NOT NULL,

    hora_inicio TIME NOT NULL,

    hora_fin TIME NOT NULL,

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- PROVEEDORES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.proveedores (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    nombre TEXT NOT NULL,

    email_contacto TEXT,

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- DEPARTAMENTOS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.departamentos (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    nombre TEXT NOT NULL UNIQUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- USUARIOS
-- Vinculados a auth.users
-- =====================================================

CREATE TABLE IF NOT EXISTS public.usuarios (

    id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    nombre TEXT,

    apellidos TEXT,

    rol_id UUID NOT NULL
        REFERENCES public.roles(id),

    proveedor_id UUID
        REFERENCES public.proveedores(id),

    departamento_id UUID
        REFERENCES public.departamentos(id),

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- USUARIO - PLANTAS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.usuario_plantas (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    usuario_id UUID NOT NULL
        REFERENCES public.usuarios(id)
        ON DELETE CASCADE,

    planta_id UUID NOT NULL
        REFERENCES public.plantas(id)
        ON DELETE CASCADE,

    UNIQUE(usuario_id, planta_id)

);



-- =====================================================
-- PROVEEDOR - MUELLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.proveedor_muelles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    proveedor_id UUID NOT NULL
        REFERENCES public.proveedores(id)
        ON DELETE CASCADE,

    muelle_id UUID NOT NULL
        REFERENCES public.muelles(id)
        ON DELETE CASCADE,

    UNIQUE(proveedor_id, muelle_id)

);



-- =====================================================
-- RESERVAS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.reservas (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    muelle_id UUID NOT NULL
        REFERENCES public.muelles(id),

    usuario_id UUID NOT NULL
        REFERENCES public.usuarios(id),

    fecha DATE NOT NULL,

    hora_inicio TIME NOT NULL,

    hora_fin TIME NOT NULL,

    tipo TEXT DEFAULT 'descarga',

    estado TEXT DEFAULT 'pendiente',

    observaciones TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_naves_planta
ON public.naves(planta_id);


CREATE INDEX IF NOT EXISTS idx_muelles_nave
ON public.muelles(nave_id);


CREATE INDEX IF NOT EXISTS idx_reservas_fecha
ON public.reservas(fecha);


CREATE INDEX IF NOT EXISTS idx_reservas_muelle
ON public.reservas(muelle_id);



-- =====================================================
-- ACTIVAR RLS
-- =====================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plantas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.naves ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muelles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.disponibilidad_muelles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usuario_plantas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proveedor_muelles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;



-- =====================================================
-- VISTA MUELLES
-- =====================================================

CREATE OR REPLACE VIEW public.v_muelles AS

SELECT

    m.id AS muelle_id,

    m.nombre AS muelle,

    n.id AS nave_id,

    n.nombre AS nave,

    p.id AS planta_id,

    p.nombre AS planta

FROM public.muelles m

INNER JOIN public.naves n
ON m.nave_id = n.id

INNER JOIN public.plantas p
ON n.planta_id = p.id;


-- =====================================================
-- PERMISOS (GRANTS)
-- Supabase no otorga permisos base automaticamente a
-- service_role si las tablas se crean via SQL editor.
-- service_role -> backend Flask (BYPASSRLS)
-- authenticated -> usuarios RLS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;