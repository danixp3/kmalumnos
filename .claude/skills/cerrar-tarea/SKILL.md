---
name: cerrar-tarea
description: Cierre estándar de una tarea de KMAlumnos — valida con tests, actualiza "Estado actual" de CLAUDE.md, archiva en HISTORIAL.md y hace commit+push. Usar SIEMPRE al dar por terminada cualquier tarea o cambio aceptado ("listo", "perfecto", "dalo por cerrado", "funciona"), y también cuando el propio agente termina un trabajo y toca actualizar la documentación del proyecto. No usar si el cierre es una release: /publicar-release ya incluye estos pasos.
---

# Cerrar una tarea

La metodología del proyecto exige el mismo ritual al final de cada tarea. Hacerlo siempre igual mantiene CLAUDE.md barato de leer en todas las sesiones futuras: el estado vivo cabe en pantalla y el detalle histórico vive aparte.

Condición previa: el criterio de aceptación de la tarea está verificado. Si no lo está, la tarea no se cierra — se sigue iterando.

## Pasos

1. **Tests** — `npm test`. Obligatorio si la tarea tocó código (aunque parezca que no afecta); si solo tocó documentación o skills, se puede omitir. No cerrar con tests en rojo.

2. **CLAUDE.md → "Estado actual"** — máximo 3 líneas por cambio:
   - Actualizar la fecha de `_Última actualización:`.
   - Añadir o reescribir la línea que refleja el nuevo estado; **eliminar** las líneas que este cambio deja obsoletas (la sección es el estado vivo, no un registro).
   - Si la tarea resolvió un pendiente listado (p. ej. una nota o un CRÍTICO), quitarlo o actualizarlo.

3. **HISTORIAL.md** — añadir al final una entrada con el estilo de las existentes:
   ```
   - **YYYY-MM-DD (ID · título corto):** qué se hizo y por qué. Si fue un bug: síntoma → causa → arreglo. Tests añadidos (total N en verde).
   ```
   Aquí va el detalle que se quitó de CLAUDE.md; una entrada por tarea, no por archivo tocado.

4. **Commit + push** — mensaje breve en español describiendo el resultado (convención del repo: `v1.X.X - ...` solo cuando el commit sube la versión; para lo demás, descripción directa o prefijo tipo `docs:`).
   ```
   git add -A && git commit -m "descripción breve" && git push
   ```
   Si la tarea va a publicarse como release inmediatamente, saltar este paso e ir a **/publicar-release** (su commit ya lo incluye).

5. **Informe al usuario** — 2-3 frases: qué quedó hecho, cómo se validó, y si queda algo pendiente relacionado. Sin detalles de código salvo que los pida.
