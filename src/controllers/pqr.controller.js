const c = require('./combined.controller');
module.exports = {
  listar: c.listarPQR, estadisticas: c.estadisticasPQR, obtener: c.obtenerPQR,
  crear: c.crearPQR, responder: c.responderPQR, cerrar: c.cerrarPQR,
};
