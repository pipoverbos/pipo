-- Programa la limpieza diaria de clases sin actividad en 12 meses (ver private.purgar_clases_inactivas en 0001).
-- Se ejecuta cada día a las 04:00 UTC. Es repetible: si el trabajo ya existe, lo actualiza en lugar de duplicarlo.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purgar-clases-inactivas',
  '0 4 * * *',
  'select private.purgar_clases_inactivas()'
);

-- Comprobación: debe salir una fila con active = true.
-- select jobname, schedule, active from cron.job where jobname = 'purgar-clases-inactivas';
