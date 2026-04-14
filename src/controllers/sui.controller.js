const prisma = require('../lib/prisma');

const ECA_REGISTRADA = 'ECA Bogota Centro';

function getPeriodBounds(anio, mes) {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes, 1, 0, 0, 0, 0));
  return { inicio, fin };
}

function toNumber(value) {
  return Number(value ?? 0);
}

function formatPeriodDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatEstado(estado) {
  return {
    borrador: 'Pendiente',
    enviado: 'Enviado',
    validado: 'Validado',
    rechazado: 'Rechazado',
  }[estado] ?? estado;
}

function buildPreviewRows(reporte) {
  const r13 = reporte.registro13 ?? {};

  return [
    ['Periodo reportado', reporte.periodo ?? '—'],
    ['Total material aprovechado', `${toNumber(r13.materialAprovechado).toFixed(3)} kg`],
    ['Total rechazos', `${toNumber(r13.rechazos).toFixed(3)} kg`],
    ['N° de recicladores', String(r13.numRecicladores ?? 0)],
    ['ECA registrada', r13.ecaRegistrada ?? ECA_REGISTRADA],
    ['Rutas reportadas', String(r13.numRutas ?? 0)],
  ];
}

function toFrontendReport(reporte) {
  return {
    id: reporte.id,
    periodo: reporte.periodo,
    anio: reporte.anio,
    mes: reporte.mes,
    numero: 'Registro 13',
    descripcion: 'Informacion de aprovechamiento de residuos solidos',
    estado: formatEstado(reporte.estado),
    estadoRaw: reporte.estado,
    fechaEnvio: reporte.fechaEnvio,
    createdAt: reporte.createdAt,
    updatedAt: reporte.updatedAt,
    registro13: reporte.registro13,
    rows: buildPreviewRows(reporte),
  };
}

function buildCsv(reporte) {
  const rows = [
    ['campo', 'valor'],
    ['periodo_reportado', reporte.periodo],
    ['total_material_aprovechado_kg', toNumber(reporte.registro13?.materialAprovechado).toFixed(3)],
    ['total_rechazos_kg', toNumber(reporte.registro13?.rechazos).toFixed(3)],
    ['numero_recicladores', String(reporte.registro13?.numRecicladores ?? 0)],
    ['eca_registrada', reporte.registro13?.ecaRegistrada ?? ECA_REGISTRADA],
    ['rutas_reportadas', String(reporte.registro13?.numRutas ?? 0)],
    ['periodo_inicio', reporte.registro13?.periodoInicio ?? ''],
    ['periodo_fin', reporte.registro13?.periodoFin ?? ''],
  ];

  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(',')
    )
    .join('\n');
}

async function calcularRegistro13(anio, mes) {
  const { inicio, fin } = getPeriodBounds(anio, mes);

  const [pesajeMateriales, recicladores, rutas] = await Promise.all([
    prisma.pesajeMaterial.findMany({
      where: {
        pesaje: {
          horaEntrada: {
            gte: inicio,
            lt: fin,
          },
        },
      },
      select: {
        pesoNeto: true,
        rechazo: true,
      },
    }),
    prisma.pesaje.findMany({
      where: {
        horaEntrada: {
          gte: inicio,
          lt: fin,
        },
      },
      distinct: ['recicladorId'],
      select: { recicladorId: true },
    }),
    prisma.pesaje.findMany({
      where: {
        horaEntrada: {
          gte: inicio,
          lt: fin,
        },
      },
      distinct: ['rutaId'],
      select: { rutaId: true },
    }),
  ]);

  const totals = pesajeMateriales.reduce(
    (acc, item) => {
      acc.materialAprovechado += toNumber(item.pesoNeto);
      acc.rechazos += toNumber(item.rechazo);
      return acc;
    },
    { materialAprovechado: 0, rechazos: 0 }
  );

  return {
    materialAprovechado: Number(totals.materialAprovechado.toFixed(3)),
    rechazos: Number(totals.rechazos.toFixed(3)),
    numRecicladores: recicladores.length,
    ecaRegistrada: ECA_REGISTRADA,
    numRutas: rutas.length,
    periodoInicio: formatPeriodDate(inicio),
    periodoFin: formatPeriodDate(new Date(fin.getTime() - 1)),
  };
}

async function listar(_req, res) {
  const reportes = await prisma.reporteSUI.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });

  res.json(reportes.map(toFrontendReport));
}

async function obtener(req, res) {
  const reporte = await prisma.reporteSUI.findUnique({
    where: { id: Number(req.params.id) },
  });

  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json(toFrontendReport(reporte));
}

async function obtenerPorMes(req, res) {
  const [anioStr, mesStr] = req.params.yyyymm.split('-');
  const reporte = await prisma.reporteSUI.findUnique({
    where: { anio_mes: { anio: Number(anioStr), mes: Number(mesStr) } },
  });

  if (!reporte) return res.status(404).json({ error: 'No hay reporte para ese periodo' });
  res.json(toFrontendReport(reporte));
}

async function crear(req, res) {
  const { anio, mes, registro13, registro14 } = req.body;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  const existe = await prisma.reporteSUI.findUnique({ where: { anio_mes: { anio, mes } } });
  if (existe) {
    return res.status(409).json({
      error: `Ya existe un reporte para ${periodo}`,
      reporteId: existe.id,
    });
  }

  const reporte = await prisma.reporteSUI.create({
    data: { periodo, anio, mes, registro13, registro14, operadorId: req.user.sub },
  });

  res.status(201).json(toFrontendReport(reporte));
}

async function actualizar(req, res) {
  const id = Number(req.params.id);
  const reporte = await prisma.reporteSUI.findUnique({ where: { id } });
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

  if (reporte.estado === 'enviado' || reporte.estado === 'validado') {
    return res.status(409).json({ error: 'No se puede editar un reporte ya enviado o validado' });
  }

  const actualizado = await prisma.reporteSUI.update({
    where: { id },
    data: req.body,
  });

  res.json(toFrontendReport(actualizado));
}

async function generarReporte(req, res) {
  const { anio, mes } = req.body;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const registro13 = await calcularRegistro13(anio, mes);
  const existente = await prisma.reporteSUI.findUnique({
    where: { anio_mes: { anio, mes } },
  });

  if (existente?.estado === 'enviado' || existente?.estado === 'validado') {
    return res.status(409).json({
      error: 'No se puede regenerar un reporte ya enviado o validado',
      reporteId: existente.id,
    });
  }

  const reporte = existente
    ? await prisma.reporteSUI.update({
        where: { id: existente.id },
        data: {
          periodo,
          registro13,
          operadorId: req.user.sub,
          estado: 'borrador',
          fechaEnvio: null,
        },
      })
    : await prisma.reporteSUI.create({
        data: {
          periodo,
          anio,
          mes,
          registro13,
          operadorId: req.user.sub,
        },
      });

  res.status(existente ? 200 : 201).json({
    mensaje: existente
      ? `Reporte ${periodo} regenerado correctamente`
      : `Reporte ${periodo} generado correctamente`,
    reporte: toFrontendReport(reporte),
  });
}

async function enviar(req, res) {
  const id = Number(req.params.id);
  const reporte = await prisma.reporteSUI.findUnique({ where: { id } });
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

  if (reporte.estado === 'enviado') {
    return res.status(409).json({ error: 'El reporte ya fue enviado' });
  }

  if (!reporte.registro13 || !reporte.registro14) {
    return res.status(422).json({ error: 'El reporte debe tener Registro 13 y 14 completos antes de enviar' });
  }

  const actualizado = await prisma.reporteSUI.update({
    where: { id },
    data: { estado: 'enviado', fechaEnvio: new Date() },
  });

  res.json({
    mensaje: 'Reporte marcado como enviado al SUI',
    reporte: toFrontendReport(actualizado),
  });
}

async function generarCSV(req, res) {
  const id = Number(req.params.id);
  const reporte = await prisma.reporteSUI.findUnique({ where: { id } });
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

  const csv = buildCsv(reporte);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="registro13-${reporte.periodo}.csv"`);
  res.send(csv);
}

async function generarXML(req, res) {
  const id = Number(req.params.id);
  const reporte = await prisma.reporteSUI.findUnique({ where: { id } });
  if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

  const r13 = reporte.registro13 ?? {};
  const r14 = reporte.registro14 ?? {};

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ReporteSUI>
  <Cabecera>
    <Periodo>${reporte.periodo}</Periodo>
    <FechaGeneracion>${new Date().toISOString()}</FechaGeneracion>
    <Estado>${reporte.estado}</Estado>
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
  res.set('Content-Disposition', `attachment; filename="SUI-${reporte.periodo}.xml"`);
  res.send(xml);
}

module.exports = { listar, obtener, obtenerPorMes, crear, actualizar, enviar, generarXML, generarReporte, generarCSV };
