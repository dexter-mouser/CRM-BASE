// Reglas de negocio de Pagos: abonos de clientes con deuda y pagos a proveedores con facturas pendientes.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirEntero, exigirTexto } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { buscarCliente, deudaDeCliente } from './clientes.service.js';
import { saldoConProveedor } from './proveedores.service.js';
import { exigirTiendaActiva } from '../core/tienda.js';
import { activos, nombreDe } from './catalogos.service.js';

// Medios con los que se puede pagar: los activos que no son a crédito (crédito es dejar la deuda pendiente)
export const metodosDePago = () => activos('metodosPago').filter((metodo) => metodo.tipo !== 'credito').map((metodo) => [metodo.id, metodo.nombre]);

// Proveedores a los que se les debe algo (facturas de compra menos pagos)
export const proveedoresConSaldo = () => estado.proveedores
  .map((proveedor) => ({ id: proveedor.id, nombre: proveedor.nombre, pendiente: saldoConProveedor(proveedor.id) }))
  .filter((proveedor) => proveedor.pendiente > 0);

function validarComun(valor, metodoId) {
  if (!(valor > 0)) throw new Error('Escribe el valor del pago');
  exigirEntero(valor, 'el valor del pago', { minimo: 1 });
  if (!metodosDePago().some(([id]) => id === metodoId)) throw new Error('Elige un medio de pago');
}

// El pago queda en la sucursal activa (en efectivo entra o sale de su caja): hace falta elegir una
function guardarPago(datos) {
  const tienda = exigirTiendaActiva('registrar pagos');
  const pago = {
    id: siguienteCodigo(estado.pagos.map((existente) => existente.id), 'PG', 4),
    fecha: new Date().toISOString(),
    tiendaId: tienda.id,
    ...datos,
    metodo: nombreDe('metodosPago', datos.metodoId),
  };
  estado.pagos.push(pago);
  registrarAuditoria('pagos', pago.tipo === 'abono' ? 'Abono registrado' : 'Pago a proveedor', `${pago.id} · ${pago.tercero} · $ ${pago.valor} · ${pago.metodo}`);
  guardarEstado();
  return pago;
}

export function registrarAbono({ clienteId, valor, metodoId }) {
  exigirPermiso('pagos', 'crear', 'registrar abonos');
  const cliente = buscarCliente(clienteId);
  if (!cliente) throw new Error('Elige el cliente que abona');
  validarComun(valor, metodoId);
  const deuda = deudaDeCliente(cliente);
  if (valor > deuda) throw new Error(`El abono no puede superar la deuda de ${cliente.nombre}`);
  return guardarPago({ tipo: 'abono', terceroId: cliente.id, tercero: cliente.nombre, concepto: 'Abono a deuda', metodoId, valor });
}

export function registrarPagoProveedor({ proveedorId, concepto, valor, metodoId }) {
  exigirPermiso('pagos', 'crear', 'registrar pagos a proveedores');
  const saldo = proveedoresConSaldo().find((candidato) => candidato.id === proveedorId);
  if (!saldo) throw new Error('Elige el proveedor al que le pagas');
  validarComun(valor, metodoId);
  if (valor > saldo.pendiente) throw new Error(`El pago no puede superar lo pendiente con ${saldo.nombre}`);
  return guardarPago({ tipo: 'proveedor', terceroId: saldo.id, tercero: saldo.nombre, concepto: exigirTexto(concepto, 'el concepto'), metodoId, valor });
}
