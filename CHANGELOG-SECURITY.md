# Seguridad de AulaMovil

## Auditoría de octubre de 2026 (v1.31.0)

Revisión completa de la app de escritorio, la web del móvil, la base de datos en la nube y el repositorio.

### Corregido

| Hallazgo | Riesgo | Solución |
|---|---|---|
| Un jefe de cualquier autoescuela podía meter como «empleado» la cuenta de otra recién registrada solo con su email (`buscar_uid_por_email` + inserción directa en `perfiles`) y dejarla fuera de sus datos | Alto (secuestro de cuenta entre clientes) | Migración `2026-10-07_seguridad.sql`: sin inserción directa en `perfiles`, sin búsqueda de usuarios por email y el dueño de un perfil no se puede cambiar (trigger). La app ya no ofrece invitar por email |
| Funciones internas de la base de datos ejecutables sin sesión (`anon`) | Medio (enumeración) | Revocadas; «¿es alumno este correo?» solo con el secreto del servidor (`alumno_email_existe_srv`) |
| Portal del alumno identificado solo por el email del token | Bajo (exige email confirmado, ya activo) | Defensa extra: comprueba en `auth.users` que el email está confirmado |
| Electron 33 sin soporte (parches de Chromium) | Alto | Electron 44.6.0 |
| Ventana sin sandbox, sin bloqueo de navegación ni de ventanas nuevas, sin política de contenido, permisos del navegador abiertos | Medio | `sandbox`, `will-navigate`/`setWindowOpenHandler` (https al navegador del sistema), CSP en `index.html`, permisos denegados salvo portapapeles |
| Documentos adjuntos ejecutables (.exe, .bat, .lnk…) se podían abrir desde la ficha | Medio | Bloqueados al adjuntar y al abrir |
| `date-utils.js` no iba en el instalador (fallaban las flechas de día de Registro rápido) | Fallo funcional | Añadido a `build.files` + test que comprueba todos los `<script>` |
| Web sin cabeceras de seguridad | Medio | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP; `/api` con `Cache-Control: no-store` |
| Librería de login cargada desde un CDN externo sin versión fija (`@supabase/supabase-js@2`) en las páginas de contraseña, confirmación y portal | Medio (cadena de suministro) | Servida desde la propia web, versión fija (`/vendor/supabase-2.110.3.js`) |
| Funciones de la web ejecutándose en Washington (EE. UU.) | Cumplimiento RGPD y latencia | `regions: ["dub1"]` (Dublín, junto a la base de datos de Irlanda) |
| Copia offline de alumnos se quedaba en el teléfono al cerrar sesión o al entrar otra cuenta | Medio (dispositivo compartido o perdido) | Se borra al cerrar sesión y al cambiar de cuenta (la cola de envíos se conserva) |
| Sesiones sin caducidad y sin forma de cerrarlas en todos los dispositivos | Medio | Ajustes → Seguridad: «Cerrar la sesión en los demás dispositivos» (`signOut({ scope: 'others' })`) |
| PC de la oficina abierto | Medio | Bloqueo opcional con PIN (huella scrypt, espera creciente tras 5 fallos, bloqueo por inactividad, desbloqueo con la contraseña de la cuenta) |
| Contraseña mínima de 6 caracteres | Bajo | 10 en la app y en Supabase Auth |
| Archivo con nombres reales de alumnos (`registro_kilometraje_alumnos.csv`) en el repositorio público desde la v1.0.0 | Medio (datos personales públicos) | Quitado del árbol y en `.gitignore`. **Sigue en el historial**: ver `LEGAL.md` § 3.9 |

### Comprobado y correcto

- RLS activo en todas las tablas, aislamiento por `empresa_id` en la base de datos; un empleado no puede cambiarse el rol ni la empresa (trigger existente).
- Sin secretos en el repositorio ni en su historial (la clave pública `anon` es pública por diseño; el token de gestión está en `.mcp.json`, ignorado).
- Confirmación de email obligatoria, rotación de tokens de refresco, datos en `eu-west-1`.
- Todo dato pintado en las interfaces pasa por `esc()`; IPC con rutas validadas; credenciales del PC cifradas con DPAPI (`safeStorage`).
- Dependencias: licencias permisivas; ninguna GPL.

### Pendiente (del propietario)

- Supabase Pro: protección de contraseñas filtradas (HaveIBeenPwned), caducidad de sesiones por inactividad, copias diarias.
- Vercel Pro (necesario además para uso comercial).
- Firma de código del instalador (Authenticode): hoy la actualización se verifica por hash del propio GitHub.
- Extensión `pg_net` en el esquema `public` (aviso del linter de Supabase; moverla exige recrear la tarea de avisos).
- Repositorio público: decidir si pasa a privado con un repositorio aparte para las actualizaciones.

---

# CHANGELOG — Auditoría y mejoras de seguridad (Julio 2026)

## Resumen ejecutivo

Se realizó una auditoría completa del proyecto y se implementaron mejoras de seguridad, robustez y funcionalidad.

---

## Mejoras implementadas

### 1. Autenticación web-remote
**Problema:** Las APIs estaban completamente abiertas, cualquiera podía registrar prácticas.

**Solución:**
- Sistema de PIN de 4 dígitos
- Token con expiración de 24 horas
- Validación en todos los endpoints

**Archivos:** `web-remote/api/auth.js`, `web-remote/api/_utils.js`

---

### 2. Validación de entrada
**Problema:** Los datos del usuario se usaban directamente sin validar.

**Solución:**
- Validadores centralizados en `_utils.js`
- Comprobación de tipos, rangos y formatos
- Mensajes de error específicos

**Validadores disponibles:**
```js
validators.positiveInt(val, name)  // IDs
validators.fecha(val)              // YYYY-MM-DD
validators.nombre(val)             // 2-100 chars, sin XSS
```

---

### 3. CORS restringido
**Problema:** CORS con `*` permitía peticiones desde cualquier origen.

**Solución:**
- Lista blanca de dominios permitidos
- Solo acepta: `kmalumnos-remote.vercel.app`, `localhost:3000`

**Archivo:** `web-remote/api/_utils.js`

---

### 4. Guardado atómico (db.js)
**Problema:** Si el proceso moría durante `writeFileSync`, el archivo quedaba corrupto.

**Solución:**
- Escribe primero a archivo `.tmp`
- Renombra atómicamente al archivo final
- Try/catch con registro de errores

**Código:**
```js
fs.writeFileSync(path + '.tmp', data);
fs.renameSync(path + '.tmp', path);  // Atómico
```

---

### 5. Comparación de timestamps en sync
**Problema:** El sync siempre sobrescribía datos locales con remotos.

**Solución:**
- Compara `updated_at` antes de sobrescribir
- Si local > remoto, mantiene local
- Evita perder ediciones hechas offline

---

### 6. Historial y cancelación
**Problema:** No había forma de ver/cancelar prácticas registradas desde móvil.

**Solución:**
- Nueva pestaña "Historial" en web-remote
- Muestra prácticas de últimas 24h
- Botón para cancelar (soft delete)

**Endpoints:** `/api/historial`, `/api/cancelar-practica`

---

### 7. IDs auto-incrementales en Supabase
**Problema:** Los IDs se generaban localmente, podían colisionar.

**Solución:**
- Secuencias SERIAL en PostgreSQL
- Al crear desde web, Supabase asigna ID
- El sync descarga el ID asignado

**Migración aplicada:**
```sql
CREATE SEQUENCE practicas_id_seq;
ALTER TABLE practicas ALTER COLUMN id SET DEFAULT nextval('practicas_id_seq');
```

---

### 8. Campo source
**Problema:** No se podía distinguir qué prácticas venían del móvil.

**Solución:**
- Nueva columna `source` en tabla `practicas`
- Valores: `'desktop'`, `'web-remote'`
- Solo se pueden cancelar prácticas con `source='web-remote'`

---

### 9. Escape XSS en frontend
**Problema:** Nombres de alumnos/vehículos se renderizaban sin escapar.

**Solución:**
```js
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
```

---

## Configuración actual

### Vercel (web-remote)
```
SUPABASE_URL     = https://dmwoqugdnwgkcqtixhyw.supabase.co
SUPABASE_ANON_KEY = [REDACTED]
API_PIN          = (sistema de PIN retirado; ya no se usa)
```

### URLs
- **Web-remote:** https://kmalumnos-remote.vercel.app
- **Supabase:** https://supabase.com/dashboard/project/dmwoqugdnwgkcqtixhyw
- **GitHub:** https://github.com/danixp3/kmalumnos

---

## Archivos nuevos/modificados

### Nuevos
- `web-remote/api/_utils.js` — Utilidades compartidas
- `web-remote/api/auth.js` — Autenticación PIN
- `web-remote/api/historial.js` — Ver prácticas recientes
- `web-remote/api/cancelar-practica.js` — Cancelar prácticas

### Modificados
- `db.js` — save() atómico con try/catch
- `sync.js` — Comparación de timestamps
- `web-remote/index.html` — Login + historial + XSS escape
- `web-remote/api/*.js` — Auth + validación + CORS

---

## Pendiente (no crítico)

1. **Rate limiting**: Limitar intentos de PIN para evitar fuerza bruta
2. **Logs de acceso**: Registrar quién accede a web-remote
3. **HTTPS pinning**: Verificar certificado SSL de Supabase
4. **Tests automatizados**: Añadir tests de los endpoints

---

## Cómo usar web-remote

1. Ir a https://kmalumnos-remote.vercel.app
2. (El PIN se retiró: ahora se entra con la cuenta de la autoescuela)
3. Seleccionar alumno y vehículo
4. Clic en "Registrar práctica"
5. Los km se dejan en 0 (se rellenan después en la app de escritorio)
6. Para cancelar: ir a "Historial" y clic en el botón cancelar

---

## Cómo cambiar el PIN

```bash
cd web-remote
echo "NUEVO_PIN" | vercel env rm API_PIN production --yes
echo "NUEVO_PIN" | vercel env add API_PIN production
vercel --prod --yes
```

O desde el dashboard de Vercel: Project Settings → Environment Variables
