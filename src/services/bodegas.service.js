// Bodegas y traslados. Cada tienda vende y recibe en su bodega; puede haber bodegas centrales sin tienda.
// Un traslado sale de la bodega de origen al enviarlo (queda "en tránsito") y entra a la de destino al recibirlo.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso, nombreDeUsuario } from '../core/autorizacion.js';
import { exigirMotivo, exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { prefijoDe } from './catalogos.service.js';
import { buscarBodega, buscarProductoPorId, existenciasEn, moverExistencias } from './inventario.service.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const ESTADOS_TRASLADO = { enviado: 'En tránsito', recibido: 'Recibido', anulado: 'Anulado' };

export const bodegasActivas = () => estado.bodegas.filter((bodega) => bodega.activa);

// Unidades y valor (al costo) que hay en una bodega
export function resumenDeBodega(bodegaId) {
  return estado.productos.reduce((resumen, producto) => {
    const cantidad = existenciasEn(producto, bodegaId);
    resumen.unidades += cantidad;
    resumen.valor += Math.max(0, cantidad) * producto.costo;
    if (cantidad !== 0) resumen.productos += 1;
    return resumen;
  }, { unidades: 0, valor: 0, productos: 0 });
}

function prepararBodega(datos, idActual) {
  const limpios = {
    nombre: exigirTexto(datos.nombre, 'el nombre de la bodega', { maximo: 60 }),
    tiendaId: datos.tiendaId && estado.tiendas.some((tienda) => tienda.id === datos.tiendaId) ? datos.tiendaId : '',
    direccion: exigirTexto(datos.direccion, 'la dirección', { obligatorio: false, maximo: LIMITES.textoLargo }),
  };
  if (estado.bodegas.some((bodega) => bodega.id !== idActual && normalizar(bodega.nombre) === normalizar(limpios.nombre))) {
    throw new Error(`Ya existe una bodega llamada ${limpios.nombre}`);
  }
  return limpios;
}

export function agregarBodega(datos) {
  exigirPermiso('bodegas', 'crear', 'crear bodegas');
  const bodega = { id: siguienteCodigo(estado.bodegas.map((existente) => existente.id), 'B', 2), ...prepararBodega(datos, null), activa: true };
  estado.bodegas.push(bodega);
  registrarAuditoria('bodegas', 'Bodega creada', `${bodega.id} · ${bodega.nombre}`);
  guardarEstado();
  return bodega;
}

export function actualizarBodega(id, datos) {
  exigirPermiso('bodegas', 'editar', 'editar bodegas');
  const bodega = buscarBodega(id);
  if (!bodega) throw new Error('La bodega no existe');
  Object.assign(bodega, prepararBodega(datos, id));
  registrarAuditoria('bodegas', 'Bodega editada', `${bodega.id} · ${bodega.nombre}`);
  guardarEstado();
}

// Una bodega con stock, traslados en tránsito o que sea la de una tienda no se desactiva
export function cambiarEstadoBodega(id, activa) {
  exigirPermiso('bodegas', 'editar', 'activar o desactivar bodegas');
  const bodega = buscarBodega(id);
  if (!bodega) throw new Error('La bodega no existe');
  if (!activa) {
    if (estado.tiendas.some((tienda) => tienda.activa && tienda.bodegaId === id)) throw new Error(`${bodega.nombre} es la bodega de una sucursal activa: cámbiala en Tiendas antes`);
    if (resumenDeBodega(id).productos) throw new Error(`${bodega.nombre} todavía tiene stock: trasládalo antes de desactivarla`);
    if (estado.traslados.some((traslado) => traslado.estado === 'enviado' && traslado.destinoId === id)) throw new Error(`${bodega.nombre} tiene traslados por recibir`);
  }
  bodega.activa = Boolean(activa);
  registrarAuditoria('bodegas', activa ? 'Bodega activada' : 'Bodega desactivada', bodega.nombre);
  guardarEstado();
}

// --- Traslados ---------------------------------------------------------------------------------------------
export function enviarTraslado({ origenId, destinoId, lineas, observaciones = '' }) {
  exigirPermiso('bodegas', 'crear', 'trasladar mercancía');
  const origen = buscarBodega(origenId), destino = buscarBodega(destinoId);
  if (!origen?.activa) throw new Error('Elige la bodega de origen');
  if (!destino?.activa) throw new Error('Elige la bodega de destino');
  if (origen.id === destino.id) throw new Error('El origen y el destino deben ser bodegas distintas');
  if (!lineas.length) throw new Error('Agrega al menos un producto al traslado');
  for (const linea of lineas) {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) throw new Error(`La cantidad de ${linea.nombre} debe ser al menos 1`);
    const disponible = existenciasEn(buscarProductoPorId(linea.productoId), origen.id);
    if (linea.cantidad > disponible) throw new Error(`En ${origen.nombre} solo hay ${disponible} de ${linea.nombre}`);
  }
  const traslado = {
    id: siguienteCodigo(estado.traslados.map((existente) => existente.id), prefijoDe('traslado'), 4),
    fecha: new Date().toISOString(),
    origenId: origen.id,
    destinoId: destino.id,
    usuario: nombreDeUsuario(),
    observaciones: exigirTexto(observaciones, 'las observaciones', { obligatorio: false, maximo: LIMITES.textoLargo }),
    estado: 'enviado',
    items: lineas.map(({ productoId, nombre, cantidad }) => ({ productoId, nombre, cantidad })),
  };
  traslado.items.forEach((item) => moverExistencias(buscarProductoPorId(item.productoId), -item.cantidad, origen.id));
  estado.traslados.push(traslado);
  registrarAuditoria('bodegas', 'Traslado enviado', `${traslado.id} · ${origen.nombre} → ${destino.nombre}`);
  guardarEstado();
  return traslado;
}

const buscarTraslado = (id) => {
  const traslado = estado.traslados.find((candidato) => candidato.id === id);
  if (!traslado) throw new Error('El traslado no existe');
  if (traslado.estado !== 'enviado') throw new Error(`El traslado ${id} ya está ${ESTADOS_TRASLADO[traslado.estado].toLowerCase()}`);
  return traslado;
};

export function recibirTraslado(id) {
  exigirPermiso('bodegas', 'editar', 'recibir traslados');
  const traslado = buscarTraslado(id);
  traslado.items.forEach((item) => moverExistencias(buscarProductoPorId(item.productoId), item.cantidad, traslado.destinoId));
  traslado.estado = 'recibido';
  traslado.recibidoEn = new Date().toISOString();
  traslado.recibidoPor = nombreDeUsuario();
  registrarAuditoria('bodegas', 'Traslado recibido', `${traslado.id} · ${buscarBodega(traslado.destinoId).nombre}`);
  guardarEstado();
  return traslado;
}

// Un traslado en tránsito se puede anular: la mercancía vuelve a la bodega de origen
export function anularTraslado(id, motivo) {
  exigirPermiso('bodegas', 'eliminar', 'anular traslados');
  const traslado = buscarTraslado(id);
  const motivoLimpio = exigirMotivo(motivo);
  traslado.items.forEach((item) => moverExistencias(buscarProductoPorId(item.productoId), item.cantidad, traslado.origenId));
  traslado.estado = 'anulado';
  traslado.anuladoEn = new Date().toISOString();
  traslado.motivoAnulacion = motivoLimpio;
  registrarAuditoria('bodegas', 'Traslado anulado', `${traslado.id} · ${motivoLimpio}`);
  guardarEstado();
}
