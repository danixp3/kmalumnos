# Seguridad de AulaMovil

## Auditoría de la web del móvil del 19-20 de octubre de 2026 (con el navegador, en producción)

Pruebas en la web real con la sesión de la autoescuela y datos de prueba marcados («PRUEBA AUDITORIA», coche 0000TST; borrados al terminar con borrado suave): todas las pantallas, una clase completa que cruzó la medianoche (empezar, pausa, 2 clases, firma, corregir a 1 ½, enlace de firma firmado desde otra pestaña, anotar clase pasada con «Los pone la app», asignarse y pasarse el alumno) y ataques a la API (sin sesión, token falso, ids de otra autoescuela, datos absurdos, firmas falsas, JSON roto).

### Correcto
- Sin sesión o con token falso, todo `/api` da 401; los datos de otra autoescuela dan 404 (aislamiento por la base de datos, comprobado con ids reales de otra empresa).
- La API rechaza km imposibles, fechas futuras o de hace más de 30 días, cantidades de clase fuera de ¼–6, firmas que no son PNG o demasiado grandes, nombres de 5.000 caracteres y permisos inventados.
- Todo lo que se pinta pasa por `esc()` (probado con `<script>`, comillas y emojis en la observación) y la página de firma del alumno también.
- RLS activo en las 17 tablas; funciones con secreto solo para el servidor.

### Corregido
| Hallazgo | Riesgo | Solución |
|---|---|---|
| El código de las funciones del servidor (`/lib/movil/*.js`) se podía descargar | Bajo (sin secretos, pero enseña la lógica) | `vercel.json` redirige `/lib/*` a la portada |
| Un id gigante (`alumno_id=99999999999999999999`) devolvía un error interno con el mensaje de la base de datos; «12abc» o «1e3» se leían como 12 o 1 | Bajo | `validators.positiveInt` estricto (enteros ≤ 2.147.483.647) y errores 500 sin detalles internos |
| CORS admitía `http://localhost:3000/5173` en producción | Bajo | Solo la propia web |
| Los móviles de los profesores guardaban la lista de los ~3.200 alumnos, incluidos los terminados desde 1998 | Privacidad (minimización, art. 5.1.c RGPD) | `/api/alumnos?resumen=1` ya no manda los terminados sin actividad en 2 años: 242 alumnos, 8 KB en vez de 83 KB |

### Fallos de funcionamiento encontrados y corregidos
- Clase que cruza la medianoche: «Hoy» enseñaba la fecha nueva con las clases de ayer y la clase en marcha desaparecía; al guardarla como 2 clases se perdían las horas intermedias.
- Nº de registro: daba 19998 (por 8 alumnos de 1999 traídos de Ariauto con nº 1999x) en vez de ~4.906, en el móvil y en el escritorio. Las altas del móvil no guardaban la fecha de alta (libro de registro).
- Página de firma del alumno: con alguna clase sin hora, los km del día salían mal («1.031 → 1.031»); lo mismo podía pasar en la fila del día de la ficha DGT.
- En tablet u ordenador, el botón grande de abajo salía pegado a la izquierda; en el selector de coche salían primero las motos para un alumno de B; «Nuevo» en alumnos terminados.

### Datos personales en el repositorio público (resuelto el 20-10-2026)
El historial de GitHub (público) tenía `registro_kilometraje_alumnos.csv` (56 filas: nombre de alumno, coche, fecha y km, desde el 13-07-2026) y, dentro de pruebas y notas, el NIE y el teléfono de dos alumnos, los nombres de 6 alumnos y el de un profesor (tomados de datos reales al escribir las pruebas). Se reescribió todo el historial con `git filter-repo` (sin el CSV y con nombres inventados en lo demás; las 56 versiones publicadas y la actualización automática siguen intactas) y se forzó la subida de ramas y etiquetas. Copia del historial original en `Documentos\KMALUMNOS-copia-git-2026-10-20.git` (borrarla cuando ya no haga falta). **Norma:** las pruebas y la documentación solo con nombres, DNI y teléfonos inventados, nunca copiados de los datos reales.

### Pendiente (del propietario)
- Pedir al soporte de GitHub que borre las vistas en caché de los commits antiguos (siguen abriéndose si alguien conoce su código exacto, p. ej. `f50558f`) y anotar el incidente en el registro de incidentes (`LEGAL.md` § 5).
- Lo de la auditoría de octubre (Supabase Pro, Vercel Pro, firma de código, `pg_net`).

---

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
