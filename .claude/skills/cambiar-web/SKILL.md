---
name: cambiar-web
description: Guía de desarrollo de la web móvil de KMAlumnos (web-remote) — mapa del código, receta de endpoints y prueba automática de la web publicada. Usar SIEMPRE que haya que tocar cualquier archivo de web-remote/ o el usuario pida cambios en "la página", "la web del móvil", "el teléfono", un endpoint o el formulario de registro ("añade X a la página", "que desde el móvil se pueda..."). Si el cambio es puramente de aspecto/diseño, usar /mejorar-ui; si es solo desplegar sin cambios, /desplegar-web.
---

# Cambiar la web móvil

Objetivo: hacer cambios en web-remote sin cargar archivos enteros (index.html tiene ~720 líneas) y sin redescubrir el patrón de la API cada vez.

## Flujo

1. **Leer `references/mapa-web.md`** — estructura de la SPA con anclas greppables, funciones JS, receta de endpoint e invariantes. Sustituye a explorar los archivos para orientarse.

2. **Localizar y editar con Grep + Read parcial** sobre las anclas del mapa; nunca leer index.html entero. Endpoints nuevos: seguir la plantilla del mapa (todos los existentes son así, `practica.js` de modelo).

3. **Repasar los invariantes web del mapa** (soft delete, `source`, UTC/24 h, `escapeHtml`, validadores). Vienen de bugs reales del proyecto.

4. **Desplegar con /desplegar-web** (la web no tiene entorno local montado: los cambios se validan en producción, el deploy tarda segundos y es reversible).

5. **Verificar con el smoke test**:
   ```
   python .claude/skills/cambiar-web/scripts/probar_web.py
   ```
   Prueba portada, login con PIN, rechazo de token inválido y los 3 endpoints de lectura; termina en `WEB-OK` o el fallo concreto. Si el cambio añadió un endpoint o campo visible, comprobar además eso específicamente (curl o Browser). El script no crea datos — para probar un POST nuevo, hacerlo a mano y borrar después (soft delete).

6. **Cerrar con /cerrar-tarea**. Si el cambio también toca la app de escritorio (p. ej. un campo nuevo que el sync debe recoger), eso es tarea aparte con /preparar-cambio: el sync y la web son mundos distintos que solo se ven a través de Supabase.
