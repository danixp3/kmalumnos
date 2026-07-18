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
    'https://kmalumnos-remote.vercel.app',
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
