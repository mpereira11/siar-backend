const { z } = require('zod');

const crearVehiculoSchema = z.object({
  recicladorId: z.number().int().positive(),
  tipo:         z.enum(['Camion', 'Carreta', 'Bicicleta']),
  color:        z.string().min(2).max(30).transform(v => v.trim()),
  capacidadKg:  z.number().positive(),
  estado:       z.enum(['Activo', 'En mantenimiento', 'Inactivo']).default('Activo'),
});

const listQuerySchema = z.object({
  recicladorId: z.coerce.number().int().positive().optional(),
});

module.exports = { crearVehiculoSchema, listQuerySchema };
