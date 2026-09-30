# Mapa de web-remote (web móvil — rediseño 2026-09-29)

Para localizar código: usar las **anclas** (cadenas literales, greppables) — nunca números de línea. `index.html` tiene ~1200 líneas (CSS + HTML + JS en un solo archivo): leer solo el trozo que toque.

## Qué es

App del **profesor** para dar la clase desde el teléfono (tablet en horizontal = mismo flujo con "riel" lateral). Flujo real de una clase: **Hoy → Iniciar (alumno, coche, km del cuentakilómetros) → En curso (cronómetro, "lo trabajado", observación) → Km final (teclado numérico) → Firma del alumno → vuelve a Hoy**. Además: lista de alumnos con ficha, alta de alumno e historial.

## index.html — estructura (anclas)

- Estilos: bloque `<style>` con tokens en `:root {` (`--ink`, `--bg`, `--card`, `--amber`, `--ok`, `--err`, `--font*`, `--tab-h`). Tema oscuro con `setTema(oscuro)`. Fuentes locales `web-remote/fonts/*.woff2` (Barlow, Barlow Condensed, IBM Plex Mono).
- Markup: `<!-- ACCESO -->` (`#login-screen`, `#profile-screen`) y `<!-- APP -->` con una `<section class="vista">` por pantalla: `<!-- HOY -->`, `<!-- INICIAR -->`, `<!-- EN CURSO -->`, `<!-- KM FINAL -->`, `<!-- FIRMA -->`, `<!-- ALUMNOS -->`, `<!-- FICHA -->`, `<!-- NUEVO ALUMNO -->`, `<!-- HISTORIAL -->` (calendario, es pestaña). Barra inferior `#tabbar` de 5: Hoy · Historial · (+) · Alumnos · Perfil. Hoja inferior/diálogos en `#capa` (`abrirHoja(html)` / `cerrarHoja()`).
- Script: desde `const SUPABASE_URL = ...` hasta el final. Estado global en `const S = {...}`.

## Autenticación (Supabase Auth, sin PIN)

`initSupabase()` → `checkSession()` → `mostrarLogin()` / `mostrarPerfiles()` / `entrarApp()`. Login con `signInWithPassword` en `iniciarSesion()` (misma cuenta de empresa que el escritorio). "¿Quién eres?" = `mostrarPerfiles()`/`elegirPerfil(id,nombre)` (profesor activo en `localStorage.kmalumnos_profesor`, se manda como `profesor_id`). **Toda llamada a la API pasa por `apiFetch(url, options)`** (añade `Authorization: Bearer <access_token>`; 401 → `cerrarSesion()`). La página `reset-password.html` aloja el cambio de contraseña al que apunta el email de Supabase.

## Funciones JS por pantalla

- Navegación: `go(vista, opciones)` (historial del navegador, `VISTAS_TAB`), `volver()`, `toast(msg)`, `renderRiel()` (columna lateral en tablet).
- Datos base: `cargarBase()` (GET vehículos + alumnos + `/api/config` → `S.zonas`), `cargarJornada()` (GET `/api/hoy` del día visto → `S.jornada` y SIEMPRE el de hoy → `S.jornadaHoy`, que es lo que pinta el riel), `cambiarDia(n)`. **`actualizarHoy()`** recalcula `S.hoy` (la web puede quedarse abierta pasada la medianoche); `refrescar()` al volver a la pestaña (`visibilitychange`, >30 s) y cada minuto si cambia el día. Totales del alumno SIEMPRE con `clasesAlumno(a)`/`kmAlumno(a)` (app + `clases_previas`/`km_previos`).
- **Hoy:** `renderHoy()` (prácticas del día, pendientes de firma, prácticas sin cerrar de días anteriores, reservas de la agenda), `cardVehiculo`, `elegirVehiculo`/`fijarVehiculo`.
- **Iniciar:** `abrirIniciar(op)`, `renderIniciar()`, `tecleaKmIni`, `usarKmAnterior`, `msgContinuidad` (avisa si el km no encaja con el final de la práctica anterior del coche), `elegirAlumnoIniciar`/`fijarAlumnoIniciar`, «Zonas recorridas» (`toggleZonaIniciar`, solo si `S.zonas` no está vacío; sustituye al antiguo «Tipo de práctica», `tipo` va siempre `circulacion`), `empezarPractica()` (POST `iniciar-practica` con `zonas`), `registrarSinCronometro()` (POST `practica`, modo clásico km 0/0).
- **En curso:** `renderCurso()`, `tickCrono()`, `toggleTrabajado`, `abrirObservacion`, `menuCurso`, `cancelarCurso`; el flujo vive en `S.flujo` y se guarda en `localStorage.km_flujo` (sobrevive a recargas); `continuarPractica(id)` reengancha una práctica abierta.
- **Km final / firma:** `abrirKmFinal`, `renderKmFinal`, `tecla(k)`, `continuarFirma()` (POST `finalizar-practica`), `renderFirma`, `iniciarLienzo` (canvas con suavizado), `firmaComoPNG`, `confirmarFirma()` (POST `firmar-practica`), `firmarMasTarde`, `terminarFlujo`.
- **En curso:** zonas editables (`zonasCurso`/`toggleZonaCurso` → `F.zonas`, se mandan al finalizar).
- **Alumnos:** `renderAlumnos` (filtro «Míos» cae a «Todos» si no hay asignados; recarga al entrar si >30 s), `pintarListaAlumnos`, `abrirFicha(id)`/`renderFicha` (calendario mensual, `mesFicha`; cada práctica abre su detalle), `renderNuevo`/`crearAlumno()`.
- **Historial (calendario):** `renderHistorial`/`cargarCalendario` (GET `/api/calendario` del mes, caché `S.cal.cache[mes|filtro]`), `pintarHistorial`, `mesHist(±1)` (y deslizar, `activarSwipeHist`), `filtroHist('mias'|'todas')`, `elegirDiaHist`. **Detalle de clase:** `abrirDetalle(id)` (GET `/api/practica-detalle`) → `pintarDetalle` (firma validada con `FIRMA_VALIDA`), `firmarDesdeDetalle()` (flujo de firma con `volverA`), `cancelarPractica(id)`.
- Helpers: `esc()` (**obligatorio para todo dato pintado con innerHTML**), `fechaLocal`, `fechaLarga/fechaCorta`, `digitos`, `tiempoTxt`, iconos SVG en `const IC`.

## Endpoints (api/*.js — ES modules)

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/vehiculos` | GET | Vehículos con `km_actual` y `ultimo` (última práctica cerrada, para la continuidad del cuentakilómetros) |
| `/api/alumnos` | GET | Alumnos con resumen (nº prácticas, km, última) |
| `/api/hoy?fecha&hoy&profesor_id` | GET | Jornada: prácticas del día (`en_curso`, `firmada`), sin cerrar de días anteriores, reservas |
| `/api/iniciar-practica` | POST | Crea la práctica con km inicial real y km final 0 (=en curso). 409 si el coche ya tiene una abierta |
| `/api/finalizar-practica` | POST | Pone km final, `trabajado`, observación (`nota`), `hora_fin`. Valida km final > inicial y < 1000 km |
| `/api/firmar-practica` | POST | Guarda la firma (PNG data-URL, máx 200.000 caracteres; la web la recorta al contorno). 501 `firma_no_disponible` sin la columna |
| `/api/config` | GET | Ajustes compartidos de la empresa (`ajustes_empresa`): `{ zonas }`. Sin tabla → `[]` |
| `/api/calendario?desde&hasta&hoy&profesor_id` | GET | Prácticas de un rango (≤ 62 días) con `firmada` (columna generada, sin bajar la imagen), zonas, km, estado |
| `/api/practica-detalle?id` | GET | Una práctica completa con la firma, profesor, nº de clase (con `clases_previas`) y `cancelable` |
| `/api/practica` | POST | Registro clásico (km 0/0), sigue funcionando |
| `/api/crear-alumno`, `/api/cancelar-practica`, `/api/historial`, `/api/practicas-alumno`, `/api/profesores`, `/api/agenda-profesor` | — | Como antes |
| `/api/alumno-*` | — | Portal del alumno (`alumno.html`, OTP por email) |

**"En curso" es implícito** (sin columna nueva): `km_inicial>0 && km_final==0 && fecha==hoy`; con fecha anterior = "sin cerrar". Igual que `esPracticaEnCurso` en `db/core.js` del escritorio.

**Ids:** lo que crea la web (prácticas, alumnos) toma el id de `practicas_web_id_seq`/`alumnos_web_id_seq` (≥ 1.000.000.000, default de la columna desde la migración 2026-10-01); el escritorio numera por debajo. No mandar `id` en los inserts.

## Receta de un endpoint nuevo

```js
import { setCorsHeaders, requireAuth, validators, getSupabase, withRetry, handleSupabaseError } from './_utils.js';
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const auth = requireAuth(req, res);  if (!auth) return;   // { token, empresaId }
  const supabase = getSupabase(auth.token);                  // RLS por empresa_id
  // validar CADA campo (validators.*, hhmmValido, kmEntero de _utils.js)
  // leer con .eq('deleted', false); escribir con deleted:false, source:'web-remote', updated_at ISO
  // if (handleSupabaseError(error, res, 'mensaje')) return;
}
```

`_utils.js` además exporta para el flujo móvil: `COLUMNAS_PRACTICA_BASE`/`COLUMNAS_PRACTICA_MOVIL` (incluye `zonas`; para una práctica suelta) y `COLUMNAS_PRACTICA_LISTA` (con `firmada` en vez de `firma`: úsala en listados), `conFallbackColumnas(fn)` (si faltan columnas opcionales reintenta sin ellas), `insertarPractica` (autorrepara la secuencia en 23505), **`traerTodo(construir)`** (pagina: PostgREST corta en 1.000 filas), `limpiarZonas`, `nombreCompleto`, `kmDePractica`, `hhmmValido`, `kmEntero`.

## Pruebas (sin tocar producción)

- **API:** `npm run test:api` — `web-remote/tests/` = Supabase falso en memoria (`fake-supabase.mjs`, simula `range`, `BD.maxRows` y la columna generada `firmada`) + hook de módulos (`register.mjs`/`hooks.mjs`) que sustituye `@supabase/supabase-js`; 21 pruebas. Se ejecuta con el `node --test` nativo, jest no lo recoge.
- **Web entera en local:** servidor de pruebas que sirve `web-remote/` y ejecuta los endpoints reales contra el Supabase falso (`node --import ./web-remote/tests/register.mjs servidor.mjs`, sustituyendo el `import()` del CDN de Supabase por una sesión simulada) + Playwright para capturas; patrón usado el 2026-10-01, scripts en el scratchpad.
- **Web publicada:** `python .claude/skills/cambiar-web/scripts/probar_web.py` (login + lecturas; no crea datos).
- **Interfaz:** Playwright contra el `index.html` con Supabase/API simulados (patrón usado en el rediseño; scripts en el scratchpad de la sesión, no versionados).

## Invariantes web

1. Filtrar siempre `deleted=false` al leer; nunca DELETE real (soft delete + `updated_at`).
2. Escrituras desde la web llevan `source:'web-remote'`; `cancelar-practica` solo toca filas con ese source.
3. Vercel corre en UTC: la web manda `fecha`/`hoy` en hora LOCAL del teléfono (`fechaLocal()`); rangos "últimas 24 h" en el historial.
4. Datos pintados en el HTML → `esc()`.
5. Columnas nuevas de `practicas` (`firma`, `trabajado`, `tipo_detalle`, `hora_fin`) son **opcionales**: la migración `migraciones/2026-09-29_practica_movil.sql` puede no estar aplicada → todo handler debe degradar con `conFallbackColumnas`.
6. Endpoint nuevo = añadirlo también a `web-remote/tests/api.test.mjs`.

## Envs en Vercel

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SYNC_EMAIL`, `SYNC_PASSWORD` (no hay `API_PIN`).
