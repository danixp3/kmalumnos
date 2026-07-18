# Mapa de web-remote (web móvil)

Para localizar código: usar las **anclas** (cadenas literales, greppables) — nunca números de línea. `index.html` tiene ~720 líneas: leer solo el trozo que toque.

## index.html — estructura (anclas)

- Estilos: bloque único desde `:root {` (sin secciones comentadas).
- Markup: `<!-- LOGIN SCREEN -->` → `<div id="login-screen">`, luego `<!-- MAIN APP -->` → `<div id="main-app">` con las 3 secciones.
- Script: desde `const API_TOKEN_KEY = 'kmalumnos_token';` hasta `checkSession();` al final.

## Pantallas (SPA por pestañas)

| Contenedor | Qué es | Elementos clave |
|---|---|---|
| `#login-screen` | PIN | `#pin-input`, `#login-error`; se oculta con `.hidden` |
| `#section-practica` | registrar práctica (activa por defecto) | `#vehiculo-select`, `#alumno-select`, `#fecha-input`, `#result-ok`/`#result-err` |
| `#section-alumno` | alta de alumno | `#nuevo-nombre`, `#nuevo-permiso`, `#nuevo-vehiculo`, `#result-alumno-ok`/`-err` |
| `#section-historial` | prácticas últimas 24 h | `#historial-list` |

Navegación: `switchTab('practica'|'alumno'|'historial')` conmuta `.section.active` y `.tab.active`; al entrar en historial llama a `cargarHistorial()`.

## Funciones JS

- Sesión: `checkSession()` (localStorage, 24 h) → `showLogin()`/`showApp()`; `verificarPin()` (POST `/api/auth`); `cerrarSesion()`.
- `apiFetch(url, options)` — wrapper de fetch que añade `X-API-Token` y fuerza logout si 401. **Toda llamada nueva a la API pasa por aquí.**
- Datos: `cargarDatos()` (GET vehiculos+alumnos, rellena selects), `onVehiculoChange()`/`onAlumnoChange()` (filtros), `registrar()` (POST practica), `crearAlumno()`, `cargarHistorial()`, `cancelarPractica(id, nombre)` (con confirm).
- UI puro: `escapeHtml` (**obligatorio para todo dato pintado con innerHTML**), `showError/hideError`, `showAlumnoError/hideAlumnoError`, `resetForm`, `resetAlumnoForm`, `createSparkles`.

## Estilo (resumen — el detalle de diseño está en la skill mejorar-ui)

Tema oscuro glassmorphism: variables en `:root` (`--primary:#6366f1`, `--bg:#0f0f1a`, `--card`, `--text`, `--radius:20px`...). Componentes: `.card`, `.btn`+variantes (`-primary/-secondary/-danger/-again`), `.tabs`/`.tab`, `.select-wrap`, `.result.ok/.err`, `.tag`, `.badge-vehiculo`, `.historial-item`, `.loading-dots`; decoración `.orb`, `.grid-bg`, `.sparkles`.

## Receta de un endpoint nuevo (api/*.js — ES modules, no require)

Plantilla real (así están hechos los 7; `practica.js` es el ejemplo más completo):

```js
import { setCorsHeaders, requireAuth, validators, getSupabase } from './_utils.js';
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!requireAuth(req, res)) return;            // token X-API-Token, 401 si no
  const supabase = await getSupabase();          // sesión server-side cacheada (envuelto en try/catch → 500)
  // validar CADA campo con validators.* (positiveInt, fecha, nonEmptyString, permiso)
  // consultas siempre con .eq('deleted', false); inserts con deleted:false, source:'web-remote', updated_at ISO
  return res.status(200).json({ ok: true, ... });
}
```

Qué da `_utils.js`: `getSupabase()` (login con `SYNC_EMAIL`/`SYNC_PASSWORD` si existen, si no anon), `setCorsHeaders` (orígenes permitidos: producción + localhost), `requireAuth`/`validateToken` (token = base64 `PIN:timestamp`, caduca 24 h), `validators` (fecha acepta solo YYYY-MM-DD entre hace 30 días y mañana).

Excepción conocida: `auth.js` no usa `_utils.js` (duplica CORS y validateToken dentro) — si se toca la lógica de tokens, cambiarla en LOS DOS sitios.

## Invariantes web

1. Filtrar siempre `deleted=false` al leer; nunca DELETE real (soft delete + `updated_at`).
2. Inserts/updates desde la web llevan `source:'web-remote'` — y cancelar-practica solo puede tocar filas con ese source.
3. Vercel corre en UTC: rangos "de hoy" no existen, se usa "últimas 24 h".
4. Datos pintados en el HTML → `escapeHtml()`.
5. Endpoint nuevo = añadirlo también a `apiFetch` en el front y, si procede, al smoke test (`scripts/probar_web.py`).
6. Los INSERT de `practica.js` y `crear-alumno.js` autorreparan la secuencia de ids si chocan con 23505 (RPC `reparar_secuencias` + un reintento), porque el escritorio sube ids propios y la secuencia de la nube se queda atrás.

## Envs en Vercel

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_PIN`, `SYNC_EMAIL`, `SYNC_PASSWORD`.
