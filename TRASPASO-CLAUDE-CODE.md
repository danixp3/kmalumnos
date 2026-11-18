# Nota para Claude Code al retomar KMAlumnos

El 18 de noviembre de 2026 se preparó Codex para trabajar en este mismo repositorio. Si retomas el proyecto desde Claude Code, empieza por `CLAUDE.md` y sigue usando tus guías, scripts y ajustes en `.claude/`. Esos archivos se han conservado tal como estaban.

## Qué usa cada asistente

| Claude Code | Codex |
| --- | --- |
| `CLAUDE.md` y `.claude/` | `AGENTS.md`, `.agents/skills/` y `.codex/` |
| Tus guías y scripts de diagnóstico, despliegue y publicación | Sus copias de las guías y scripts, con las rutas corregidas para Codex |

El código de la aplicación y de la web móvil es común. Para ponerte al día, consulta `HISTORIAL.md` y los commits recientes. Cada asistente actualiza su propio archivo de instrucciones. El historial sirve para dejar constancia de qué se hizo, qué se probó y qué quedó pendiente. En esta adaptación no hubo cambios en la app, en la web ni en datos de producción.

## Configuración de Codex

- Las guías de sincronización de Codex usan la conexión de Supabase y `execute_sql`. En la sesión de preparación, una consulta `SELECT 1` respondió correctamente. Se requiere autorización del propietario para modificar datos de producción.
- El control de sintaxis de Codex revisa los JavaScript de escritorio editados mediante `apply_patch`. Se puede revisar y activar desde **Configuración → Hooks** si Codex lo solicita. Las ediciones por terminal y los archivos de la web se verifican con las pruebas del proyecto.
- La configuración de Codex y sus scripts leen los nuevos tokens de `KMALUMNOS_CODEX_GITHUB_TOKEN`, `KMALUMNOS_CODEX_VERCEL_TOKEN` y `SUPABASE_ACCESS_TOKEN`, según el servicio. Si hacen falta, cargar los tokens en el entorno de usuario de Windows y reiniciar Codex para que los herede. Nunca pegarlos en un chat ni guardarlos en el repositorio.
- Los tokens que estaban escritos en `.codex/config.toml` se retiraron de ese archivo. Queda pendiente revocarlos en sus servicios y configurar sus sustitutos. Si Claude Code también usaba alguno, habrá que actualizar esa conexión al rotarlo. La configuración de Claude Code no se editó.
