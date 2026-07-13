import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { alumno_id, fecha } = req.body;

  if (!alumno_id || !fecha) {
    return res.status(400).json({ error: 'Faltan campos: alumno_id y fecha son obligatorios' });
  }

  // Obtener vehiculo_id del alumno
  const { data: alumno, error: errAlumno } = await supabase
    .from('alumnos')
    .select('id, nombre, vehiculo_id')
    .eq('id', alumno_id)
    .single();

  if (errAlumno || !alumno) {
    return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  if (!alumno.vehiculo_id) {
    return res.status(400).json({ error: 'El alumno no tiene vehículo asignado' });
  }

  // Obtener el ID máximo actual de prácticas para generar uno nuevo
  const { data: maxRow } = await supabase
    .from('practicas')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const newId = (maxRow?.id ?? 0) + 1;

  // Insertar práctica con km=0,0 (se rellenará desde la app de escritorio)
  const { error: errInsert } = await supabase
    .from('practicas')
    .insert({
      id: newId,
      alumno_id: alumno.id,
      vehiculo_id: alumno.vehiculo_id,
      fecha,
      km_inicial: 0,
      km_final: 0,
      deleted: false,
      updated_at: new Date().toISOString()
    });

  if (errInsert) {
    return res.status(500).json({ error: errInsert.message });
  }

  return res.status(200).json({
    ok: true,
    mensaje: `Práctica registrada para ${alumno.nombre} el ${fecha}`,
    practica_id: newId
  });
}
