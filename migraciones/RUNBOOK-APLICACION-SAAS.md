# Runbook — aplicar las migraciones del pivote SaaS (Bloques 1 y 2)

_Plan de ejecución para cuando el propietario dé el "adelante". Hoy NADA de esto está aplicado en Supabase; la app funciona en "modo clásico". Este documento es la guía para aplicarlo de forma ordenada, verificada y reversible. La herramienta para ejecutar SQL es `node .claude/scripts/sql.js`._

⚠️ **Antes de tocar producción:** hacer backup (export de las tablas o snapshot del proyecto), y —si el plan de Supabase lo permite— ensayar primero en una **rama de Supabase** (aislada de producción). No aplicar nada sin confirmación explícita del propietario.

## Estado real verificado en producción (2026-08-05, solo lectura)

Contrastado contra el esquema real de Supabase con las herramientas de consulta:
- **Modo clásico confirmado:** NO existen `perfiles`, `sucursales`, `modulos_empresa`, ni la columna `alumnos.email`, ni las funciones del portal. La única función SECURITY DEFINER previa es `reparar_secuencias` (de la reparación de ids del sync).
- **`alumnos`**: `id` es `integer`, `empresa_id` es `uuid` → coincide con lo que asumen las funciones del portal (`int` + `empresa_tiene_portal(uuid)`). ✔
- **YA APLICADO — `2026-08-04_unique_matricula_vehiculos.sql`**: el índice `vehiculos_empresa_matricula_activa_uidx` YA existe en producción (migración `20260803231106`). Esa migración NO está pendiente; no hace falta reaplicarla (y es idempotente si se hiciera).

## Orden de aplicación (solo lo realmente pendiente)

| # | Archivo | Qué añade | Depende de |
|---|---------|-----------|------------|
| 1 | `2026-08-01_roles_y_sucursales.sql` | Tablas `perfiles` y `sucursales`, columnas `sucursal_id`, funciones `empresa_actual()`/`rol_actual()`, RLS por empresa/rol, backfill de `perfiles` | — (base de todo) |
| 2 | `2026-08-04_modulos_empresa.sql` | Tabla `modulos_empresa` (entitlements) + RLS | #1 (usa `empresa_actual()`) |
| 3 | `2026-08-05_alumno_email.sql` | Columna `alumnos.email` + índice `lower(email)` | Independiente |
| 4 | `2026-08-05_portal_alumno.sql` | Funciones `alumno_email_existe`, `portal_mis_datos`, `empresa_tiene_portal` (portal del alumno con gating por módulo) | #3 (email); opcionalmente #1+#2 (gating por módulo `portal_alumno`) |

(El índice de matrícula única ya está aplicado — ver arriba —, por eso no está en esta lista.)

Rollback: en **orden inverso** (4 → 1), cada uno con su `*_ROLLBACK.sql`.

> Nota de seguridad esperada: tras aplicar #4, el linter de Supabase (`get_advisors` security) marcará `portal_mis_datos`, `alumno_email_existe` y `empresa_tiene_portal` como "SECURITY DEFINER ejecutable por authenticated". **Es intencionado** (el portal las necesita accesibles); no es un fallo. Ya hoy aparece `reparar_secuencias` con el mismo aviso.

## Verificación tras cada paso

- **Tras #1:** la app de escritorio sigue sincronizando; en Ajustes → Cuenta de empresa el perfil se resuelve (rol 'jefe'). Ejecutar `/estado-nube` o `/diagnostico-sync` si hay dudas. Comprobar que un PC sin sesión sigue trabajando en local.
- **Tras #2:** `getModulosActivos()` deja de devolver modo clásico para las empresas con filas; sin filas, sigue sin activar módulos. Ningún cambio visible hasta dar de alta módulos.
- **Tras #3:** se puede escribir el email de un alumno en la app y, tras sincronizar, aparece en la fila de `alumnos` en Supabase.
- **Tras #4:** el portal del alumno responde (deja de dar 503). Requiere además la config de Auth de abajo.

## Configuración de Supabase Auth (solo para el portal del alumno, paso #4)

En el panel de Supabase (es configuración, la hace el propietario):
1. **Authentication → Providers → Email:** habilitar el inicio de sesión por **email OTP** (código de un solo uso).
2. **Authentication → Email Templates:** en la plantilla de *Magic Link / OTP*, incluir el placeholder **`{{ .Token }}`** para que al alumno le llegue el código de 6 dígitos (no solo un enlace).
3. **Authentication → SMTP:** el SMTP por defecto de Supabase tiene un límite bajo (sirve para pruebas). Para volumen real de alumnos, configurar SMTP propio.

## Activar el portal para una empresa (tras aplicar #1, #2, #4)

Para que una empresa concreta tenga el portal del alumno (módulo `portal_alumno`):
```sql
INSERT INTO modulos_empresa (empresa_id, modulo, activo)
VALUES ('<uuid-de-la-empresa>', 'portal_alumno', true)
ON CONFLICT (empresa_id, modulo) DO UPDATE SET activo = true;
```
Si el sistema de módulos NO está aplicado (solo se aplicó #3 y #4, sin #1/#2), el portal funciona para todas las empresas (modo clásico, sin gating).

## Prueba de humo del portal (tras aplicar todo + config Auth)

1. Poner un email real en un alumno desde la app (y sincronizar), o por SQL de prueba.
2. Abrir `https://aulamovil.vercel.app/alumno.html`, escribir ese email → debe llegar un código al correo.
3. Introducir el código → debe mostrar las prácticas de ese alumno (solo lectura).
4. Casos: email que no es de alumno → mismo mensaje genérico, sin correo. Empresa sin el módulo → no llega código / sin datos.

## Estado de reversibilidad

Todo tiene ROLLBACK escrito. Los borrados remotos de la app siguen siendo soft delete. La columna `alumnos.email` y las funciones del portal son aditivas: revertirlas no afecta a los datos existentes de alumnos/prácticas.
