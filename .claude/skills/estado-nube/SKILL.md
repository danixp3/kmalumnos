---
name: estado-nube
description: Chequeo rápido de salud de KMAlumnos — compara en segundos los datos de este PC con la nube (Supabase) y dice si todo está sincronizado. Usar SIEMPRE que el usuario pregunte "¿está todo bien?", "¿está sincronizado?", "revisa la nube", "¿cuántos alumnos/prácticas hay?", pida una comprobación rutinaria o haya que verificar el estado tras una reparación. Si ya hay un síntoma concreto de fallo (datos distintos entre PCs, datos borrados que reaparecen, "error de sync"), usar /diagnostico-sync en su lugar.
---

# Estado de la nube (chequeo rápido)

Objetivo: responder "¿está todo bien?" en 2 pasos y ~4 líneas, sin abrir código ni el runbook completo. Este PC (el principal) es la fuente de verdad: la nube debe ser su espejo.

## Paso 1 — Local

```
powershell -File .claude/skills/diagnostico-sync/scripts/estado_local.ps1
```

(script compartido con /diagnostico-sync: contadores de `data.json`, colas pendientes y `lastSync`)

## Paso 2 — Nube (MCP de Supabase, `execute_sql`)

```sql
select 'vehiculos' tabla, count(*) filter (where not deleted)::int activos, count(*) filter (where deleted)::int borrados, max(updated_at)::text ultimo_cambio from vehiculos
union all select 'alumnos', count(*) filter (where not deleted), count(*) filter (where deleted), max(updated_at)::text from alumnos
union all select 'practicas', count(*) filter (where not deleted), count(*) filter (where deleted), max(updated_at)::text from practicas;
```

## Veredicto

Todo bien si se cumplen las tres:
1. **Activos en la nube = contadores locales** (vehículos, alumnos y prácticas). Comparar contra lo que diga el paso 1 hoy, no contra cifras memorizadas: los datos crecen.
2. **Colas pendientes vacías** en `pending_sync.json`.
3. **Prácticas sin km**: el recuento local es informativo (puede haber pendientes reales de rellenar); solo es sospechoso si en la nube hay muchas más prácticas con km=0 que en local.

Matices para no dar falsas alarmas:
- Los **borrados** de la nube son tombstones históricos (soft delete): que haya muchos es normal, no un problema.
- Un `lastSync` viejo con la app cerrada es normal; solo preocupa si la app está abierta y no avanza.
- Pendientes en cola con la app cerrada también es normal: se subirán al abrirla.

Responder al usuario en términos de negocio (X alumnos, Y prácticas, "todo sincronizado" / "hay una diferencia en..."), máximo 4 líneas. Si algo no cuadra, no investigar por libre aquí: pasar a **/diagnostico-sync**, que tiene las consultas de diff exacto y las causas conocidas.
