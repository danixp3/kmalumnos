---
name: publicar-release
description: Publica una nueva versión de KMAlumnos de principio a fin (versión, tests, instalador, commit, release en GitHub con auto-update verificado). Usar SIEMPRE que el usuario diga "publica", "nueva versión", "release", "actualiza la app", "saca la 1.X.X" o similar, aunque no use la palabra release. Evita el fallo histórico de assets mal nombrados que rompía el auto-update.
---

# Publicar una release de KMAlumnos

Proceso completo y verificado. El paso 5 lo hace todo el script empaquetado — no reescribir esa lógica a mano.

## Contexto imprescindible

- El auto-update (`electron-updater`) descarga `latest.yml` de la última release y luego el instalador **con el nombre exacto que dice latest.yml** (con guiones: `KMAlumnos-Setup-X.Y.Z.exe`). Subir el instalador con espacios (GitHub los convierte en puntos) rompe el auto-update de TODOS los PCs (pasó en la v1.3.9). El script sube los assets ya renombrados.
- El `gh` CLI de esta máquina da 401. El script usa el token del MCP de GitHub que está en `.mcp.json` (git-ignored). No imprimir nunca ese token.
- Publicar una release es un cambio de producción: **pedir confirmación explícita al usuario antes del paso 4** (metodología del proyecto).

## Pasos

1. **Versión**: subir `"version"` en `package.json` (semántico: fix → patch, funcionalidad → minor).
2. **Tests**: `npm test` — no seguir si algo falla.
3. **Instalador**: `npm run dist` (tarda ~2 min; lanzarlo en background y seguir con el paso 4 mientras).
4. **Commit + push** (con confirmación del usuario para publicar):
   ```
   git add -A && git commit -m "v1.X.X - descripción breve en español" && git push
   ```
5. **Release + verificación** (cuando termine el build):
   ```
   python .claude/skills/publicar-release/scripts/publicar_release.py --notas "Descripción breve para la página de la release"
   ```
   El script: comprueba que `dist/` tiene los 3 artefactos de la versión de `package.json` y que la release no existe ya; la crea; sube instalador + blockmap + latest.yml con nombres con guiones; verifica que `latest.yml` publicado resuelve a la versión nueva y que el instalador descarga con HTTP 200. Termina con `RELEASE-OK` o un error claro.
   - `--dry-run` para ver qué haría sin tocar GitHub.
6. **Cerrar**: actualizar "Estado actual" de CLAUDE.md (máx 3 líneas) y decirle al usuario que reinicie la app en los PCs para actualizarse.

## Si algo sale mal

- `la release vX.Y.Z ya existe`: o la versión de package.json no se subió, o hay que borrar la release fallida en GitHub antes de repetir.
- Assets mal subidos en una release ya publicada: se pueden renombrar por API (`PATCH /repos/danixp3/kmalumnos/releases/assets/{id}` con `{"name": ...}`) sin resubir nada.
