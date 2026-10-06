// Único endpoint serverless del flujo móvil de prácticas. El plan Hobby de Vercel
// admite 12 funciones, así que hoy/iniciar/finalizar/firmar/cancelar/config/
// calendario/practica-detalle/anotar-practica/registrar-clase/firma-profesor/coche-profesor/avisos/km-coche viven en lib/movil/ y vercel.json reescribe
// /api/<nombre> → /api/movil?op=<nombre>.
import hoy from '../lib/movil/hoy.js';
import iniciar from '../lib/movil/iniciar-practica.js';
import finalizar from '../lib/movil/finalizar-practica.js';
import firmar from '../lib/movil/firmar-practica.js';
import cancelar from '../lib/movil/cancelar-practica.js';
import config from '../lib/movil/config.js';
import calendario from '../lib/movil/calendario.js';
import detalle from '../lib/movil/practica-detalle.js';
import anotar from '../lib/movil/anotar-practica.js';
import registrar from '../lib/movil/registrar-clase.js';
import firmaProfesor from '../lib/movil/firma-profesor.js';
import cocheProfesor from '../lib/movil/coche-profesor.js';
import avisos, { enviarAvisos } from '../lib/movil/avisos.js';
import kmCoche from '../lib/movil/km-coche.js';

const OPS = {
  'hoy': hoy,
  'iniciar-practica': iniciar,
  'finalizar-practica': finalizar,
  'firmar-practica': firmar,
  'cancelar-practica': cancelar,
  'config': config,
  'calendario': calendario,
  'practica-detalle': detalle,
  'anotar-practica': anotar,
  'registrar-clase': registrar,
  'firma-profesor': firmaProfesor,
  'coche-profesor': cocheProfesor,
  'avisos': avisos,
  'avisos-enviar': enviarAvisos,
  'km-coche': kmCoche
};

export default async function handler(req, res) {
  const op = req.query && req.query.op;
  const fn = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!fn) return res.status(404).json({ error: 'Operación no encontrada' });
  return fn(req, res);
}
