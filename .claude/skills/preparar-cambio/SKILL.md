---
name: preparar-cambio
description: Arranque estándar de cualquier tarea de código en KMAlumnos — carga el mapa condensado de la arquitectura (qué archivo hace qué, invariantes, trampas conocidas) para planificar sin releer CONTEXT.md ni archivos enteros. Usar SIEMPRE que el usuario pida una funcionalidad nueva, un arreglo, un cambio de comportamiento o cualquier modificación de la app o de la web del móvil ("añade...", "arregla...", "quiero que la app...", "cambia..."), antes de abrir ningún archivo de código.
---

# Preparar un cambio

Objetivo: situarse en la arquitectura con el mínimo de tokens y no repetir los errores que ya costaron releases (ver trampas en el mapa). El flujo es: mapa → plan → confirmación → código.

## Pasos

1. **Leer `references/mapa.md`** (siempre — sustituye a releer CONTEXT.md y a explorar archivos para orientarse). Ahí está: el flujo UI→IPC→datos, las funciones clave por archivo, los endpoints de la web, los invariantes y las trampas históricas.

2. **Localizar el cambio en el mapa**: qué capas toca (renderer / IPC / db / sync / web-remote) y qué invariantes de la checklist aplican. Abrir después **solo** las funciones concretas a modificar (con Grep/Read parcial), no archivos enteros; si hay que explorar más de 2-3 archivos, delegar en un sub-agente Explore y quedarse con el resumen.

3. **Plan en tareas atómicas** con criterio de aceptación verificable cada una, presentado al usuario en términos de objetivos y resultados (metodología del proyecto). Si el cambio es arriesgado (datos, Supabase, release), explicar el riesgo y pedir confirmación explícita antes de ejecutar.

4. Al terminar la tarea → **/cerrar-tarea** (y si toca `web-remote/`, desplegar con **/desplegar-web**).
