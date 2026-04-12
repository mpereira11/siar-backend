const prisma = require('../lib/prisma');

// Formatea un vehiculo de BD al formato esperado por el frontend
function formatearVehiculo(v) {
  return {
    id:               `VEH-${String(v.id).padStart(3, '0')}`,
    recicladorId:     v.reciclador.codigo,
    recicladorNombre: v.reciclador.nombre,
    tipo:             v.tipo,
    identificador:    v.identificador,
    color:            v.color,
    capacidadKg:      v.capacidadKg,
    estado:           v.estado,
    fechaRegistro:    v.fechaRegistro.toISOString().slice(0, 10),
    _id:              v.id, // id entero para operaciones internas
  };
}

async function listar(req, res) {
  const { recicladorId } = req.query;

  const where = {};
  if (recicladorId) where.recicladorId = Number(recicladorId);

  const vehiculos = await prisma.vehiculo.findMany({
    where,
    orderBy: { fechaRegistro: 'desc' },
    include: {
      reciclador: { select: { id: true, codigo: true, nombre: true } },
    },
  });

  res.json({ data: vehiculos.map(formatearVehiculo) });
}

const PREFIJOS = { Camion: 'CAM', Carreta: 'CAR', Bicicleta: 'BIC' };

async function crear(req, res) {
  const { recicladorId, tipo, color, capacidadKg, estado } = req.body;

  // Verificar que el reciclador exista
  const reciclador = await prisma.reciclador.findUnique({ where: { id: recicladorId } });
  if (!reciclador) {
    return res.status(404).json({ error: 'Reciclador no encontrado' });
  }

  // Crear el vehículo y luego asignar el identificador basado en el ID generado
  const vehiculo = await prisma.vehiculo.create({
    data: { recicladorId, tipo, identificador: `TEMP-${Date.now()}`, color, capacidadKg, estado },
    include: {
      reciclador: { select: { id: true, codigo: true, nombre: true } },
    },
  });

  const prefijo = PREFIJOS[tipo] || 'VEH';
  const identificador = `${prefijo}-${String(vehiculo.id).padStart(3, '0')}`;

  const actualizado = await prisma.vehiculo.update({
    where: { id: vehiculo.id },
    data: { identificador },
    include: {
      reciclador: { select: { id: true, codigo: true, nombre: true } },
    },
  });

  res.status(201).json(formatearVehiculo(actualizado));
}

module.exports = { listar, crear };
