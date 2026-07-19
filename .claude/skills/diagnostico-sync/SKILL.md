---
name: diagnostico-sync
description: Runbook para diagnosticar problemas de sincronización de KMAlumnos entre los PCs, la nube (Supabase) y la web del móvil. Usar SIEMPRE que el usuario diga que un PC muestra datos distintos al otro, que aparecen datos borrados, que faltan kilómetros o registros, "error de sync", "no sincroniza", o cualquier discrepancia de datos entre dispositivos.
---

# Diagnóstico de sincronización

Arquitectura en 10 segundos: cada PC trabaja contra su `data.json` local (`%APPDATA%\kmalumnos\`); `pending_sync.json` guarda qué falta por subir y la marca `lastSync`. Cada 2 min: sube pendientes → baja de la nube todo lo con `updated_at > lastSync` (orden vehículos → alumnos → prácticas). Todos los borrados son soft delete (`deleted=true`) y así se propagan. La web del móvil escribe directo en la nube.

## Paso 1 — Estado local de este PC (5 segundos)

```
powershell -File .claude/skills/diagnostico-sync/scripts/estado_local.ps1
```
Da contadores e ids de `data.json`, y de `pending_sync.json` el `lastSync` y las colas pendientes.

## Paso 2 — Estado de la nube (`node .claude/scripts/sql.js`)

```
node .claude/scripts/sql.js "select 'vehiculos' t, count(*) filter (where not deleted)::int activos, count(*) filter (where deleted)::int borrados from vehiculos union all select 'alumnos', count(*) filter (where not deleted), count(*) filter (where deleted) from alumnos union all select 'practicas', count(*) filter (where not deleted), count(*) filter (where deleted) from practicas;"
```
Fallback: si el script falla (token o red), usar el MCP de Supabase (`execute_sql`) con la misma consulta.

Más consultas útiles (diff exacto por ids, prácticas sin km, retocar tombstones) en `references/consultas.sql` — leerlo solo si el paso 2 muestra discrepancia. Ejecutarlas también con `node .claude/scripts/sql.js` (fallback: MCP `execute_sql`).

## Paso 3 — Logs de la API (MCP de Supabase, `get_logs` servicio `api`)

Único paso que aún usa el MCP de Supabase; cargarlo solo si se llega aquí (no hace falta para los pasos 1 y 2).

Patrones conocidos:
- **Solo pings a `/rest/v1/meta` cada 2 min, sin GETs de alumnos/prácticas** → ese cliente revienta en local justo tras el ping (histórico: `data.json` dañado/ausente). Desde v1.3.10 se auto-recupera; el motivo exacto se ve pasando el ratón por "Error de sync".
- **Ninguna petición de un PC** → no llega a internet (red/antivirus) o la app está cerrada.
- Los logs solo muestran 24 h y todos los clientes mezclados; distinguirlos por el patrón de `updated_at=gt.<fecha>` (es el `lastSync` de cada cliente).

## Causas conocidas (todas ya corregidas — sirven de sospechosos si reaparecen)

| Síntoma | Causa histórica | Estado |
|---|---|---|
| PC vacío con "Error de sync" eterno | sync leía data.json sin defensas; no bajaba vehículos | v1.3.10 |
| Datos borrados reaparecen en otro PC | borrados de alumnos/vehículos no se propagaban (FK + sin tombstone) | v1.3.11 |
| Km a 0 en la nube/otro PC | relleno masivo, solapamientos y CSV no marcaban `markDirty` | v1.3.12 |
| Tras "Subir todo a la nube" no baja lo antiguo | pushAll adelantaba `lastSync` | v1.3.10 |
| Tras restaurar un backup no se sube nada | `restaurarBackup` no marca pendientes | **sin arreglar**: usar "Subir todo a la nube" |

## Reglas de oro al reparar datos

- El PC del usuario (escritorio principal) es la fuente de verdad si hay conflicto.
- En la nube NUNCA borrar filas: siempre `deleted=true` + `updated_at=now()` (la FK de prácticas impide borrar alumnos y sin tombstone los demás dispositivos no se enteran).
- Para forzar que todos los PCs reprocesen algo: `update ... set updated_at = now()` (los clientes bajan todo lo posterior a su `lastSync`).
- Antes de tocar datos en Supabase: enseñar el diff exacto al usuario y pedir confirmación (metodología del proyecto).
