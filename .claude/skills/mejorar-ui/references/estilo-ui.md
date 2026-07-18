# Inventario de estilo de las dos interfaces

Localizar siempre por **anclas** (cadenas literales) con Grep + Read parcial; los números de línea caducan.

**Regla de identidad global: NADA de emojis en la UI.** Toda la iconografía es SVG inline estilo Lucide (stroke="currentColor", stroke-width 2, tamaños 12–19px). Solo se permiten los glifos tipográficos ✓ y ✕ en textos de estado.

## Escritorio — index.html (~1718 líneas, CSS inline)

**Identidad:** panel SaaS claro estilo Linear/Stripe. Fuente `Inter`, fondo `#f6f7f9`, **sidebar claro** (`#fff` con borde derecho `--sidebar-border`), acento índigo `#4f46e5`. Marca: `.sidebar-logo-icon` (cuadrado degradado índigo→violeta con SVG de velocímetro) + "KMAlumnos / Gestión de autoescuela".

**El `<style>` sigue organizado por secciones comentadas** `/* ── NOMBRE ─── */`: `SCROLLBAR`, `LAYOUT`, `SIDEBAR`, `CONTENT`, `PAGES`, `PAGE HEADER`, `CARDS`, `STATS`, `FORMS`, `BUTTONS`, `TABLES`, `BADGES`, `REGISTRO RÁPIDO ITEMS`, `MODAL`, `ALERTS`, `MISC`, `BANNER CARD`, `DIVIDER`, `DASH QUICK ACTIONS`, `RANGE INPUT`, `PAGE TABS`, `SIDEBAR FOOTER`, `SYNC STATUS`.

**Variables (`:root`):** `--primary:#4f46e5` `--primary-dark:#4338ca` `--primary-light:#eef2ff` · `--success:#10b981` `--danger:#ef4444` `--warn:#f59e0b` (+ variantes -light) · `--sidebar-bg:#fff` `--sidebar-border:#ebedf2` `--sidebar-text:#5b6472` `--sidebar-hover:#f4f5f9` `--sidebar-active:#eef2ff` · `--text:#101828` `--text-muted:#667085` · `--border:#e7e9f0` · `--bg:#f6f7f9` · `--radius:12px` · `--shadow`/`--shadow-md` muy suaves (tinte #101828).

**Componentes:** `.card`/`.card-title`/`.card-title-icon` (chip 28px con SVG 14px; bg pastel + color a juego inline) · `.stat` con `.stat-head` (`.lbl` uppercase + `.stat-icon` 34px con SVG) y `.num` 30px debajo · `.section-label` · `.page-tabs`/`.page-tab`/`.tab-content` (pestañas internas de página, ej. `page-kilometros` con `cambiarTabKilometros('mapa'|'conflictos')`, `page-datos` con `cambiarTabDatos('importar'|'exportar'|'comparar')`) · **`.quick-grid`/`.quick-card`(`.quick-card-primary` en degradado índigo)/`.quick-icon`/`.quick-text`/`.quick-arrow`** — accesos rápidos clicables del dashboard, navegan con `navegarA('pagina')` · `.btn-*` (primary con hover a `--primary-dark`) · `.tag-b/a/c`, `.km-badge`, `.badge-warn` · `.rr-item`... · `.overlay`/`.modal` · `.alert-*` · `.table-wrap`.

**Pantallas / orden del nav (4 grupos):** **Gestión** → dashboard, registro-rapido, alumnos, vehiculos · **Análisis** → kilometros (con pestañas internas `#tab-kilometros-mapa` "Mapa del vehículo" y `#tab-kilometros-conflictos` "Conflictos"), logs · **Datos** → datos (con pestañas `#tab-datos-importar`/`#tab-datos-exportar`/`#tab-datos-comparar`) · **Sistema** → ajustes (fusiona lo que antes era backup: sync, copia de seguridad, actualizaciones, preferencias de rango km). Las páginas antiguas `page-timeline`+`page-solapamientos` se fusionaron en `page-kilometros`; `page-importar`+`page-csv-tools` en `page-datos`; `page-backup` en `page-ajustes`. Cada vista es `<div id="page-XXX" class="page">`; `.page` tiene `max-width:1180px` centrado.

**⚠ Acoplamiento con renderer.js:** el contenido dinámico se pinta desde renderer.js con clases Y AHORA TAMBIÉN SVGs en strings (alertas del dashboard, botones de tablas Editar/Borrar/Prácticas/Anotaciones, `LOG_ICONS` del historial, celda ⚡→SVG de solapamientos, botón de nota `.rr-nota-btn`). Si se renombra una clase o se cambia la iconografía, grep en renderer.js.

## Web móvil — web-remote/index.html (~1110 líneas, CSS inline)

**Identidad (desde 2026-07-18): panel SaaS claro, mismo lenguaje que el escritorio, adaptado a táctil** — ya no es dark glassmorphism. Fondo `#f6f7f9`, tarjetas blancas con sombra suave, sin orbes/glow/grid-bg (se eliminaron del CSS y del HTML). Fuente `Inter` (mismo `@import` que escritorio). Comparte marca: `.logo-mark` (52px, degradado índigo #4f46e5→#7c3aed con SVG velocímetro) + `h1` (ahora color sólido `--text`, sin degradado de texto) + `.version` (chip píldora estilo `.tag-b` del escritorio).

**Variables (`:root`):** calcadas del escritorio — `--primary:#4f46e5` `--primary-dark:#4338ca` `--primary-light:#eef2ff` · `--success:#10b981` `--success-light:#d1fae5` `--danger:#ef4444` `--danger-light:#fee2e2` `--warn:#f59e0b` `--warn-light:#fef3c7` · `--text:#101828` `--text-muted:#667085` · `--border:#e3e6ee` · `--bg:#f6f7f9` `--card:#ffffff` · `--radius:16px` (algo mayor que escritorio por targets táctiles) · `--shadow`/`--shadow-md` iguales de suaves que escritorio.

**El `<style>` está seccionado igual que escritorio:** `TOKENS`, `HEADER / MARCA`, `CARDS`, `FORMS`, `BUTTONS`, `BADGES`, resto de bloques con comentario simple (Tabs, Login screen, Historial, Logout button, Tarjeta de perfil, Indicador de perfil activo).

**Componentes:** `.tabs` control segmentado (fondo `#eef0f4`, `.tab.active` = píldora `--primary` sólido, sin degradado) · `.card` plana blanca con `--shadow` (sin blur/backdrop-filter) · `.btn-primary` color sólido `--primary` (sin degradado ni brillo barrido), `.btn-secondary` outline blanco, `.btn-danger` variante clara roja tipo badge · `.result(.ok/.err)` fondos `--success-light`/`--danger-light` con icono y título en verde/rojo oscuro (contraste sobre claro) · `.tag` estilo `.tag-b` del escritorio (`#e0e7ff`/`#4338ca`) · `.historial-item`/`.profile-card` tarjetas blancas con `--shadow` · `.perfil-activo`/`.logout-btn` píldoras blancas flotantes con `--shadow` (ya no backdrop-blur). Sparkles de éxito (`createSparkles()` en el JS) recoloreadas a paleta de marca (`#4f46e5,#7c3aed,#059669,#f59e0b`) para verse sobre fondo claro.

**Pantallas:** `#login-screen` (email+contraseña, Auth nativo Supabase) → `#profile-screen` (¿Quién eres? — tarjetas de profesor) → `#main-app` con secciones practica/alumno/historial/detalle-alumno vía `switchTab`/`verPracticasAlumno`. El JS vive en el propio archivo (ancla `const SUPABASE_URL`); el HTML dinámico del historial y de la lista de perfiles se genera ahí.

## Nota común

Marca compartida: mismo índigo `#4f46e5` en ambas interfaces (desde el rediseño de 2026-07-18 la web ya no usa un tono más claro `#6366f1` — al ser ahora fondo claro no hace falta) y el mismo logo de velocímetro en cuadrado degradado índigo→violeta. Si el usuario quiere cambiar "el color de la app", tocarlo en las dos. Favicon de la web: SVG data-URI con ese mismo logo.
