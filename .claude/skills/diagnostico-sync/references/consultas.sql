-- Consultas de diagnóstico/reparación para Supabase (proyecto dmwoqugdnwgkcqtixhyw)
-- Ejecutar con `node .claude/scripts/sql.js` (lee el token de .mcp.json). Fallback: MCP execute_sql.
-- Los borrados SIEMPRE son soft delete.

-- ── Diff exacto nube vs PC ──────────────────────────────────────────────────
-- Sustituir las listas por los ids que da estado_local.ps1

-- Alumnos/vehículos activos en la nube que NO están en el PC (sobran o faltan por bajar):
select 'alumno' tipo, id, nombre from alumnos   where not deleted and id not in (/*ids alumnos PC*/)
union all
select 'vehiculo', id, nombre    from vehiculos where not deleted and id not in (/*ids vehiculos PC*/)
order by tipo, id;

-- Prácticas activas en la nube que no están en el PC, agrupadas por alumno:
with locales as (select unnest(array[/*ids practicas PC*/]) as id)
select p.alumno_id, a.nombre, count(*)::int
from practicas p join alumnos a on a.id = p.alumno_id
where not p.deleted and p.id not in (select id from locales)
group by 1, 2 order by 3 desc;

-- ── Kilómetros ──────────────────────────────────────────────────────────────
-- Prácticas activas sin km en la nube (si el PC los tiene: fallo de subida, ver skill):
select count(*)::int from practicas where not deleted and coalesce(km_inicial,0)=0 and coalesce(km_final,0)=0;

-- Reparar km en la nube desde los valores del PC (generar VALUES desde data.json):
-- update practicas p set km_inicial = v.ki, km_final = v.kf, updated_at = now()
-- from (values (id,ki,kf),(...)) as v(id, ki, kf)
-- where p.id = v.id and (p.km_inicial is distinct from v.ki or p.km_final is distinct from v.kf);

-- ── Propagación ─────────────────────────────────────────────────────────────
-- Forzar que TODOS los clientes reprocesen los borrados (p.ej. si un PC con versión
-- vieja se saltó los tombstones); hacerlo solo con todos los PCs actualizados:
-- update practicas set updated_at = now() where deleted;
-- update alumnos   set updated_at = now() where deleted;
-- update vehiculos set updated_at = now() where deleted;

-- Marcar borrado algo en la nube (nunca DELETE):
-- update alumnos set deleted = true, updated_at = now() where id in (...);
