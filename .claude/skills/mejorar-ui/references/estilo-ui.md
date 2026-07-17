# Inventario de estilo de las dos interfaces

Localizar siempre por **anclas** (cadenas literales) con Grep + Read parcial; los números de línea caducan.

## Escritorio — index.html (~1490 líneas, CSS inline)

**Identidad:** panel de administración SaaS claro. Fuente `Inter` (Google Fonts, `@import` al inicio del `<style>`), fondo `#f8fafc`, sidebar oscuro `#0f172a`, acento índigo `#6366f1`. Densidad alta: tipografía 13–13.5px, tablas y formularios compactos, tarjetas con iconos en chips de color.

**El `<style>` está organizado por secciones comentadas** `/* ── NOMBRE ─── */` — greppables directamente: `SCROLLBAR`, `LAYOUT`, `SIDEBAR`, `CONTENT`, `PAGES`, `PAGE HEADER`, `CARDS`, `STATS`, `FORMS`, `BUTTONS`, `TABLES`, `BADGES`, `REGISTRO RÁPIDO ITEMS`, `MODAL`, `ALERTS`, `MISC`, `BANNER CARD`, `DIVIDER`, `DASH QUICK GUIDE`, `RANGE INPUT`, `SYNC STATUS` (ancla `#sync-bar {`).

**Variables (`:root`)** — el mando de control del tema:
`--primary:#6366f1` `--primary-dark:#4f46e5` `--primary-light:#e0e7ff` · `--success:#10b981`/`--success-light` · `--danger:#ef4444`/`--danger-light` · `--warn:#f59e0b`/`--warn-light` · `--gray:#64748b`/`--gray-light` · `--sidebar-bg:#0f172a` `--sidebar-hover` `--sidebar-active` · `--text:#0f172a` `--text-muted` · `--border:#e2e8f0` · `--bg:#f8fafc` · `--card:#ffffff` · `--radius:12px` · `--shadow` `--shadow-md`.

**Componentes:** `.card`/`.card-title`/`.card-title-icon` · `.card-banner(-success/-warn)` (borde izquierdo de color) · `.stat` + `.stat-icon-blue/green/orange` (tiles de métricas) · `.btn-primary/success/danger/warn/gray/outline`, `.btn-sm`, `.btn-icon` · `.tag-b/a/c` (badges de permiso pastel) · `.km-badge` (píldora verde) · `.badge-warn` · `.rr-item(.selected)`/`.rr-check`/`.rr-counter` (checklist registro rápido) · `.overlay`/`.modal`/`.modal-header`/`.modal-actions` · `.alert-ok/err/info/warn` · `.table-wrap` + tabla con thead gris.

**Pantallas:** navegación por `<a data-page="...">` del `#sidebar`; cada vista es `<div id="page-XXX" class="page">` (`.page.active`): dashboard, vehiculos, alumnos (con subvistas `#view-alumnos`/`#view-practicas`), solapamientos, logs, backup, timeline, importar, csv-tools, registro-rapido. Modales (`.overlay` + `.open`): `modal-sync-creds`, `modal-vehiculo`, `modal-alumno`, `modal-practica`, `modal-nota-rr`, `modal-anotaciones`.

**⚠ Acoplamiento con renderer.js:** el contenido dinámico (filas de tablas, alertas, badges, timeline...) lo pinta renderer.js con clases en strings HTML. Si se renombra o rediseña una clase de componente, `grep` de esa clase en renderer.js — cambiarla solo en el CSS deja la mitad vieja.

## Web móvil — web-remote/index.html (~720 líneas, CSS inline)

**Identidad:** oscura y vistosa, glassmorphism con animaciones (orbes flotantes, sparkles). Es deliberadamente distinta del escritorio: es la cara "bonita" para el móvil.

**Estilos:** bloque único desde `:root {`, sin secciones comentadas (localizar por selector).

**Variables:** `--primary:#6366f1` `--primary-dark:#4f46e5` · `--success:#10b981` `--danger:#ef4444` `--warn:#f59e0b` · `--bg:#0f0f1a` · `--card:rgba(255,255,255,.06)` `--card-border:rgba(255,255,255,.1)` · `--text:#f1f5f9` `--text-muted:#94a3b8` · `--border:rgba(255,255,255,.12)` · `--radius:20px` · `--glow:rgba(99,102,241,.4)` (definida pero sin uso).

**Componentes:** `.card` (glass con blur) · `.btn` + `.btn-primary/-secondary/-danger/-again` · `.tabs`/`.tab(.active)` · `.select-wrap` (flecha ▾ custom) · `.result(.ok/.err)` + `.result-icon/-title/-msg` · `.tag`, `.badge-vehiculo` · `.historial-item/-info/-nombre/-fecha/-empty` · `.pin-input`, `.login-error` · `.loading-dots` · decoración: `.orb(.orb-1/2/3)`, `.grid-bg`, `.status-line`, `.sparkles`/`.sparkle`.

**Pantallas:** `#login-screen` → `#main-app` con `#section-practica`/`#section-alumno`/`#section-historial` (pestañas vía `switchTab`). El JS está en el propio archivo (ancla `const API_TOKEN_KEY`); el HTML dinámico del historial se genera ahí (mismas precauciones al renombrar clases).

## Nota común

Las dos paletas comparten el índigo `#6366f1` como color de marca — si el usuario quiere cambiar "el color de la app", probablemente quiera cambiarlo en las dos.
