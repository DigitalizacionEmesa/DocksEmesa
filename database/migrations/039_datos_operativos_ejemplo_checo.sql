-- Nombres visibles de los datos operativos de ejemplo en checo.
-- No modifica usuarios, roles, correos, identificadores ni la estructura.

begin;

update public.plantas
set nombre = 'Závod Épila'
where nombre = 'EMESA Épila';

update public.plantas
set nombre = 'Závod Ostrava'
where nombre = 'SCCZ Ostrava';

update public.naves
set nombre = regexp_replace(nombre, '^Nave ', 'Hala ')
where nombre like 'Nave %';

update public.muelles
set nombre = regexp_replace(nombre, '^Muelle ', 'Nakládací rampa ')
where nombre like 'Muelle %';

update public.proveedores
set nombre = 'Evropská doprava CZ'
where nombre = 'Transportes Europa CZ';

update public.proveedores
set nombre = 'Iberská logistika'
where nombre = 'Logística Ibérica';

update public.departamentos
set nombre = case nombre
    when 'Producción' then 'Výroba'
    when 'Logística' then 'Logistika'
    when 'Compras' then 'Nákup'
    when 'Expediciones' then 'Expedice'
    when 'Calidad' then 'Kvalita'
    when 'Transporte' then 'Doprava'
    else nombre
end
where nombre in ('Producción', 'Logística', 'Compras', 'Expediciones', 'Calidad', 'Transporte');

update public.excepciones_muelles
set motivo = 'Údržba'
where lower(motivo) = 'mantenimiento';

commit;
