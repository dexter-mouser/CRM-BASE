// Proveedores y órdenes de compra. Una orden de compra se envía al proveedor y, cuando llega la mercancía,
// se recibe ingresando su factura de compra en Inventario (la orden queda "recibida").
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso, nombreDeUsuario } from '../core/autorizacion.js';
import { exigirMotivo, exigirTexto, validarLineas, validarProveedor, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const ESTADOS_ORDEN = { abierta: 'Abierta', recibida: 'Recibida', anulada: 'Anulada' };

export const buscarProveedor = (id) => estado.proveedores.find((proveedor) => proveedor.id === id);
export const buscarOrden = (id) => estado.ordenesCompra.find((orden) => orden.id === id);

const facturasDe = (proveedorId) => estado.facturas.filter((factura) => factura.proveedorId === proveedorId);
const pagosA = (proveedorId) => estado.pagos.filter((pago) => pago.tipo === 'proveedor' && pago.terceroId === proveedorId);

// Lo que se le debe a un proveedor: facturas de compra menos pagos
export const saldoConProveedor = (proveedorId) => Math.max(0,
  facturasDe(proveedorId).reduce((suma, factura) => suma + factura.total, 0) - pagosA(proveedorId).reduce((suma, pago) => suma + pago.valor, 0));

function prepararDatos(datos, idActual) {
  const limpios = validarProveedor(datos);
  const otros = estado.proveedores.filter((proveedor) => proveedor.id !== idActual);
  if (otros.some((proveedor) => normalizar(proveedor.nombre) === normalizar(limpios.nombre))) throw new Error(`Ya existe un proveedor llamado ${limpios.nombre}`);
  if (limpios.nit && otros.some((proveedor) => proveedor.nit === limpios.nit)) throw new Error(`Ya existe un proveedor con el NIT ${limpios.nit}`);
  return limpios;
}

export function agregarProveedor(datos) {
  exigirPermiso('proveedores', 'crear', 'crear proveedores');
  const proveedor = { id: siguienteCodigo(estado.proveedores.map((existente) => existente.id), 'PV', 3), ...prepararDatos(datos, null) };
  estado.proveedores.push(proveedor);
  registrarAuditoria('proveedores', 'Proveedor creado', `${proveedor.id} · ${proveedor.nombre}`);
  guardarEstado();
  return proveedor;
}

// El nombre se actualiza también en sus facturas y pagos para que los listados coincidan
export function actualizarProveedor(id, datos) {
  exigirPermiso('proveedores', 'editar', 'editar proveedores');
  const proveedor = buscarProveedor(id);
  if (!proveedor) throw new Error('El proveedor no existe');
  Object.assign(proveedor, prepararDatos(datos, id));
  facturasDe(id).forEach((factura) => { factura.proveedor = proveedor.nombre; });
  pagosA(id).forEach((pago) => { pago.tercero = proveedor.nombre; });
  registrarAuditoria('proveedores', 'Proveedor editado', `${proveedor.id} · ${proveedor.nombre}`);
  guardarEstado();
}

export function eliminarProveedor(id) {
  exigirPermiso('proveedores', 'eliminar', 'eliminar proveedores');
  const proveedor = buscarProveedor(id);
  if (!proveedor) throw new Error('El proveedor no existe');
  if (facturasDe(id).length || estado.ordenesCompra.some((orden) => orden.proveedorId === id)) {
    throw new Error(`${proveedor.nombre} tiene facturas u órdenes de compra: no se puede eliminar`);
  }
  estado.proveedores = estado.proveedores.filter((candidato) => candidato.id !== id);
  registrarAuditoria('proveedores', 'Proveedor eliminado', `${proveedor.id} · ${proveedor.nombre}`);
  guardarEstado();
}

// --- Órdenes de compra -------------------------------------------------------------------------------------
export function registrarOrden({ proveedorId, lineas, observaciones = '' }) {
  exigirPermiso('proveedores', 'crear', 'crear órdenes de compra');
  const proveedor = buscarProveedor(proveedorId);
  if (!proveedor) throw new Error('Elige el proveedor de la orden');
  validarLineas(lineas, 'costoUnitario', 'el costo unitario');
  const items = lineas.map(({ productoId, nombre, cantidad, costoUnitario }) => ({ productoId, nombre, cantidad, costoUnitario }));
  const orden = {
    id: siguienteCodigo(estado.ordenesCompra.map((existente) => existente.id), 'OC', 4),
    proveedorId: proveedor.id,
    proveedor: proveedor.nombre,
    fecha: new Date().toISOString(),
    usuario: nombreDeUsuario(),
    observaciones: exigirTexto(observaciones, 'las observaciones', { obligatorio: false, maximo: LIMITES.textoLargo }),
    estado: 'abierta',
    facturaNumero: '',
    items,
    total: items.reduce((suma, item) => suma + item.cantidad * item.costoUnitario, 0),
  };
  estado.ordenesCompra.push(orden);
  registrarAuditoria('proveedores', 'Orden de compra creada', `${orden.id} · ${orden.proveedor} · $ ${orden.total}`);
  guardarEstado();
  return orden;
}

export function anularOrden(id, motivo) {
  exigirPermiso('proveedores', 'eliminar', 'anular órdenes de compra');
  const orden = buscarOrden(id);
  if (!orden) throw new Error('La orden no existe');
  if (orden.estado !== 'abierta') throw new Error(`La orden ${id} ya está ${ESTADOS_ORDEN[orden.estado].toLowerCase()}`);
  orden.estado = 'anulada';
  orden.motivoAnulacion = exigirMotivo(motivo);
  registrarAuditoria('proveedores', 'Orden de compra anulada', `${id} · ${orden.motivoAnulacion}`);
  guardarEstado();
}
