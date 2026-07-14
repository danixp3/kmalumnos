import { createClient } from '@supabase/supabase-js';

// Validar variables de entorno al inicio
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('ERROR: Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY');
}

if (!process.env.API_PIN) {
  console.error('ERROR: Falta variable de entorno API_PIN');
}

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Token simple basado en PIN + timestamp (válido 24h)
function generateToken(pin) {
  const timestamp = Date.now();
  const payload = `${pin}:${timestamp}`;
  // Simple encoding (en producción usar JWT)
  return Buffer.from(payload).toString('base64');
}

function validateToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [pin, timestamp] = decoded.split(':');
    const expectedPin = process.env.API_PIN;
    
    // Verificar PIN
    if (pin !== expectedPin) return false;
    
    // Verificar que no ha expirado (24h)
    const tokenTime = parseInt(timestamp);
    if (Date.now() - tokenTime > 24 * 60 * 60 * 1000) return false;
    
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // CORS restringido
  const allowedOrigins = [
    'https://kmalumnos-remote.vercel.app',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { pin } = req.body || {};

  // Validar PIN
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN requerido' });
  }

  // Validar formato (4 dígitos)
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'El PIN debe tener 4 dígitos' });
  }

  // Verificar PIN contra variable de entorno
  const expectedPin = process.env.API_PIN;
  if (!expectedPin) {
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  if (pin !== expectedPin) {
    // Pequeño delay para dificultar fuerza bruta
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  // Generar token de sesión
  const token = generateToken(pin);

  return res.status(200).json({
    ok: true,
    token,
    expires_in: 86400 // 24 horas en segundos
  });
}

// Exportar función de validación para usar en otras APIs
export { validateToken };
