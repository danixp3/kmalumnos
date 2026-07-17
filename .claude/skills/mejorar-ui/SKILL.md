---
name: mejorar-ui
description: Rediseño e iteración de la interfaz de KMAlumnos — la app de escritorio, la web del móvil o ambas, en cambios parciales (un color, una pantalla) o totales (tema completo). Usar SIEMPRE que el usuario hable de diseño, aspecto, estética, colores, fuentes, "que se vea mejor/más moderno/más bonito", rediseñar una pantalla o cambiar la UI, y mantenerla activa durante todas las rondas de retoques hasta que el diseño quede aprobado. Si el cambio de la web es funcional (no de aspecto), usar /cambiar-web.
---

# Mejorar la interfaz

Diseñar es iterar: habrá varias rondas de "un poco más grande / otro tono / así no". El objetivo de esta skill es que cada ronda cueste céntimos, no releer archivos de 700-1500 líneas.

## Preparación (una vez por sesión de diseño)

1. **Leer `references/estilo-ui.md`** — variables, componentes, secciones con anclas y la identidad visual de cada interfaz. No leer los index.html enteros jamás: localizar con Grep sobre las anclas y leer solo ese bloque.
2. **Acotar con el usuario** si no está claro: ¿escritorio, web del móvil o ambas? ¿retoque o rediseño completo? Enseñarle en una frase la identidad actual de cada una (escritorio = panel SaaS claro; móvil = oscura glassmorphism) por si quiere conservarla o romperla.

## Reglas de edición (aquí está el ahorro)

- **Cambios globales primero por variables**: tema, paleta, radios y sombras viven en `:root`. Cambiar `--primary` son 2 ediciones de una línea (una por interfaz), no cientos. Colores nuevos → crear variable, nunca hardcodear.
- **Ediciones quirúrgicas por sección**: el CSS de escritorio está seccionado con comentarios `/* ── NOMBRE ─── */` greppables. Un rediseño total se hace sección a sección (LAYOUT → SIDEBAR → CARDS → ...), no reescribiendo el archivo, que además mezclaría diseño con lógica y dificultaría revisar.
- **Clases renombradas o rediseñadas** → grep de esa clase en `renderer.js` (escritorio) o en el `<script>` de la propia web: el contenido dinámico se pinta desde JS con las clases en strings.
- **Rondas en lote**: recoger TODOS los comentarios del usuario de una ronda y aplicarlos en una sola pasada de ediciones, en vez de un ciclo completo por retoque.

## Ver el resultado

- **Web del móvil**: abrir `web-remote/index.html` en el panel de navegador como archivo local (login y estilos se ven sin desplegar; los datos no cargan y da igual para diseño). Vista móvil: redimensionar a preset mobile. **No desplegar hasta que el usuario apruebe** — entonces /desplegar-web.
- **Escritorio**: `npm start` y que el usuario la mire en vivo (es su app, con sus datos). Para comprobaciones rápidas de layout sin arrancar Electron vale también el archivo en el navegador (las tablas saldrán vacías).

## Cierre

Diseño aprobado → web: /desplegar-web + smoke test; escritorio: los cambios viajan en la próxima release (/publicar-release cuando toque). Siempre /cerrar-tarea. Si el rediseño cambió variables, clases o secciones, actualizar `references/estilo-ui.md` en el mismo cierre — es el plano de la próxima sesión de diseño.
