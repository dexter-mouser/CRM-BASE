// Reglas de negocio de Pagos: abonos de clientes con deuda y pagos a proveedores con facturas pendientes.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirEntero, exigirTexto } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { buscarCliente, deudaDeCliente } from './clientes.service.js';
import { saldoConProveedor } from './proveedores.service.js';
import { exigirTiendaActiva, tiendaActiva } from '../core/tienda.js';

// Métodos con los que se puede pagar: los de ventas, sin "Crédito" (que es dejar la deuda pendiente)
export const metodosDePago = () => estado.ajustes.ventas.metodosPago.filter((metodo) => metodo !== 'Crédito');

// Proveedores a los que se les debe algo (facturas de compra menos pagos)
export const proveedoresConSaldo = () => estado.proveedores
  .map((proveedor) => ({ id: proveedor.id, nombre: proveedor.nombre, pendiente: saldoConProveedor(proveedor.id) }))
  .filter((proveedor) => proveedor.pendiente > 0);

function validarComun(valor, metodo) {
  if (!(valor > 0)) throw new Error('Escribe el valor del pago');
  exigirEntero(valor, 'el valor del pago', { minimo: 1 });
  if (!metodosDePago().includes(metodo)) throw new Error('Elige un medio de pago');
}

// El pago queda en la sucursal activa; en efectivo hace falta una tienda concreta porque entra o sale de su caja
function guardarPago(datos) {
  const tienda = datos.metodo === 'Efectivo' ? exigirTiendaActiva('registrar pagos en efectivo') : tiendaActiva();
  const pago = {
    id: siguienteCodigo(estado.pagos.map((existente) => existente.id), 'PG', 4),
    fecha: new Date().toISOString(),
    tiendaId: tienda?.id ?? estado.tiendas[0]?.id ?? '',
    ...datos,
  };
  estado.pagos.push(pago);
  registrarAuditoria('pagos', pago.tipo === 'abono' ? 'Abono registrado' : 'Pago a proveedor', `${pago.id} · ${pago.tercero} · $ ${pago.valor} · ${pago.metodo}`);
  guardarEstado();
  return pago;
}

export function registrarAbono({ clienteId, valor, metodo }) {
  exigirPermiso('pagos', 'crear', 'registrar abonos');
  const cliente = buscarCliente(clienteId);
  if (!cliente) throw new Error('Elige el cliente que abona');
  validarComun(valor, metodo);
  const deuda = deudaDeCliente(cliente);
  if (valor > deuda) throw new Error(`El abono no puede superar la deuda de ${cliente.nombre}`);
  return guardarPago({ tipo: 'abono', terceroId: cliente.id, tercero: cliente.nombre, concepto: 'Abono a deuda', metodo, valor });
}

export function registrarPagoProveedor({ proveedorId, concepto, valor, metodo }) {
  exigirPermiso('pagos', 'crear', 'registrar pagos a proveedores');
  const saldo = proveedoresConSaldo().find((candidato) => candidato.id === proveedorId);
  if (!saldo) throw new Error('Elige el proveedor al que le pagas');
  validarComun(valor, metodo);
  if (valor > saldo.pendiente) throw new Error(`El pago no puede superar lo pendiente con ${saldo.nombre}`);
  return guardarPago({ tipo: 'proveedor', terceroId: saldo.id, tercero: saldo.nombre, concepto: exigirTexto(concepto, 'el concepto', { obligatorio: false }) || 'Pago de facturas', metodo, valor });
}
