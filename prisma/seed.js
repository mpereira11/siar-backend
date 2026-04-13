const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Sembrando base de datos SIAR...');

  // ─── Limpiar en orden de dependencias ─────────────────────────────────────
  await prisma.pQR.deleteMany();
  await prisma.reporteSUI.deleteMany();
  await prisma.balanceAjuste.deleteMany();
  await prisma.balanceMes.deleteMany();
  await prisma.pesajeMaterial.deleteMany();
  await prisma.pesaje.deleteMany();
  await prisma.comprador.deleteMany();
  await prisma.precioMaterial.deleteMany();
  await prisma.material.deleteMany();
  await prisma.reciclador.deleteMany();
  await prisma.ruta.deleteMany();
  await prisma.usuario.deleteMany();

  // ─── Usuarios ─────────────────────────────────────────────────────────────
  const hash = (p) => bcrypt.hashSync(p, 10);

  const admin = await prisma.usuario.create({
    data: {
      email: 'admin@asociacion-bogota.co',
      password: hash('Admin2024!'),
      nombre: 'María González',
      rol: 'admin_asociacion',
    },
  });

  const operador = await prisma.usuario.create({
    data: {
      email: 'operador@eca-bogota.co',
      password: hash('Operador2024!'),
      nombre: 'Carlos Rodríguez',
      rol: 'operador_eca',
    },
  });

  const userRec1 = await prisma.usuario.create({
    data: {
      email: 'jluis@recicladores.co',
      password: hash('Recicla2024!'),
      nombre: 'José Luis Martínez',
      rol: 'reciclador_oficio',
    },
  });

  const userRec2 = await prisma.usuario.create({
    data: {
      email: 'aperez@recicladores.co',
      password: hash('Recicla2024!'),
      nombre: 'Ana Pérez',
      rol: 'reciclador_oficio',
    },
  });

  console.log('✅ Usuarios creados');

  // ─── Rutas ────────────────────────────────────────────────────────────────
  const rutas = await Promise.all([
    prisma.ruta.create({
      data: {
        numero: 'R-01',
        nombre: 'Norte Centro',
        descripcion: 'Zona norte y centro de la ciudad',
        barrios: ['Chapinero', 'Usaquén', 'Teusaquillo', 'Barrios Unidos', 'Engativá', 'Suba'],
        estado: 'Activa',
      },
    }),
    prisma.ruta.create({
      data: {
        numero: 'R-02',
        nombre: 'Sur Occidente',
        descripcion: 'Zona sur occidental',
        barrios: ['Kennedy', 'Bosa', 'Fontibón', 'Puente Aranda', 'Tunjuelito'],
        estado: 'Activa',
      },
    }),
    prisma.ruta.create({
      data: {
        numero: 'R-03',
        nombre: 'Oriente',
        descripcion: 'Zona oriental',
        barrios: ['San Cristóbal', 'Usme', 'Rafael Uribe', 'Antonio Nariño', 'Los Mártires'],
        estado: 'Activa',
      },
    }),
    prisma.ruta.create({
      data: {
        numero: 'R-04',
        nombre: 'Centro Histórico',
        descripcion: 'Centro histórico y La Candelaria',
        barrios: ['La Candelaria', 'Santa Fe', 'La Paz', 'Las Cruces', 'Lourdes', 'Egipto'],
        estado: 'Parcial',
      },
    }),
    prisma.ruta.create({
      data: {
        numero: 'R-05',
        nombre: 'Occidental',
        descripcion: 'Zona occidente',
        barrios: ['Fontibón', 'Engativá Norte', 'Marsella', 'Álamos', 'Modelia', 'Tintal'],
        estado: 'Activa',
      },
    }),
    prisma.ruta.create({
      data: {
        numero: 'R-06',
        nombre: 'Sur Este',
        descripcion: 'Zona sur este',
        barrios: ['Ciudad Bolívar', 'Perdomo', 'Arborizadora', 'Lucero', 'Ismael Perdomo', 'Bellavista'],
        estado: 'Activa',
      },
    }),
  ]);

  console.log('✅ Rutas creadas');

  // ─── Recicladores ─────────────────────────────────────────────────────────
  const recicladoresData = [
    { codigo: 'ID-0042', nombre: 'José Luis Martínez', usuarioId: userRec1.id, rutaId: rutas[0].id, color: '#4caf7d', estado: 'Activa' },
    { codigo: 'ID-0078', nombre: 'Ana Pérez',          usuarioId: userRec2.id, rutaId: rutas[1].id, color: '#2e8b57', estado: 'Activa' },
    { codigo: 'ID-0015', nombre: 'Carlos Ruiz',        rutaId: rutas[2].id, color: '#d4ed8a', estado: 'Activa' },
    { codigo: 'ID-0091', nombre: 'Laura Torres',       rutaId: rutas[0].id, color: '#f0a500', estado: 'Activa' },
    { codigo: 'ID-0033', nombre: 'Miguel Vargas',      rutaId: rutas[3].id, color: '#e05555', estado: 'Inactivo' },
    { codigo: 'ID-0057', nombre: 'Sandra Moreno',      rutaId: rutas[1].id, color: '#6b7a6e', estado: 'Activa' },
    { codigo: 'ID-0064', nombre: 'Pedro Álvarez',      rutaId: rutas[4].id, color: '#1a5c3a', estado: 'Activa' },
    { codigo: 'ID-0083', nombre: 'Rosa Jiménez',       rutaId: rutas[5].id, color: '#4caf7d', estado: 'Activa' },
    { codigo: 'ID-0019', nombre: 'Hernán López',       rutaId: rutas[2].id, color: '#2e8b57', estado: 'Activa' },
    { codigo: 'ID-0027', nombre: 'Gloria Cano',        rutaId: rutas[3].id, color: '#d4ed8a', estado: 'Activa' },
    { codigo: 'ID-0049', nombre: 'Fabio Ríos',         rutaId: rutas[4].id, color: '#f0a500', estado: 'Activa' },
    { codigo: 'ID-0072', nombre: 'Patricia Niño',      rutaId: rutas[5].id, color: '#e05555', estado: 'Activa' },
  ];

  const recicladores = await Promise.all(
    recicladoresData.map((r) => prisma.reciclador.create({ data: r }))
  );

  console.log('✅ Recicladores creados');

  // ─── Materiales y Precios ─────────────────────────────────────────────────
  const materialesData = [
    // Metales
    { nombre: 'Aluminio',           codigo: '101', icono: '🔩', precio: 1800, tendencia: 'subida'  },
    { nombre: 'Chatarra',           codigo: '102', icono: '⚙️', precio: 400,  tendencia: 'estable' },
    { nombre: 'Cobre',              codigo: '103', icono: '🔧', precio: 3500, tendencia: 'subida'  },
    { nombre: 'Bronce',             codigo: '104', icono: '🔩', precio: 2800, tendencia: 'estable' },
    { nombre: 'Antimonio',          codigo: '105', icono: '⚗️', precio: 900,  tendencia: 'bajada'  },
    { nombre: 'Acero',              codigo: '106', icono: '🔩', precio: 600,  tendencia: 'estable' },
    { nombre: 'Otros Metales',      codigo: '199', icono: '♻️', precio: 300,  tendencia: 'estable' },
    // Papel y Cartón
    { nombre: 'Archivo',            codigo: '201', icono: '📁', precio: 350,  tendencia: 'estable' },
    { nombre: 'Cartón',             codigo: '202', icono: '📦', precio: 320,  tendencia: 'subida'  },
    { nombre: 'Cubetas o Paneles',  codigo: '203', icono: '🗂️', precio: 200,  tendencia: 'estable' },
    { nombre: 'Periódico',          codigo: '204', icono: '📰', precio: 150,  tendencia: 'bajada'  },
    { nombre: 'Plegadiza',          codigo: '205', icono: '📦', precio: 280,  tendencia: 'estable' },
    { nombre: 'Tetra Pack',         codigo: '206', icono: '🥛', precio: 200,  tendencia: 'estable' },
    { nombre: 'Plastificado',       codigo: '207', icono: '📄', precio: 180,  tendencia: 'bajada'  },
    { nombre: 'Kraft',              codigo: '208', icono: '📄', precio: 260,  tendencia: 'estable' },
    { nombre: 'Otros Papel y Cartón', codigo: '299', icono: '♻️', precio: 120, tendencia: 'estable' },
    // Plásticos
    { nombre: 'Acrílico',          codigo: '301', icono: '🧪', precio: 380,  tendencia: 'estable' },
    { nombre: 'Pasta',             codigo: '302', icono: '🧴', precio: 300,  tendencia: 'estable' },
    { nombre: 'PET',               codigo: '303', icono: '🍶', precio: 500,  tendencia: 'subida'  },
    { nombre: 'PVC',               codigo: '304', icono: '🧱', precio: 250,  tendencia: 'bajada'  },
    { nombre: 'Plástico Blanco',   codigo: '305', icono: '🥛', precio: 420,  tendencia: 'subida'  },
    { nombre: 'Polietileno',       codigo: '306', icono: '🧴', precio: 350,  tendencia: 'estable' },
    { nombre: 'Soplado',           codigo: '307', icono: '🍶', precio: 310,  tendencia: 'estable' },
    { nombre: 'Polipropileno',     codigo: '308', icono: '♻️', precio: 400,  tendencia: 'subida'  },
    { nombre: 'Otros Plásticos',   codigo: '399', icono: '♻️', precio: 150,  tendencia: 'estable' },
    // Vidrio
    { nombre: 'Otros Vidrios',     codigo: '499', icono: '🍶', precio: 120,  tendencia: 'bajada'  },
    // Textil
    { nombre: 'Otros Textiles',    codigo: '599', icono: '🧵', precio: 200,  tendencia: 'estable' },
    // Madera
    { nombre: 'Otros Maderables',  codigo: '699', icono: '🪵', precio: 180,  tendencia: 'estable' },
  ];
 
  const materiales = [];
  for (const m of materialesData) {
    const mat = await prisma.material.create({
      data: { nombre: m.nombre, codigo: m.codigo, icono: m.icono },
    });
    await prisma.precioMaterial.create({
      data: {
        materialId: mat.id,
        precio: m.precio,
        tendencia: m.tendencia,
      },
    });
    materiales.push(mat);
  }

  // ─── Compradores ──────────────────────────────────────────────────────────
 const compradoresData = [
    { empresa: 'Papelsa S.A.S',       materialNombre: 'Cartón',          precio: 340  },
    { empresa: 'Papelsa S.A.S',       materialNombre: 'Archivo',         precio: 290  },
    { empresa: 'Ecoenvases Ltda',     materialNombre: 'PET',             precio: 520  },
    { empresa: 'Ecoenvases Ltda',     materialNombre: 'Plástico Blanco', precio: 440  },
    { empresa: 'Vidrios Colombia',    materialNombre: 'Otros Vidrios',   precio: 130  },
    { empresa: 'Chatarrerías Unidas', materialNombre: 'Aluminio',        precio: 1850 },
    { empresa: 'Chatarrerías Unidas', materialNombre: 'Cobre',           precio: 3600 },
    { empresa: 'Recupapel Ltda',      materialNombre: 'Periódico',       precio: 160  },
    { empresa: 'EcoPack S.A',         materialNombre: 'Tetra Pack',      precio: 210  },
  ];
 
  for (const c of compradoresData) {
    const mat = materiales.find((m) => m.nombre === c.materialNombre);
    if (mat) {
      await prisma.comprador.create({
        data: { empresa: c.empresa, materialId: mat.id, precio: c.precio },
      });
    }
  }
 
  console.log('✅ Materiales y compradores creados');
 

  // ─── Pesajes (últimos 30 días) ────────────────────────────────────────────
  const now = new Date();
  const pesajesData = [];

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const fecha = new Date(now);
    fecha.setDate(fecha.getDate() - daysAgo);

    // 3-5 pesajes por día
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const rec = recicladores.filter((r) => r.estado === 'Activa')[i % 11];
      const entrada = new Date(fecha);
      entrada.setHours(7 + i, Math.floor(Math.random() * 60));
      const salida = new Date(entrada);
      salida.setMinutes(salida.getMinutes() + 20 + Math.floor(Math.random() * 40));

      pesajesData.push({
        recicladorId: rec.id,
        rutaId: rec.rutaId,
        horaEntrada: entrada,
        horaSalida: salida,
        estado: Math.random() > 0.1 ? 'OK' : 'Rechazo',
        operadorId: operador.id,
        materiales: [
          {
            materialId: materiales[Math.floor(Math.random() * 5)].id,
            pesoNeto: +(50 + Math.random() * 200).toFixed(2),
            rechazo: +(Math.random() * 10).toFixed(2),
          },
        ],
      });
    }
  }

  for (const p of pesajesData) {
    const { materiales: mats, ...pesajeBase } = p;
    await prisma.pesaje.create({
      data: {
        ...pesajeBase,
        materiales: { create: mats },
      },
    });
  }

  console.log(`✅ ${pesajesData.length} pesajes creados`);

  // ─── Balance de masas (meses recientes) ────────────────────────────────────
   const balancesData = [
    // Febrero 2026
    { anio: 2026, mes: 2, materialNombre: 'Cartón',        ingresado: 1800, vendido: 1680, rechazos: 120 },
    { anio: 2026, mes: 2, materialNombre: 'Archivo',       ingresado: 950,  vendido: 900,  rechazos: 50  },
    { anio: 2026, mes: 2, materialNombre: 'PET',           ingresado: 620,  vendido: 580,  rechazos: 40  },
    { anio: 2026, mes: 2, materialNombre: 'Otros Vidrios', ingresado: 420,  vendido: 390,  rechazos: 30  },
    { anio: 2026, mes: 2, materialNombre: 'Aluminio',      ingresado: 380,  vendido: 360,  rechazos: 20  },
    { anio: 2026, mes: 2, materialNombre: 'Periódico',     ingresado: 200,  vendido: 190,  rechazos: 10  },
    { anio: 2026, mes: 2, materialNombre: 'Tetra Pack',    ingresado: 150,  vendido: 100,  rechazos: 50  },
    // Enero 2026
    { anio: 2026, mes: 1, materialNombre: 'Cartón',        ingresado: 1650, vendido: 1540, rechazos: 110 },
    { anio: 2026, mes: 1, materialNombre: 'Archivo',       ingresado: 870,  vendido: 820,  rechazos: 50  },
    { anio: 2026, mes: 1, materialNombre: 'PET',           ingresado: 580,  vendido: 540,  rechazos: 40  },
    { anio: 2026, mes: 1, materialNombre: 'Aluminio',      ingresado: 350,  vendido: 330,  rechazos: 20  },
  ];
 
  for (const b of balancesData) {
    const mat = materiales.find((m) => m.nombre === b.materialNombre);
    if (mat) {
      await prisma.balanceMes.create({
        data: {
          anio: b.anio,
          mes: b.mes,
          materialId: mat.id,
          ingresado: b.ingresado,
          vendido: b.vendido,
          rechazos: b.rechazos,
          cerrado: b.mes < now.getMonth() + 1 || b.anio < now.getFullYear(),
        },
      });
    }
  }
 
  console.log('✅ Balances creados');

  // ─── Reportes SUI ─────────────────────────────────────────────────────────
  await prisma.reporteSUI.create({
    data: {
      periodo: '2026-02',
      anio: 2026,
      mes: 2,
      estado: 'enviado',
      fechaEnvio: new Date('2026-03-05'),
      operadorId: operador.id,
      registro13: {
        materialAprovechado: 4200,
        rechazos: 320,
        numRecicladores: 12,
        ecaRegistrada: true,
        numRutas: 6,
        periodoInicio: '2026-02-01',
        periodoFin: '2026-02-28',
      },
      registro14: {
        totalLiquidado: 2840000,
        recicladoresConIngresos: 12,
        totalRecicladores: 12,
        tasaAprovechamiento: 674,
        promedioPorReciclador: 236667,
        quejas: 0,
      },
    },
  });

  await prisma.reporteSUI.create({
    data: {
      periodo: '2026-01',
      anio: 2026,
      mes: 1,
      estado: 'validado',
      fechaEnvio: new Date('2026-02-03'),
      operadorId: operador.id,
      registro13: {
        materialAprovechado: 3800,
        rechazos: 280,
        numRecicladores: 12,
        ecaRegistrada: true,
        numRutas: 6,
        periodoInicio: '2026-01-01',
        periodoFin: '2026-01-31',
      },
      registro14: {
        totalLiquidado: 2560000,
        recicladoresConIngresos: 12,
        totalRecicladores: 12,
        tasaAprovechamiento: 674,
        promedioPorReciclador: 213333,
        quejas: 1,
      },
    },
  });

  console.log('✅ Reportes SUI creados');

  // ─── PQRs ─────────────────────────────────────────────────────────────────
  const pqrsData = [
    {
      radicado: 'PQR-2026-0001',
      tipo: 'Peticion',
      estado: 'EnTramite',
      canal: 'web',
      nombreSolicitante: 'Luis Gómez',
      emailSolicitante: 'lgomez@email.com',
      telefonoSolicitante: '3001234567',
      descripcion: 'Solicito información sobre el proceso de afiliación de recicladores nuevos en la ruta R-03.',
      fechaLimite: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
    },
    {
      radicado: 'PQR-2026-0002',
      tipo: 'Queja',
      estado: 'Respondida',
      canal: 'email',
      nombreSolicitante: 'Comunidad Chapinero',
      emailSolicitante: 'junta@chapinero.co',
      descripcion: 'El horario de recolección en el barrio no se cumple los días martes.',
      respuesta: 'Se ha ajustado el cronograma. El reciclador asignado ahora cumplirá el horario acordado de 8am-11am.',
      fechaLimite: new Date('2026-03-10'),
      fechaCierre: new Date('2026-03-08'),
    },
    {
      radicado: 'PQR-2026-0003',
      tipo: 'Reclamo',
      estado: 'EnTramite',
      canal: 'presencial',
      nombreSolicitante: 'Pedro Herrera',
      emailSolicitante: 'pedro.h@gmail.com',
      telefonoSolicitante: '3109876543',
      descripcion: 'El material entregado en la ECA el 15 de marzo no fue pesado correctamente. Se me registraron 45 kg pero entregué aproximadamente 80 kg.',
      fechaLimite: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    },
    {
      radicado: 'PQR-2026-0004',
      tipo: 'Peticion',
      estado: 'Cerrada',
      canal: 'telefono',
      nombreSolicitante: 'Ana Rodríguez',
      telefonoSolicitante: '3156789012',
      descripcion: 'Solicito copia del reporte de pesaje de los últimos 3 meses para presentar a la secretaría.',
      respuesta: 'Los reportes solicitados han sido enviados al correo registrado en nuestra base de datos.',
      fechaLimite: new Date('2026-03-01'),
      fechaCierre: new Date('2026-02-28'),
    },
  ];

  for (const pqr of pqrsData) {
    await prisma.pQR.create({
      data: { ...pqr, operadorId: operador.id },
    });
  }

  console.log('✅ PQRs creadas');

  console.log('\n🎉 Seed completado exitosamente!');
  console.log('\n📋 Credenciales de acceso:');
  console.log('  Admin:    admin@asociacion-bogota.co  / Admin2024!');
  console.log('  Operador: operador@eca-bogota.co      / Operador2024!');
  console.log('  Reciclador 1: jluis@recicladores.co  / Recicla2024!');
  console.log('  Reciclador 2: aperez@recicladores.co / Recicla2024!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });