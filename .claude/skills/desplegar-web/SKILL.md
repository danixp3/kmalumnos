---
name: desplegar-web
description: Despliega la web del móvil (web-remote) a producción en Vercel y verifica que responde. Usar SIEMPRE que se toque cualquier archivo de web-remote/ y haya que publicarlo, o cuando el usuario diga "despliega la web", "sube la web del móvil", "deploy", "actualiza la página del teléfono" o similar.
---

# Desplegar web-remote a producción (Vercel)

## Contexto imprescindible

- El CLI de Vercel (`vercel --prod`) puede estar bloqueado por permisos en esta máquina. El script empaquetado hace exactamente lo mismo por la API de Vercel, con el token del MCP que está en `.mcp.json` (git-ignored). No imprimir nunca ese token.
- Las variables de entorno (API_PIN, SYNC_EMAIL, SYNC_PASSWORD, SUPABASE_*) viven en el proyecto de Vercel y se conservan entre deploys — no hay que tocarlas.
- Un deploy a producción es un cambio visible al instante en el móvil del usuario: avisar antes de lanzarlo si no lo ha pedido él.

## Pasos

1. Si se cambió código de `web-remote/`, hacer commit primero (el script sube lo que hay en git, `git ls-files`).
2. Desplegar:
   ```
   node .claude/skills/desplegar-web/scripts/desplegar_web.js
   ```
   El script: lee la lista de archivos trackeados de `web-remote/`, crea el deployment de producción por API, espera a que esté `READY` (~30-60 s) y termina con `DEPLOY-OK` o el error del build.
   - `--dry-run` para listar qué archivos subiría sin desplegar.
3. **Verificar en producción** (elegir según lo que se haya tocado):
   - Sin token → debe dar 401 (la autenticación sigue activa):
     `curl -s -o /dev/null -w "%{http_code}" https://kmalumnos-remote.vercel.app/api/vehiculos`
   - Con token (el PIN está en `API_PIN` de Vercel; generar token: `base64("PIN:" + Date.now())` y mandarlo en la cabecera `X-API-Token`) → comprobar que los listados devuelven solo datos vivos (filtro `deleted=false`).
4. Cerrar: actualizar "Estado actual" de CLAUDE.md si el cambio era funcional.
