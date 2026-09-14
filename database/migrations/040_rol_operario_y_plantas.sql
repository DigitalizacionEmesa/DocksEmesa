-- Rol limitado para los operarios corporativos.
-- La asignación concreta de plantas se conserva en public.usuario_plantas.

begin;

insert into public.roles (nombre)
select 'PLANT_OPERATOR'
where not exists (
    select 1 from public.roles where nombre = 'PLANT_OPERATOR'
);

commit;
