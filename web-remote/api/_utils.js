// Utilidades compartidas para las APIs de web-remote
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

// Cliente de Supabase autenticado con el token de la SPA (passthrough).
// La SPA hace login con supabase-js en el navegador (signInWithPassword) y
// manda su access_token en cada petición vía "Authorization: Bearer <token>".
// Aquí construimos un cliente con la anon key + ese header reenviado, así
// PostgREST valida el JWT del lado de la BD: si es inválido o ha caducado,
// las consultas devuelven un error de autenticación que mapeamos a 401
// (ver isAuthError/handleSupabaseError).
export function getSupabase(token) {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    }
  );
}

// Cliente sin sesión de usuario (anon): solo para /api/avisos-enviar, que llama
// a funciones SECURITY DEFINER protegidas por un secreto compartido.
export function getSupabaseAnon() {
  return createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Quita los avisos del móvil que quedaban por enviar de esas prácticas (al
// cerrarlas o cancelarlas). Sin la tabla (migración sin aplicar) no hace nada.
export async function borrarAvisosPractica(supabase, empresaId, ids) {
  try {
    await supabase.from('avisos_push').delete().eq('empresa_id', empresaId).in('practica_id', ids).is('enviado_en', null);
  } catch { /* los avisos son un extra: nunca impiden cerrar la práctica */ }
}

// Extrae el empresa_id (uid del usuario de Supabase Auth) del JWT, leyendo
// el claim `sub` del payload. No se verifica la firma aquí: PostgREST ya
// rechaza tokens con firma inválida al ejecutar la consulta. Esto es solo
// para saber a qué empresa filtrar.
export function empresaIdFromToken(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return json.sub || null;
  } catch {
    return null;
  }
}

// Validar variables de entorno
export function checkEnvVars() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  return missing;
}

// CORS restringido a dominios conocidos
export function setCorsHeaders(req, res) {
  const allowedOrigins = [
    'https://aulamovil.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Reintenta una consulta a Supabase si falla por PGRST303 ("JWT issued at
// future"): error transitorio de reloj entre el nodo de Auth que emite el
// JWT y el nodo de PostgREST que lo valida. Repetir tras una pequeña espera
// basta para que el reloj se ponga al día.
export async function withRetry(queryFn, { retries = 1, delayMs = 400 } = {}) {
  let result = await queryFn();
  let attempt = 0;
  while (result.error && result.error.code === 'PGRST303' && attempt < retries) {
    await new Promise(r => setTimeout(r, delayMs));
    result = await queryFn();
    attempt++;
  }
  return result;
}

// ¿Es este error de Supabase un fallo de autenticación (JWT inválido,
// caducado o rechazado por PostgREST)?
export function isAuthError(error) {
  if (!error) return false;
  return error.code === 'PGRST301' || /jwt|JWSError/i.test(error.message || '');
}

// Middleware de autenticación: exige "Authorization: Bearer <token>" con
// forma de JWT y un claim `sub` legible. Devuelve { token, empresaId } o
// null (y ya ha respondido 401) si falta o es ilegible. OJO: esto NO
// verifica la firma del token; la verificación real la hace PostgREST al
// ejecutar la primera consulta (ver isAuthError/handleSupabaseError).
export function requireAuth(req, res) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión de nuevo.' });
    return null;
  }
  const token = header.slice(7);
  const empresaId = empresaIdFromToken(token);
  if (!empresaId) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión de nuevo.' });
    return null;
  }
  return { token, empresaId };
}

// Traduce un error de Supabase/PostgREST a la respuesta HTTP adecuada. Si es
// un error de autenticación, responde 401 (la SPA vuelve al login); si no,
// 500. Devuelve true si ya ha respondido (el caller debe hacer `return`
// inmediatamente después).
export function handleSupabaseError(error, res, fallbackMsg) {
  if (!error) return false;
  if (isAuthError(error)) {
    res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
    return true;
  }
  console.error(fallbackMsg, error);
  res.status(500).json({ error: fallbackMsg + ': ' + error.message });
  return true;
}

// Validadores de entrada
export const validators = {
  positiveInt(value, fieldName) {
    const num = parseInt(value);
    if (isNaN(num) || num < 1) {
      return { valid: false, error: `${fieldName} debe ser un número positivo` };
    }
    return { valid: true, value: num };
  },
  fecha(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Fecha requerida' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { valid: false, error: 'Formato de fecha inválido (usar YYYY-MM-DD)' };
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Fecha no válida' };
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date > tomorrow) {
      return { valid: false, error: 'No se permiten fechas futuras' };
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (date < thirtyDaysAgo) {
      return { valid: false, error: 'No se permiten fechas de hace más de 30 días' };
    }
    return { valid: true, value };
  },
  nonEmptyString(value, fieldName, maxLength = 100) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: `${fieldName} es requerido` };
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return { valid: false, error: `${fieldName} no puede estar vacío` };
    }
    if (trimmed.length > maxLength) {
      return { valid: false, error: `${fieldName} es demasiado largo (máx ${maxLength} caracteres)` };
    }
    return { valid: true, value: trimmed };
  },
  permiso(value) {
    const valid = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C', 'CE', 'D1', 'D', 'CAP', 'ADR'];
    if (!valid.includes(value)) {
      return { valid: false, error: `Permiso debe ser uno de: ${valid.join(', ')}` };
    }
    return { valid: true, value };
  }
};

// ─── Utilidades del flujo móvil de prácticas (iniciar → km final → firma) ────

// Columnas OPCIONALES de `practicas` (migración 2026-09-29_practica_movil.sql,
// puede no estar aplicada). Todo el código que las toca pasa por
// conFallbackColumnas: si el servidor no las tiene, reintenta sin ellas.
export const COLUMNAS_PRACTICA_BASE = 'id, alumno_id, vehiculo_id, fecha, km_inicial, km_final, tipo, nota, profesor_id, hora_inicio, source';
export const COLUMNAS_PRACTICA_MOVIL = 'firma, trabajado, tipo_detalle, hora_fin, zonas, fraccion';
export const CLAVES_PRACTICA_MOVIL = ['firma', 'trabajado', 'tipo_detalle', 'hora_fin', 'zonas', 'fraccion'];
// Para listas (hoy, calendario, ficha): `firmada` es una columna generada
// (firma IS NOT NULL, migración 2026-10-01) — dice si hay firma sin descargar
// la imagen de cada una.
export const COLUMNAS_PRACTICA_LISTA = 'trabajado, tipo_detalle, hora_fin, zonas, firmada, fraccion';

// Zonas recorridas: lista corta de textos (las configura el escritorio).
export function limpiarZonas(v) {
  if (!Array.isArray(v)) return [];
  const vistas = new Set();
  const out = [];
  for (const z of v) {
    if (typeof z !== 'string') continue;
    const t = z.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

// PostgREST devuelve como mucho 1.000 filas por consulta: pide páginas hasta
// el final. `construir` devuelve una consulta nueva en cada llamada.
export async function traerTodo(construir, tam = 1000) {
  const filas = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await construir().range(desde, desde + tam - 1);
    if (error) return { data: null, error };
    filas.push(...(data || []));
    if (!data || data.length < tam) return { data: filas, error: null };
  }
}

// Nombre completo del alumno (nombre + apellidos si los tiene).
export const nombreCompleto = a => a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : '';

// Clave para saber si dos nombres son la misma persona: sin tildes, mayúsculas
// ni partículas y en cualquier orden (igual que db/migracion.js del escritorio).
const PARTICULAS_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'e', 'da', 'das', 'do', 'dos', 'van', 'von', 'der', 'di', 'san', 'santa']);
export function claveNombre(...partes) {
  return String(partes.filter(Boolean).join(' ')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ').trim().split(' ').filter(w => w && !PARTICULAS_NOMBRE.has(w)).sort().join(' ');
}
// DNI / NIE sin espacios ni guiones, con los ceros que faltan y la letra
// calculada si no la lleva (como limpiarDni del escritorio). '' si no hay.
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
export function limpiarDni(v) {
  let t = String(v == null ? '' : v).toUpperCase().replace(/[\s.\-_/]/g, '');
  if (!t) return '';
  if (/^\d{6,8}$/.test(t)) { t = t.padStart(8, '0'); t += LETRAS_DNI[parseInt(t, 10) % 23]; }
  if (/^\d{6,7}[A-Z]$/.test(t)) t = t.padStart(9, '0');
  if (/^[XYZ]\d{6}[A-Z]$/.test(t)) t = t[0] + '0' + t.slice(1);
  return t.slice(0, 20);
}

// Siguiente nº de registro del alumno: la numeración correlativa que ya haya
// (el mayor + 1); la que lleva el año delante (2026082, 200801) solo si es la
// única. Sin ningún número todavía → null. Misma regla que el escritorio
// (db/campos-extra.js → siguienteNRegistro).
const RE_REGISTRO_ANIO = /^(199\d|20\d{2})\d{2,4}$/;
export function siguienteNRegistro(alumnos, anioActual = new Date().getFullYear()) {
  let maxCorrelativo = 0, maxAnio = 0;
  for (const a of alumnos || []) {
    if (!a || a.deleted) continue;
    const t = String(a.n_registro == null ? '' : a.n_registro).trim();
    if (!/^\d{1,9}$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (RE_REGISTRO_ANIO.test(t)) { if (n > maxAnio) maxAnio = n; } else if (n > maxCorrelativo) maxCorrelativo = n;
  }
  if (maxCorrelativo) return String(maxCorrelativo + 1);
  if (!maxAnio) return null;
  const s = String(maxAnio), anio = s.slice(0, 4), cifras = s.length - 4;
  if (Number(anio) === anioActual) return String(maxAnio + 1);
  return String(anioActual) + '1'.padStart(cifras, '0');
}

// ¿El error de Supabase/PostgREST es "esa columna no existe"?
export function esErrorColumnaInexistente(error) {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(error.message || '');
}

// Ejecuta `fn(conOpcionales)`; si falla porque faltan las columnas opcionales,
// la repite con conOpcionales=false. Devuelve { res, degradado }.
export async function conFallbackColumnas(fn) {
  let res = await fn(true);
  if (res && esErrorColumnaInexistente(res.error)) {
    return { res: await fn(false), degradado: true };
  }
  return { res, degradado: false };
}

export const hhmmValido = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// Km como entero razonable (el odómetro de un coche de autoescuela).
export function kmEntero(v, nombre) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 2000000) return { valid: false, error: `${nombre} no es válido` };
  return { valid: true, value: n };
}

// Inserta una práctica. Si choca la clave primaria (23505) es que la secuencia
// de la nube se quedó atrás (el escritorio sube ids propios): se realinea con el
// RPC reparar_secuencias y se reintenta una vez. Quita las columnas del flujo
// móvil si el servidor aún no las tiene. Devuelve { data, error, degradado }.
export async function insertarPractica(supabase, fila) {
  const intento = async (conOpcionales) => {
    const payload = { ...fila };
    if (!conOpcionales) for (const k of CLAVES_PRACTICA_MOVIL) delete payload[k];
    let r = await supabase.from('practicas').insert(payload).select('id').single();
    if (r.error && r.error.code === '23505') {
      await supabase.rpc('reparar_secuencias');
      r = await supabase.from('practicas').insert(payload).select('id').single();
    }
    return r;
  };
  const { res, degradado } = await conFallbackColumnas(intento);
  return { data: res.data, error: res.error, degradado };
}

// ─── Sesiones de varias clases (p. ej. 90 min = 2 clases de 45) ─────────────

// Duración de una clase (minutos): la fija el escritorio en Ajustes y viaja por
// ajustes_empresa (clave 'duracion_clase_min'). Fuera de rango → 45.
export function duracionClaseValida(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 10 && n <= 240 ? n : 45;
}

const aMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const aHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ─── Fracciones de clase (¼ ½ ¾) y clases por minutos ───────────────────────
export const MAX_CLASES = 6;

// Lo que vale una práctica en clases: 1, o su fracción (columna `fraccion`).
export const clasesDe = p => { const f = Number(p && p.fraccion); return f > 0 && f < 1 ? f : 1; };
// 2.5 → «2 ½»; 0.75 → «¾» (para los mensajes).
export function fmtClases(n) {
  const v = Math.round((Number(n) || 0) * 4) / 4;
  const ent = Math.floor(v), frac = ['', '¼', '½', '¾'][Math.round((v - ent) * 4)];
  return ent && frac ? `${ent} ${frac}` : frac || String(ent);
}

// Cantidad de clases de ¼ en ¼, entre ¼ y MAX_CLASES. Admite 1, 1.5, "0.75"...
export function cantidadClases(v) {
  const n = Number(v);
  const q = Math.round(n * 4);
  if (!Number.isFinite(n) || Math.abs(n * 4 - q) > 1e-6 || q < 1 || q > MAX_CLASES * 4) {
    return { valid: false, error: `Las clases van de ¼ en ¼, entre ¼ y ${MAX_CLASES}.` };
  }
  return { valid: true, value: q / 4 };
}

// Minutos de una sesión registrada por minutos (1–600).
export function minutosValidos(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 600) return { valid: false, error: 'Los minutos deben estar entre 1 y 600.' };
  return { valid: true, value: n };
}

// Clases por minutos: a los minutos de la sesión se suman los que el alumno
// tenía acumulados y se cuentan los cuartos de clase completos; lo que no
// llega a ¼ se queda acumulado para la próxima. 100 min con clases de 45 →
// 2 clases y sobran 10; la próxima de 50 → 60 min = 1 ¼ y sobran 3,75.
export function clasesPorMinutos(minutos, acumulados, duracion) {
  const cuarto = duracion / 4;
  const total = minutos + (acumulados > 0 ? acumulados : 0);
  const cuartos = Math.min(MAX_CLASES * 4, Math.floor(total / cuarto + 1e-9));
  return { cantidad: cuartos / 4, sobran: Math.round((total - cuartos * cuarto) * 100) / 100, total };
}

// Minutos que dura una clase (Ajustes del escritorio → ajustes_empresa).
export async function leerDuracionClase(supabase, empresaId) {
  const { data, error } = await supabase.from('ajustes_empresa').select('valor')
    .eq('empresa_id', empresaId).eq('clave', 'duracion_clase_min').maybeSingle();
  return duracionClaseValida(!error && data ? data.valor : 45);
}

// Minutos acumulados del alumno (alumnos.minutos_sobrantes, migración
// 2026-10-02). Sin la columna → { disponible: false } y se cuenta con 0.
export async function leerMinutosAlumno(supabase, empresaId, alumnoId) {
  const { data, error } = await supabase.from('alumnos').select('id, minutos_sobrantes')
    .eq('id', alumnoId).eq('empresa_id', empresaId).maybeSingle();
  if (error) return { disponible: false, minutos: 0 };
  return { disponible: true, minutos: Math.max(0, Number(data && data.minutos_sobrantes) || 0) };
}
export async function guardarMinutosAlumno(supabase, empresaId, alumnoId, minutos) {
  const { error } = await supabase.from('alumnos')
    .update({ minutos_sobrantes: minutos > 0 ? minutos : null, updated_at: new Date().toISOString() })
    .eq('id', alumnoId).eq('empresa_id', empresaId);
  return error || null;
}

// Reparte una sesión cerrada en clases consecutivas: `cantidad` = clases de ¼
// en ¼ (2 → dos clases; 1.5 → una entera y una de ½). Los km y el horario se
// reparten en proporción a lo que vale cada clase (con clases enteras, a
// partes iguales; el resto de km, de uno en uno a las primeras). Cada clase
// sale con al menos 1 km. Sin horas válidas, solo la primera lleva hora de
// inicio. Devuelve [{ km_inicial, km_final, hora_inicio, hora_fin, fraccion }]
// (fraccion null = clase entera).
export function partirEnClases(kmIni, kmFin, horaIni, horaFin, cantidad) {
  const c = Math.round(Number(cantidad) * 4) / 4;
  if (!(c >= 0.25)) return null;
  const pesos = Array(Math.floor(c)).fill(1);
  if (c % 1) pesos.push(c % 1);
  const n = pesos.length, total = kmFin - kmIni;
  if (total < n) return null;
  // Km: mayor resto, desempate por orden (con pesos iguales = reparto clásico)
  const ideal = pesos.map(w => (total * w) / c);
  const km = ideal.map(Math.floor);
  let resto = total - km.reduce((a, b) => a + b, 0);
  ideal.map((x, i) => [x - km[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => { if (resto > 0) { km[i]++; resto--; } });
  for (let i = 0; i < n; i++) {
    if (km[i] > 0) continue; // una fracción pequeña con pocos km: se le cede 1 km de la mayor
    const mayor = km.indexOf(Math.max(...km)); km[mayor]--; km[i]++;
  }
  const conHoras = hhmmValido(horaIni) && hhmmValido(horaFin) && aMin(horaFin) > aMin(horaIni);
  const m0 = conHoras ? aMin(horaIni) : 0, mT = conHoras ? aMin(horaFin) - m0 : 0;
  const partes = [];
  let k = kmIni, acum = 0;
  for (let i = 0; i < n; i++) {
    const desde = acum; acum += pesos[i];
    partes.push({
      km_inicial: k, km_final: k + km[i],
      hora_inicio: conHoras ? aHHMM(m0 + Math.round((mT * desde) / c)) : (i === 0 && hhmmValido(horaIni) ? horaIni : null),
      hora_fin: conHoras ? aHHMM(m0 + Math.round((mT * acum) / c)) : (i === n - 1 && hhmmValido(horaFin) ? horaFin : null),
      fraccion: pesos[i] < 1 ? pesos[i] : null
    });
    k += km[i];
  }
  return partes;
}

// ─── Km automáticos (cerrar la clase sin escribir el km final) ──────────────
// Rango de km por clase: Ajustes → «Clases y kilómetros» del escritorio, que
// viaja por ajustes_empresa (clave 'rango_km'). Sin configurar → 40–45, el
// mismo valor por defecto que el escritorio.
// Km automáticos del móvil: «entre min y max km por cada 2 clases» (lo que se
// recorre en una sesión normal de 90 min), configurable en el escritorio
// (Ajustes → Clases y kilómetros, clave 'km_auto_movil'); 40–50 si no hay.
// Antes se aplicaba a CADA clase el rango «por práctica» del escritorio
// (40–45) y una sesión de 2 clases salía con unos 85 km.
export const KM_AUTO_DEFECTO = { min: 40, max: 50 };
export function kmAutoValido(v) {
  const min = Math.round(Number(v && v.min)), max = Math.round(Number(v && v.max));
  return Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max >= min && max <= 999 ? { min, max } : { ...KM_AUTO_DEFECTO };
}
export async function leerKmAuto(supabase, empresaId) {
  const { data, error } = await supabase.from('ajustes_empresa').select('valor')
    .eq('empresa_id', empresaId).eq('clave', 'km_auto_movil').maybeSingle();
  return kmAutoValido(!error && data ? data.valor : null);
}
// Marca de las prácticas cuyo km final puso la app (tipo_detalle).
export const MARCA_KM_AUTO = 'km_auto';

// Km final que pone la app: cada clase recorre al azar la mitad del rango «por
// cada 2 clases» (40–50 → 20–25 km; una fracción, su parte) a partir del km
// inicial; 2 clases suman entre min y max. Nunca pasa de `tope` (el km en que
// empieza la siguiente práctica conocida del mismo coche): si no llega para el
// rango, se queda en el tope. null si ni así caben las clases (1 km cada una).
export function kmFinalAutomatico(kmIni, cantidad, rango2Clases, tope = null, azar = Math.random) {
  const c = Math.round(Number(cantidad) * 4) / 4;
  if (!(c >= 0.25)) return null;
  const { min, max } = kmAutoValido(rango2Clases);
  const pesos = Array(Math.floor(c)).fill(1);
  if (c % 1) pesos.push(c % 1);
  let total = Math.max(pesos.length, Math.round(pesos.reduce((s, w) => s + w * (min + azar() * (max - min)) / 2, 0)));
  if (tope != null && tope > 0) {
    if (tope - kmIni < pesos.length) return null;
    total = Math.min(total, tope - kmIni);
  }
  return kmIni + total;
}

// Km en que empieza la siguiente práctica conocida del coche (por encima de
// `kmIni`), o null si no hay ninguna. Las prácticas en blanco (0/0) no cuentan.
export async function topeKmSiguiente(supabase, empresaId, vehiculoId, kmIni, excluirId) {
  const { data, error } = await supabase.from('practicas').select('id, km_inicial')
    .eq('vehiculo_id', vehiculoId).eq('deleted', false).eq('empresa_id', empresaId)
    .gt('km_inicial', kmIni).neq('id', excluirId).order('km_inicial', { ascending: true }).limit(1);
  if (error) return { error };
  return { tope: data && data.length ? data[0].km_inicial : null };
}

// Km del coche alrededor de un momento (una clase que se anota días después o
// que se cierra tarde): la última clase con km que TERMINÓ antes (`anterior`,
// su km final = donde empieza la nueva) y la primera que EMPEZÓ después
// (`siguiente`, su km inicial = de donde no puede pasar). Antes = días
// anteriores y, ese mismo día, las de hora anterior; sin hora (la nueva o la
// otra), las de ese día cuentan como anteriores (la nueva va al final del día).
// Las clases en blanco (0/0) no cuentan. `excluir` = ids que no se miran (la
// propia clase). Devuelve { anterior, siguiente } con { id, km, fecha, hora,
// alumno } o null; { error } si falla la consulta.
export async function kmAlrededor(supabase, empresaId, vehiculoId, fecha, hora = null, excluir = []) {
  const h = hhmmValido(hora) ? hora : null;
  const fuera = new Set((excluir || []).map(Number));
  const esAntes = p => p.fecha < fecha || (p.fecha === fecha && (!h || !p.hora_inicio || p.hora_inicio < h));
  const cols = 'id, alumno_id, fecha, hora_inicio, km_inicial, km_final';
  const [rA, rS] = await Promise.all([
    supabase.from('practicas').select(cols)
      .eq('vehiculo_id', vehiculoId).eq('deleted', false).eq('empresa_id', empresaId)
      .lte('fecha', fecha).gt('km_final', 0)
      .order('fecha', { ascending: false }).order('km_final', { ascending: false }).limit(40),
    supabase.from('practicas').select(cols)
      .eq('vehiculo_id', vehiculoId).eq('deleted', false).eq('empresa_id', empresaId)
      .gte('fecha', fecha).gt('km_inicial', 0)
      .order('fecha', { ascending: true }).order('km_inicial', { ascending: true }).limit(40)
  ]);
  if (rA.error) return { error: rA.error };
  if (rS.error) return { error: rS.error };
  const ant = (rA.data || []).filter(p => !fuera.has(p.id) && esAntes(p))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.km_final - a.km_final)[0] || null;
  const sig = (rS.data || []).filter(p => !fuera.has(p.id) && !esAntes(p) && (!ant || p.km_inicial >= ant.km_final))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.km_inicial - b.km_inicial)[0] || null;
  const ids = [ant, sig].filter(Boolean).map(p => p.alumno_id).filter(v => v != null);
  let nombres = {};
  if (ids.length) {
    let { data, error } = await supabase.from('alumnos').select('id, nombre, primer_apellido, segundo_apellido').in('id', [...new Set(ids)]);
    if (error && esErrorColumnaInexistente(error)) ({ data } = await supabase.from('alumnos').select('id, nombre').in('id', [...new Set(ids)]));
    nombres = Object.fromEntries((data || []).map(a => [a.id, nombreCompleto(a)]));
  }
  const forma = (p, km) => p ? { id: p.id, km, fecha: p.fecha, hora: p.hora_inicio || null, alumno: nombres[p.alumno_id] || null } : null;
  return { anterior: forma(ant, ant && ant.km_final), siguiente: forma(sig, sig && sig.km_inicial) };
}

// Clases de la misma sesión que `p`: mismo alumno, coche y día, cerradas y con
// los km encadenados (la final de una = la inicial de la siguiente). Sirve para
// firmar de una vez todas las clases de una sesión partida. Devuelve la lista
// ordenada (incluye `p`); si falla la consulta, solo [p].
export async function sesionDePractica(supabase, empresaId, p, columnas = 'id, km_inicial, km_final, hora_inicio, hora_fin, firmada') {
  if (!p || !(p.km_final > 0)) return [p];
  const { data, error } = await supabase.from('practicas').select(columnas)
    .eq('alumno_id', p.alumno_id).eq('vehiculo_id', p.vehiculo_id).eq('fecha', p.fecha)
    .eq('deleted', false).eq('empresa_id', empresaId).gt('km_final', 0);
  if (error || !Array.isArray(data)) return [p];
  const porInicio = new Map(), porFin = new Map();
  for (const x of data) { if (!porInicio.has(x.km_inicial)) porInicio.set(x.km_inicial, x); if (!porFin.has(x.km_final)) porFin.set(x.km_final, x); }
  const yo = data.find(x => x.id === p.id) || p;
  const cadena = [yo];
  for (let x = porFin.get(yo.km_inicial); x && !cadena.includes(x) && cadena.length < 8; x = porFin.get(x.km_inicial)) cadena.unshift(x);
  for (let x = porInicio.get(yo.km_final); x && !cadena.includes(x) && cadena.length < 8; x = porInicio.get(x.km_final)) cadena.push(x);
  return cadena;
}

// Km de una práctica (0 si está en blanco o sin cerrar).
export const kmDePractica = p => (p && p.km_final > 0 && p.km_inicial >= 0) ? Math.max(0, p.km_final - p.km_inicial) : 0;

// ─── Cobros de alta (Ajustes → Cobros del escritorio) ───────────────────────
// Al crear un alumno desde el móvil se le cargan los conceptos marcados «al
// dar de alta» (matrícula, tasa, soporte...), igual que en el escritorio. La
// lista viaja por ajustes_empresa (clave 'conceptos_cobro'). Los ids de
// `cargos` los pone el cliente (no hay secuencia en la nube): la web usa un
// número al azar en [1.500.000.000, 2.100.000.000), rango que el escritorio
// nunca usa (sus ids van por debajo de 1e9 y el sync no avanza su contador
// con ids >= 1e9); si choca (23505) se prueba otro. Sin la tabla, sin
// conceptos o sin permiso (RLS de jefe) no se carga nada y el alta sigue.
export async function cargarCobrosAlta(supabase, empresaId, alumnoId, fecha) {
  const { data: aj, error: errAj } = await supabase.from('ajustes_empresa').select('valor')
    .eq('empresa_id', empresaId).eq('clave', 'conceptos_cobro').maybeSingle();
  if (errAj || !aj || !Array.isArray(aj.valor)) return { cargados: [] };
  const conceptos = aj.valor
    .filter(c => c && c.alta !== false && Number(c.importe) > 0 && String(c.nombre || '').trim())
    .slice(0, 30);
  const cargados = [];
  for (const c of conceptos) {
    const fila = {
      alumno_id: alumnoId, concepto: String(c.nombre).trim().slice(0, 60),
      tipo: ['matricula', 'tasa'].includes(c.tipo) ? c.tipo : 'cargo',
      importe: Math.round(Number(c.importe) * 100) / 100, fecha, nota: 'Alta del alumno',
      empresa_id: empresaId, deleted: false, updated_at: new Date().toISOString()
    };
    let error = null;
    for (let intento = 0; intento < 3; intento++) {
      fila.id = 1500000000 + Math.floor(Math.random() * 600000000);
      ({ error } = await supabase.from('cargos').insert(fila));
      if (!error || error.code !== '23505') break;
    }
    if (error) return { cargados, error: error.message || 'No se pudieron anotar los cobros de alta' };
    cargados.push({ concepto: fila.concepto, importe: fila.importe });
  }
  return { cargados };
}

// ─── Enlace para que el alumno firme sus clases (2026-10-09) ────────────────
// El enlace lleva un código al azar (144 bits); en la base de datos solo se
// guarda su huella sha256 (migración 2026-10-09_enlaces_firma.sql), así que
// quien lea la tabla no puede usar los enlaces. La página del alumno es
// /f/<código> (vercel.json la sirve con firmar.html).
export const URL_WEB = 'https://aulamovil.vercel.app';
export const nuevoTokenFirma = () => randomBytes(18).toString('base64url');
export const huellaToken = t => createHash('sha256').update(String(t)).digest('hex');
export const tokenFirmaValido = t => typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);
export const urlFirma = t => `${URL_WEB}/f/${t}`;
// La función o la tabla todavía no existen en la nube (migración sin aplicar)
export const faltaFuncion = error => !!error && (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /could not find the function|does not exist/i.test(error.message || ''));
