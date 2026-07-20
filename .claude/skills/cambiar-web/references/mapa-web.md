# Mapa de web-remote (web móvil)

Para localizar código: usar las **anclas** (cadenas literales, greppables) — nunca números de línea. `index.html` tiene ~720 líneas: leer solo el trozo que toque.

## index.html — estructura (anclas)

- Estilos: bloque único desde `:root {` (sin secciones comentadas).
- Markup: `<!-- LOGIN SCREEN -->` → `<div id="login-screen">`, `<!-- PROFILE SCREEN -->` → `<div id="profile-screen">`, luego `<!-- MAIN APP -->` → `<div id="main-app">` con las secciones (incluida `#section-detalle-alumno`, solo lectura).
- Script: desde `const SUPABASE_URL = ...` hasta `checkSession();` al final.

## Autenticación (Supabase Auth, ya NO hay PIN)

Desde el cambio "web login empresa" (2026-07-18) se borró `web-remote/api/auth.js` y el login por PIN de 4 dígitos. Ahora:

- La SPA hace login **client-side** contra Supabase directamente con `supabase-js` cargado por CDN (`initSupabase()`, `signInWithPassword({ email, password })` en `iniciarSesion()`) — la misma cuenta de empresa que usa el escritorio, no una cuenta separada de la web.
- `checkSession()` mira `supabaseClient.auth.getSession()`: sin sesión → `showLogin()`; con sesión pero sin perfil de profesor guardado en `localStorage` (`kmalumnos_profesor`) → `showProfiles()`; con perfil guardado → `showApp()` directo.
- `showProfiles()` pinta `#profile-screen` ("¿Quién eres?"): pide `GET /api/profesores` y deja elegir un profesor o "Sin profesor" (`seleccionarPerfil(id, nombre)`); el elegido queda en `perfilActivo` y se manda como `profesor_id` al registrar prácticas/alumnos desde el móvil. `cambiarPerfil()` reabre esta pantalla desde el badge del header.
- `apiFetch(url, options)` añade `Authorization: Bearer <access_token>` de la sesión de Supabase (no `X-API-Token`) a cada llamada a `/api/*`, y si la respuesta es 401 fuerza `cerrarSesion()`. **Toda llamada nueva a la API pasa por aquí.**
- `cerrarSesion()` hace `supabaseClient.auth.signOut()`, limpia `kmalumnos_profesor` y vuelve a `showLogin()`.
- Recuperar contraseña olvidada: no hay UI en la web para pedirlo (se solicita desde la app de escritorio, modal de login → "¿Olvidaste tu contraseña?"); pero la web sí **aloja** `web-remote/reset-password.html`, la página a la que Supabase redirige el email de recuperación (`redirectTo`) para fijar la nueva contraseña.

## Pantallas (SPA por pestañas)

| Contenedor | Qué es | Elementos clave |
|---|---|---|
| `#login-screen` | email + contraseña (Supabase Auth) | `#login-email`, `#login-password`, `#login-error`; se oculta con `.hidden`/`display:none` |
| `#profile-screen` | elegir profesor activo tras login | `#profesores-list`, tarjetas por profesor + "Sin profesor" |
| `#section-practica` | registrar práctica (activa por defecto) | `#vehiculo-select`, `#alumno-select`, `#fecha-input`, `#result-ok`/`#result-err` |
| `#section-alumno` | alta de alumno | `#nuevo-nombre`, `#nuevo-permiso`, `#nuevo-vehiculo`, `#result-alumno-ok`/`-err` |
| `#section-historial` | prácticas últimas 24 h | `#historial-list` |
| `#section-detalle-alumno` | historial de un alumno (solo lectura, no es pestaña del tab bar) | `#detalle-alumno-nombre`, `#detalle-alumno-list`; se abre con `verPracticasAlumno(id)` desde historial/alumno, se cierra con `cerrarDetalleAlumno()` |

Navegación: `switchTab('practica'|'alumno'|'historial')` conmuta `.section.active` y `.tab.active`; al entrar en historial llama a `cargarHistorial()`.

## Funciones JS

- Sesión: `initSupabase()`, `checkSession()` → `showLogin()`/`showProfiles()`/`showApp()`; `iniciarSesion()` (signInWithPassword), `seleccionarPerfil(id,nombre)`/`cambiarPerfil()`, `cerrarSesion()`.
- `apiFetch(url, options)` — wrapper de fetch que añade `Authorization: Bearer <access_token>` y fuerza logout si 401. **Toda llamada nueva a la API pasa por aquí.**
- Datos: `cargarDatos()` (GET vehiculos+alumnos, rellena selects), `onVehiculoChange()`/`onAlumnoChange()` (filtros), `registrar()` (POST practica, incluye `profesor_id` de `perfilActivo`), `crearAlumno()`, `cargarHistorial()`, `cancelarPractica(id, nombre)` (con confirm), `verPracticasAlumno(id)`/`cargarDetalleAlumno(id)`/`cerrarDetalleAlumno()` (GET `/api/practicas-alumno`).
- UI puro: `escapeHtml` (**obligatorio para todo dato pintado con innerHTML**), `showError/hideError`, `showAlumnoError/hideAlumnoError`, `resetForm`, `resetAlumnoForm`, `createSparkles`.

## Estilo (resumen — el detalle de diseño está en la skill mejorar-ui)

Tema oscuro glassmorphism: variables en `:root` (`--primary:#6366f1`, `--bg:#0f0f1a`, `--card`, `--text`, `--radius:20px`...). Componentes: `.card`, `.btn`+variantes (`-primary/-secondary/-danger/-again`), `.tabs`/`.tab`, `.select-wrap`, `.result.ok/.err`, `.tag`, `.badge-vehiculo`, `.historial-item`, `.loading-dots`; decoración `.orb`, `.grid-bg`, `.sparkles`.

## Receta de un endpoint nuevo (api/*.js — ES modules, no require)

Plantilla real (así están hechos los 8; `practica.js` es el ejemplo más completo):

```js
import { setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError } from './_utils.js';
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);             // exige "Authorization: Bearer <access_token>", 401 si no
  if (!auth) return;                              // auth = { token, empresaId } (empresaId = claim `sub` del JWT)
  const supabase = getSupabase(auth.token);        // cliente Supabase con ese token reenviado a PostgREST
  // validar CADA campo con validators.* (positiveInt, fecha, nonEmptyString, permiso)
  // consultas siempre con .eq('deleted', false).eq('empresa_id', auth.empresaId); inserts con deleted:false, source:'web-remote', empresa_id:auth.empresaId, updated_at ISO
  if (handleSupabaseError(error, res, 'mensaje')) return; // mapea error de Supabase a 401 (JWT inválido/caducado) o 500
  return res.status(200).json({ ok: true, ... });
}
```

Qué da `_utils.js`: `getSupabase(token)` (cliente Supabase con `Authorization: Bearer <token>` reenviado — así PostgREST aplica RLS por `empresa_id = auth.uid()`), `setCorsHeaders` (orígenes permitidos: producción + localhost), `requireAuth` (exige Bearer JWT bien formado, devuelve `{token, empresaId}` o responde 401), `empresaIdFromToken`, `isAuthError`/`handleSupabaseError` (mapea errores JWT/PostgREST a 401), `withRetry` (reintenta una vez ante `PGRST303`, error transitorio de reloj), `validators` (fecha acepta solo YYYY-MM-DD entre hace 30 días y mañana).

**Ya no existe `auth.js`** (login por PIN, borrado en el cambio "web login empresa" 2026-07-18): el login lo hace la SPA client-side contra Supabase Auth (`signInWithPassword`), no un endpoint propio. No hay `API_PIN` en Vercel.

## Invariantes web

1. Filtrar siempre `deleted=false` al leer; nunca DELETE real (soft delete + `updated_at`).
2. Inserts/updates desde la web llevan `source:'web-remote'` — y cancelar-practica solo puede tocar filas con ese source.
3. Vercel corre en UTC: rangos "de hoy" no existen, se usa "últimas 24 h".
4. Datos pintados en el HTML → `escapeHtml()`.
5. Endpoint nuevo = añadirlo también a `apiFetch` en el front y, si procede, al smoke test (`scripts/probar_web.py`).
6. Los INSERT de `practica.js` y `crear-alumno.js` autorreparan la secuencia de ids si chocan con 23505 (RPC `reparar_secuencias` + un reintento), porque el escritorio sube ids propios y la secuencia de la nube se queda atrás.

## Envs en Vercel

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SYNC_EMAIL`, `SYNC_PASSWORD` (ya no hay `API_PIN`, no queda ningún endpoint que lo use).
