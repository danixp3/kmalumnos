// Utilidades compartidas para las APIs de web-remote

// Validar variables de entorno
export function checkEnvVars() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!process.env.API_PIN) missing.push('API_PIN');
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Validar token de autenticación
export function validateToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pin, timestamp] = decoded.split(':');
    const expectedPin = process.env.API_PIN;
    
    if (pin !== expectedPin) return false;
    
    const tokenTime = parseInt(timestamp);
    if (Date.now() - tokenTime > 24 * 60 * 60 * 1000) return false;
    
    return true;
  } catch {
    return false;
  }
}

// Middleware de autenticación
export function requireAuth(req, res) {
  const token = req.headers['x-api-token'];
  if (!validateToken(token)) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión de nuevo.' });
    return false;
  }
  return true;
}

// Validadores de entrada
export const validators = {
  // Validar que sea un entero positivo
  positiveInt(value, fieldName) {
    const num = parseInt(value);
    if (isNaN(num) || num < 1) {
      return { valid: false, error: `${fieldName} debe ser un número positivo` };
    }
    return { valid: true, value: num };
  },

  // Validar fecha YYYY-MM-DD
  fecha(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Fecha requerida' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { valid: false, error: 'Formato de fecha inválido (usar YYYY-MM-DD)' };
    }
    // Validar que sea una fecha real
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Fecha no válida' };
    }
    // No permitir fechas futuras más de 1 día
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date > tomorrow) {
      return { valid: false, error: 'No se permiten fechas futuras' };
    }
    // No permitir fechas de hace más de 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (date < thirtyDaysAgo) {
      return { valid: false, error: 'No se permiten fechas de hace más de 30 días' };
    }
    return { valid: true, value };
  },

  // Validar string no vacío
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

  // Validar tipo de permiso
  permiso(value) {
    const valid = ['A', 'A2', 'AM', 'B', 'C'];
    if (!valid.includes(value)) {
      return { valid: false, error: `Permiso debe ser uno de: ${valid.join(', ')}` };
    }
    return { valid: true, value };
  }
};
