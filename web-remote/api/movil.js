// Único endpoint serverless del flujo móvil de prácticas. El plan Hobby de Vercel
// admite 12 funciones, así que hoy/iniciar/finalizar/firmar/cancelar viven en
// lib/movil/ y vercel.json reescribe /api/<nombre> → /api/movil?op=<nombre>.
import hoy from '../lib/movil/hoy.js';
import iniciar from '../lib/movil/iniciar-practica.js';
import finalizar from '../lib/movil/finalizar-practica.js';
import firmar from '../lib/movil/firmar-practica.js';
import cancelar from '../lib/movil/cancelar-practica.js';

const OPS = {
  'hoy': hoy,
  'iniciar-practica': iniciar,
  'finalizar-practica': finalizar,
  'firmar-practica': firmar,
  'cancelar-practica': cancelar
};

export default async function handler(req, res) {
  const op = req.query && req.query.op;
  const fn = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!fn) return res.status(404).json({ error: 'Operación no encontrada' });
  return fn(req, res);
}
