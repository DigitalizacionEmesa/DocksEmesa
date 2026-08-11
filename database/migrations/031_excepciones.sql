-- =====================================================
-- SCCZ - RESERVAS DE MUELLES
-- EXCEPCIONES DE HORARIO (mantenimiento / cierres)
-- Script seguro con IF NOT EXISTS
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- EXCEPCIONES MUELLES
-- Permite marcar dias/horas concretos en los que un muelle
-- NO esta operativo (mantenimiento, cierre, etc.). En todos
-- los calendarios esas horas aparecen como "cerrado" y no se
-- puede reservar.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.excepciones_muelles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    muelle_id UUID NOT NULL
        REFERENCES public.muelles(id)
        ON DELETE CASCADE,

    fecha DATE NOT NULL,

    hora_inicio TIME NOT NULL,

    hora_fin TIME NOT NULL,

    motivo TEXT DEFAULT 'mantenimiento',

    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_excepciones_muelle
ON public.excepciones_muelles(muelle_id);

CREATE INDEX IF NOT EXISTS idx_excepciones_fecha
ON public.excepciones_muelles(fecha);



-- =====================================================
-- ACTIVAR RLS
-- =====================================================

ALTER TABLE public.excepciones_muelles ENABLE ROW LEVEL SECURITY;



-- =====================================================
-- PERMISOS (GRANTS)
-- service_role -> backend Flask (BYPASSRLS)
-- authenticated -> usuarios RLS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.excepciones_muelles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.excepciones_muelles TO authenticated;
GRANT SELECT ON public.excepciones_muelles TO anon;
