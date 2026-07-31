---
name: cambiar-app
description: Guía de desarrollo de la app de escritorio de KMAlumnos (Electron) — mapa del código con anclas greppables, receta del cambio de punta a punta (db/<modulo>.js → IPC → preload → renderer/<modulo>.js) y validación con tests. Usar SIEMPRE que haya que tocar renderer/, main.js, db/, sync.js o preload.js, o cuando el usuario pida una funcionalidad o arreglo de la app de escritorio ("añade a la app...", "que la app haga...", "arregla el botón/la pantalla de..."). Si el cambio es de la web del móvil → /cambiar-web; si es puramente de aspecto/diseño → /mejorar-ui.
---

# Cambiar la app de escritorio

Objetivo: implementar cambios sin cargar archivos enteros (leer solo el módulo de `renderer/`/`db/` que toca, no releer el conjunto) y sin olvidar los pasos que ya costaron bugs en producción.

## Flujo

1. **Leer `references/mapa-app.md`** — organización de `renderer/` (18 módulos) y `db/` (10 módulos) con anclas, tabla de qué módulo contiene qué, la receta del cambio completo y la de los tests. Sustituye a explorar el código para orientarse.

2. **Localizar con Grep sobre las anclas y Read parcial** del módulo afectado. Nunca leer `db.js` (índice) esperando la lógica, ni releer todo `renderer/`; si la exploración se complica, sub-agente `explorador` y quedarse con el resumen.

3. **Seguir la receta de punta a punta**: una operación nueva de UI toca 4 capas en este orden — función en `db/<modulo>.js` (con su marca de sync y su log) → handler IPC en `main.js` → exposición en `preload.js` → llamada y pintado en `renderer/<modulo>.js` (si es un módulo nuevo, su `<script>` va antes de `arranque.js` en `index.html`, que debe cargar siempre el último). La checklist de invariantes está en el mapa; la que más releases ha costado: **toda mutación de datos marca sync (`markDirty`/`markDeleted`), también las masivas e indirectas**.

4. **Tests**: toda tarea de código añade o ajusta el test de su criterio de aceptación (recetas de test de db y de sync en el mapa). Validar con `npm test` — no cerrar en rojo.

5. **Probar en vivo** con `npm start` cuando el cambio tenga parte visible: el usuario la mira con sus datos reales.

6. **Cerrar con /cerrar-tarea**. Los cambios de escritorio viajan en la próxima release (/publicar-release cuando el usuario quiera publicar). Si el cambio afecta al esquema de la nube o a la web, coordinarlo: Supabase por migración compatible y la web con /cambiar-web.
