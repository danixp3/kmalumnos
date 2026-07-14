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
API_PIN          = 2004
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
2. Introducir PIN: **2004**
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
