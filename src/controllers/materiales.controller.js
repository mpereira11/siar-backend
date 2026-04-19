const prisma = require('../lib/prisma');
const { invalidate } = require('../lib/cache');

async function listar(_req, res) {
  const materiales = await prisma.material.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      precios: {
        where: { vigenciaHasta: null },
        orderBy: { vigenciaDesde: 'desc' },
        take: 1,
      },
    },
  });

  const data = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    codigo: m.codigo,
    icono: m.icono,
    unidad: m.unidad,
    precio: m.precios[0] ? Number(m.precios[0].precio) : null,
    tendencia: m.precios[0]?.tendencia ?? 'estable',
    vigenciaDesde: m.precios[0]?.vigenciaDesde ?? null,
  }));

  res.json(data);
}

async function obtener(req, res) {
  const id = Number(req.params.id);
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      precios: { orderBy: { vigenciaDesde: 'desc' }, take: 12 },
      compradores: { where: { activo: true } },
    },
  });

  if (!material) return res.status(404).json({ error: 'Material no encontrado' });
  res.json(material);
}

async function crear(req, res) {
  const existe = await prisma.material.findUnique({ where: { codigo: req.body.codigo } });
  if (existe) return res.status(409).json({ error: `El código ${req.body.codigo} ya existe` });

  const material = await prisma.material.create({ data: req.body });
  invalidate('/api/materiales');
  res.status(201).json(material);
}

async function actualizarPrecio(req, res) {
  const id = Number(req.params.id);
  const { precio, tendencia, vigenciaDesde } = req.body;

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return res.status(404).json({ error: 'Material no encontrado' });

  // Cerrar precio anterior
  await prisma.precioMaterial.updateMany({
    where: { materialId: id, vigenciaHasta: null },
    data: { vigenciaHasta: new Date() },
  });

  const nuevoPrecio = await prisma.precioMaterial.create({
    data: {
      materialId: id,
      precio,
      tendencia,
      vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde) : new Date(),
      operadorId: req.user.sub,
    },
  });

  invalidate('/api/materiales');
  invalidate('/api/dashboard');
  res.json({ material: { id, nombre: material.nombre }, nuevoPrecio });
}

async function historialPrecios(req, res) {
  const id = Number(req.params.id);
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return res.status(404).json({ error: 'Material no encontrado' });

  const precios = await prisma.precioMaterial.findMany({
    where: { materialId: id },
    orderBy: { vigenciaDesde: 'desc' },
  });

  res.json({ material: { id, nombre: material.nombre, codigo: material.codigo }, precios });
}

async function listarCompradores(_req, res) {
  const compradores = await prisma.comprador.findMany({
    where: { activo: true },
    include: {
      material: { select: { id: true, nombre: true, codigo: true, icono: true } },
    },
    orderBy: { empresa: 'asc' },
  });

  res.json(compradores);
}

async function crearComprador(req, res) {
  const comprador = await prisma.comprador.create({
    data: req.body,
    include: { material: { select: { nombre: true, codigo: true } } },
  });

  invalidate('/api/materiales');
  res.status(201).json(comprador);
}

module.exports = { listar, obtener, crear, actualizarPrecio, historialPrecios, listarCompradores, crearComprador };
