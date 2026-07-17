# Inventario de estilo de las dos interfaces

Localizar siempre por **anclas** (cadenas literales) con Grep + Read parcial; los números de línea caducan.

**Regla de identidad global: NADA de emojis en la UI.** Toda la iconografía es SVG inline estilo Lucide (stroke="currentColor", stroke-width 2, tamaños 12–19px). Solo se permiten los glifos tipográficos ✓ y ✕ en textos de estado.

## Escritorio — index.html (~1718 líneas, CSS inline)

**Identidad:** panel SaaS claro estilo Linear/Stripe. Fuente `Inter`, fondo `#f6f7f9`, **sidebar claro** (`#fff` con borde derecho `--sidebar-border`), acento índigo `#4f46e5`. Marca: `.sidebar-logo-icon` (cuadrado degradado índigo→violeta con SVG de velocímetro) + "KMAlumnos / Gestión de autoescuela".

**El `<style>` sigue organizado por secciones comentadas** `/* ── NOMBRE ─── */`: `SCROLLBAR`, `LAYOUT`, `SIDEBAR`, `CONTENT`, `PAGES`, `PAGE HEADER`, `CARDS`, `STATS`, `FORMS`, `BUTTONS`, `TABLES`, `BADGES`, `REGISTRO RÁPIDO ITEMS`, `MODAL`, `ALERTS`, `MISC`, `BANNER CARD`, `DIVIDER`, `DASH QUICK ACTIONS`, `RANGE INPUT`, `SYNC STATUS`.

**Variables (`:root`):** `--primary:#4f46e5` `--primary-dark:#4338ca` `--primary-light:#eef2ff` · `--success:#10b981` `--danger:#ef4444` `--warn:#f59e0b` (+ variantes -light) · `--sidebar-bg:#fff` `--sidebar-border:#ebedf2` `--sidebar-text:#5b6472` `--sidebar-hover:#f4f5f9` `--sidebar-active:#eef2ff` · `--text:#101828` `--text-muted:#667085` · `--border:#e7e9f0` · `--bg:#f6f7f9` · `--radius:12px` · `--shadow`/`--shadow-md` muy suaves (tinte #101828).

**Componentes:** `.card`/`.card-title`/`.card-title-icon` (chip 28px con SVG 14px; bg pastel + color a juego inline) · `.stat` con `.stat-head` (`.lbl` uppercase + `.stat-icon` 34px con SVG) y `.num` 30px debajo · `.section-label` · **`.quick-grid`/`.quick-card`(`.quick-card-primary` en degradado índigo)/`.quick-icon`/`.quick-text`/`.quick-arrow`** — accesos rápidos clicables del dashboard, navegan con `navegarA('pagina')` · `.btn-*` (primary con hover a `--primary-dark`) · `.tag-b/a/c`, `.km-badge`, `.badge-warn` · `.rr-item`... · `.overlay`/`.modal` · `.alert-*` · `.table-wrap`.

**Pantallas / orden del nav:** Principal → dashboard, registro-rapido, alumnos, vehiculos · Herramientas → timeline, solapamientos, importar, csv-tools, logs · Sistema → backup. Cada vista es `<div id="page-XXX" class="page">`; `.page` tiene `max-width:1180px` centrado.

**⚠ Acoplamiento con renderer.js:** el contenido dinámico se pinta desde renderer.js con clases Y AHORA TAMBIÉN SVGs en strings (alertas del dashboard, botones de tablas Editar/Borrar/Prácticas/Anotaciones, `LOG_ICONS` del historial, celda ⚡→SVG de solapamientos, botón de nota `.rr-nota-btn`). Si se renombra una clase o se cambia la iconografía, grep en renderer.js.

## Web móvil — web-remote/index.html (~878 líneas, CSS inline)

**Identidad:** oscura glassmorphism refinada y contenida (menos ruido que antes): `status-line` estática sutil, orbes a opacidad .35, `grid-bg` casi invisible. Comparte marca con escritorio: `.logo-mark` (52px, degradado índigo con SVG velocímetro) + `h1` + `.version` (chip píldora).

**Variables:** `--primary:#6366f1` (más claro que escritorio a propósito, por el fondo oscuro) `--primary-dark:#4f46e5` · `--bg:#0b0e17` · `--card:rgba(255,255,255,.055)` `--card-border:rgba(255,255,255,.09)` · `--radius:18px` · resto igual.

**Componentes:** `.tabs` es un **control segmentado** (contenedor con borde y padding 4px; `.tab.active` = pastilla con degradado índigo y texto blanco) · `.logo-mark`/`.version` · `.card` glass · `.btn-primary` degradado (glow reducido) · `.result(.ok/.err)` con `.result-icon` en SVG (check-circle verde / x-circle rojo) · `.historial-item` + contador `#historial-count` (se rellena en `cargarHistorial`) · `.pin-input` · `.logout-btn` píldora.

**Pantallas:** `#login-screen` (logo-mark + PIN) → `#main-app` con secciones practica/alumno/historial vía `switchTab`. El JS vive en el propio archivo (ancla `const API_TOKEN_KEY`); el HTML dinámico del historial se genera ahí.

## Nota común

Marca compartida: índigo (`#4f46e5` escritorio / `#6366f1` web) y el mismo logo de velocímetro en cuadrado degradado índigo→violeta. Si el usuario quiere cambiar "el color de la app", tocarlo en las dos. Favicon de la web: SVG data-URI con ese mismo logo.
