const supabase = require('../lib/supabase');

const ECA_REGISTRADA = 'ECA Bogota Centro';

function getPeriodBounds(anio, mes) {
  return {
    inicio: new Date(Date.UTC(anio, mes - 1, 1)).toISOString(),
    fin:    new Date(Date.UTC(anio, mes,     1)).toISOString(),
  };
}

const toNumber = (v) => Number(v ?? 0);

function formatEstado(e) {
  return { borrador: 'Pendiente', enviado: 'Enviado', validado: 'Validado', rechazado: 'Rechazado' }[e] ?? e;
}

function buildPreviewRows(r) {
  const r13 = r.registro13 ?? {};
  return [
    ['Periodo reportado',          r.periodo ?? '—'],
    ['Total material aprovechado', `${toNumber(r13.materialAprovechado).toFixed(3)} kg`],
    ['Total rechazos',             `${toNumber(r13.rechazos).toFixed(3)} kg`],
    ['N° de recicladores',         String(r13.numRecicladores ?? 0)],
    ['ECA registrada',             r13.ecaRegistrada ?? ECA_REGISTRADA],
    ['Rutas reportadas',           String(r13.numRutas ?? 0)],
  ];
}

function toFrontend(r) {
  return {
    id: r.id, periodo: r.periodo, anio: r.anio, mes: r.mes,
    numero: 'Registro 13',
    descripcion: 'Informacion de aprovechamiento de residuos solidos',
    estado: formatEstado(r.estado), estadoRaw: r.estado,
    fechaEnvio: r.fechaEnvio, createdAt: r.createdAt, updatedAt: r.updatedAt,
    registro13: r.registro13, registro14: r.registro14,
    rows: buildPreviewRows(r),
  };
}

function buildCsv(r) {
  const rows = [
    ['campo', 'valor'],
    ['periodo_reportado',              r.periodo],
    ['total_material_aprovechado_kg',  toNumber(r.registro13?.materialAprovechado).toFixed(3)],
    ['total_rechazos_kg',              toNumber(r.registro13?.rechazos).toFixed(3)],
    ['numero_recicladores',            String(r.registro13?.numRecicladores ?? 0)],
    ['eca_registrada',                 r.registro13?.ecaRegistrada ?? ECA_REGISTRADA],
    ['rutas_reportadas',               String(r.registro13?.numRutas ?? 0)],
    ['periodo_inicio',                 r.registro13?.periodoInicio ?? ''],
    ['periodo_fin',                    r.registro13?.periodoFin ?? ''],
  ];
  return rows.map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

async function calcularRegistro13(anio, mes) {
  const { inicio, fin } = getPeriodBounds(anio, mes);

  const [{ data: matRaw }, { data: recsRaw }, { data: rutasRaw }] = await Promise.all([
    supabase
      .from('pesaje_materiales')
      .select('pesoNeto, rechazo, pesajes!pesajeId(horaEntrada)')
      .gte('pesajes.horaEntrada', inicio)
      .lt('pesajes.horaEntrada', fin),
    supabase
      .from('pesajes')
      .select('recicladorId')
      .gte('horaEntrada', inicio).lt('horaEntrada', fin),
    supabase
      .from('pesajes')
      .select('rutaId')
      .gte('horaEntrada', inicio).lt('horaEntrada', fin),
  ]);

  const totals = (matRaw ?? []).reduce(
    (acc, pm) => {
      acc.materialAprovechado += toNumber(pm.pesoNeto);
      acc.rechazos            += toNumber(pm.rechazo);
      return acc;
    },
    { materialAprovechado: 0, rechazos: 0 }
  );

  return {
    materialAprovechado: Number(totals.materialAprovechado.toFixed(3)),
    rechazos:            Number(totals.rechazos.toFixed(3)),
    numRecicladores: new Set((recsRaw ?? []).map((r) => r.recicladorId)).size,
    ecaRegistrada: ECA_REGISTRADA,
    numRutas: new Set((rutasRaw ?? []).map((r) => r.rutaId)).size,
    periodoInicio: inicio.slice(0, 10),
    periodoFin:    new Date(new Date(fin).getTime() - 1).toISOString().slice(0, 10),
  };
}

async function listar(_req, res) {
  try {
    const { data, error } = await supabase
      .from('reportes_sui').select('*')
      .order('anio', { ascending: false }).order('mes', { ascending: false });
    if (error) throw error;
    res.json((data ?? []).map(toFrontend));
  } catch (err) { console.error('[sui.listar]', err); res.status(500).json({ error: 'Error' }); }
}

async function obtener(req, res) {
  try {
    const { data, error } = await supabase.from('reportes_sui').select('*').eq('id', Number(req.params.id)).single();
    if (error || !data) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json(toFrontend(data));
  } catch (err) { console.error('[sui.obtener]', err); res.status(500).json({ error: 'Error' }); }
}

async function obtenerPorMes(req, res) {
  try {
    const [anio, mes] = req.params.yyyymm.split('-').map(Number);
    const { data, error } = await supabase.from('reportes_sui').select('*').eq('anio', anio).eq('mes', mes).single();
    if (error || !data) return res.status(404).json({ error: 'No hay reporte para ese periodo' });
    res.json(toFrontend(data));
  } catch (err) { console.error('[sui.obtenerPorMes]', err); res.status(500).json({ error: 'Error' }); }
}

async function crear(req, res) {
  try {
    const { anio, mes, registro13, registro14 } = req.body;
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const { data: existe } = await supabase.from('reportes_sui').select('id').eq('anio', anio).eq('mes', mes).single();
    if (existe) return res.status(409).json({ error: `Ya existe un reporte para ${periodo}`, reporteId: existe.id });

    const nowSui = new Date().toISOString();
    const { data, error } = await supabase
      .from('reportes_sui')
      .insert({ periodo, anio, mes, registro13, registro14, operadorId: req.user.sub, createdAt: nowSui, updatedAt: nowSui })
      .select().single();
    if (error) throw error;
    res.status(201).json(toFrontend(data));
  } catch (err) { console.error('[sui.crear]', err); res.status(500).json({ error: 'Error al crear reporte' }); }
}

async function actualizar(req, res) {
  try {
    const id = Number(req.params.id);
    const { data: existing } = await supabase.from('reportes_sui').select('estado').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (['enviado', 'validado'].includes(existing.estado))
      return res.status(409).json({ error: 'No se puede editar un reporte ya enviado o validado' });
    const { data, error } = await supabase.from('reportes_sui').update(req.body).eq('id', id).select().single();
    if (error) throw error;
    res.json(toFrontend(data));
  } catch (err) { console.error('[sui.actualizar]', err); res.status(500).json({ error: 'Error al actualizar' }); }
}

async function generarReporte(req, res) {
  try {
    const { anio, mes } = req.body;
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const registro13 = await calcularRegistro13(anio, mes);
    const { data: existente } = await supabase.from('reportes_sui').select('id, estado').eq('anio', anio).eq('mes', mes).single();

    if (['enviado', 'validado'].includes(existente?.estado))
      return res.status(409).json({ error: 'No se puede regenerar', reporteId: existente.id });

    const nowSui2 = new Date().toISOString();
    const payload = { periodo, registro13, operadorId: req.user.sub, estado: 'borrador', fechaEnvio: null, updatedAt: nowSui2 };
    const { data, error } = existente
      ? await supabase.from('reportes_sui').update(payload).eq('id', existente.id).select().single()
      : await supabase.from('reportes_sui').insert({ ...payload, anio, mes, createdAt: nowSui2 }).select().single();
    if (error) throw error;

    res.status(existente ? 200 : 201).json({
      mensaje: existente ? `Reporte ${periodo} regenerado` : `Reporte ${periodo} generado`,
      reporte: toFrontend(data),
    });
  } catch (err) { console.error('[sui.generar]', err); res.status(500).json({ error: 'Error al generar' }); }
}

async function enviar(req, res) {
  try {
    const id = Number(req.params.id);
    const { data: r } = await supabase.from('reportes_sui').select('*').eq('id', id).single();
    if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (r.estado === 'enviado') return res.status(409).json({ error: 'Ya fue enviado' });
    if (!r.registro13 || !r.registro14)
      return res.status(422).json({ error: 'Registro 13 y 14 requeridos antes de enviar' });
    const { data, error } = await supabase
      .from('reportes_sui').update({ estado: 'enviado', fechaEnvio: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    res.json({ mensaje: 'Reporte marcado como enviado al SUI', reporte: toFrontend(data) });
  } catch (err) { console.error('[sui.enviar]', err); res.status(500).json({ error: 'Error al enviar' }); }
}

async function generarCSV(req, res) {
  try {
    const { data, error } = await supabase.from('reportes_sui').select('*').eq('id', Number(req.params.id)).single();
    if (error || !data) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="registro13-${data.periodo}.csv"`);
    res.send(buildCsv(data));
  } catch (err) { console.error('[sui.csv]', err); res.status(500).json({ error: 'Error' }); }
}

async function generarXML(req, res) {
  try {
    const { data, error } = await supabase.from('reportes_sui').select('*').eq('id', Number(req.params.id)).single();
    if (error || !data) return res.status(404).json({ error: 'Reporte no encontrado' });
    const r13 = data.registro13 ?? {}, r14 = data.registro14 ?? {};
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ReporteSUI>
  <Cabecera>
    <Periodo>${data.periodo}</Periodo>
    <FechaGeneracion>${new Date().toISOString()}</FechaGeneracion>
    <Estado>${data.estado}</Estado>
  </Cabecera>
  <Registro13>
    <MaterialAprovechado unidad="kg">${r13.materialAprovechado ?? 0}</MaterialAprovechado>
    <Rechazos unidad="kg">${r13.rechazos ?? 0}</Rechazos>
    <NumeroRecicladores>${r13.numRecicladores ?? 0}</NumeroRecicladores>
    <ECARegistrada>${r13.ecaRegistrada ?? ECA_REGISTRADA}</ECARegistrada>
    <NumeroRutas>${r13.numRutas ?? 0}</NumeroRutas>
    <PeriodoInicio>${r13.periodoInicio ?? ''}</PeriodoInicio>
    <PeriodoFin>${r13.periodoFin ?? ''}</PeriodoFin>
  </Registro13>
  <Registro14>
    <TotalLiquidado moneda="COP">${r14.totalLiquidado ?? 0}</TotalLiquidado>
    <RecicladoresConIngresos>${r14.recicladoresConIngresos ?? 0}</RecicladoresConIngresos>
    <TotalRecicladores>${r14.totalRecicladores ?? 0}</TotalRecicladores>
    <TasaAprovechamiento>${r14.tasaAprovechamiento ?? 0}</TasaAprovechamiento>
    <PromedioPorReciclador>${r14.promedioPorReciclador ?? 0}</PromedioPorReciclador>
    <Quejas>${r14.quejas ?? 0}</Quejas>
  </Registro14>
</ReporteSUI>`;
    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="SUI-${data.periodo}.xml"`);
    res.send(xml);
  } catch (err) { console.error('[sui.xml]', err); res.status(500).json({ error: 'Error' }); }
}

module.exports = { listar, obtener, obtenerPorMes, crear, actualizar, enviar, generarXML, generarReporte, generarCSV };