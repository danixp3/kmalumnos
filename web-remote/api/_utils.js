// Utilidades compartidas para las APIs de web-remote
import { createClient } from '@supabase/supabase-js';

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
    const valid = ['A', 'A2', 'AM', 'B', 'C'];
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
export const COLUMNAS_PRACTICA_MOVIL = 'firma, trabajado, tipo_detalle, hora_fin, zonas';
export const CLAVES_PRACTICA_MOVIL = ['firma', 'trabajado', 'tipo_detalle', 'hora_fin', 'zonas'];
// Para listas (hoy, calendario, ficha): `firmada` es una columna generada
// (firma IS NOT NULL, migración 2026-10-01) — dice si hay firma sin descargar
// la imagen de cada una.
export const COLUMNAS_PRACTICA_LISTA = 'trabajado, tipo_detalle, hora_fin, zonas, firmada';

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

// Km de una práctica (0 si está en blanco o sin cerrar).
export const kmDePractica = p => (p && p.km_final > 0 && p.km_inicial >= 0) ? Math.max(0, p.km_final - p.km_inicial) : 0;
