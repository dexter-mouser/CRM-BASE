// Reglas de negocio de Clientes. La deuda sale de las ventas a "Crédito" menos las devoluciones y los abonos registrados en Pagos.
// Ventas, devoluciones y abonos se relacionan con el cliente por su ID (no por el nombre), así cambiar el nombre no afecta la deuda.
// Cada cliente tiene un cupo de crédito y un plazo en días; cada factura a crédito vence a ese plazo.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { validarCliente } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const METODO_CREDITO = 'Crédito';
const DIA_MS = 86_400_000;

export const buscarCliente = (id) => estado.clientes.find((cliente) => cliente.id === id);

// Cliente fijo de las ventas de mostrador (generico: true): viene elegido en Registrar venta
export const consumidorFinal = () => estado.clientes.find((cliente) => cliente.generico);

export const ventasDeCliente = (cliente) => estado.ventas.filter((venta) => venta.clienteId === cliente.id);

export function deudaDeCliente(cliente) {
  const credito = ventasDeCliente(cliente)
    .filter((venta) => venta.metodo === METODO_CREDITO)
    .reduce((acumulado, venta) => acumulado + venta.total, 0);
  const devuelto = estado.devoluciones
    .filter((devolucion) => devolucion.metodo === METODO_CREDITO && devolucion.clienteId === cliente.id)
    .reduce((acumulado, devolucion) => acumulado + devolucion.total, 0);
  const abonos = estado.pagos
    .filter((pago) => pago.tipo === 'abono' && pago.terceroId === cliente.id)
    .reduce((acumulado, pago) => acumulado + pago.valor, 0);
  return Math.max(0, credito - devuelto - abonos);
}

export const clientesConDeuda = () => estado.clientes.filter((cliente) => deudaDeCliente(cliente) > 0);

// Lo que aún puede comprar a crédito
export const cupoDisponible = (cliente) => Math.max(0, (cliente.limiteCredito ?? 0) - deudaDeCliente(cliente));

// --- Cartera -----------------------------------------------------------------------------------------------
// Fecha de vencimiento de una factura a crédito: su fecha más el plazo con que se vendió
export const vencimientoDe = (venta) => new Date(new Date(venta.fecha).getTime() + (venta.plazoDias ?? 30) * DIA_MS).toISOString();

export const RANGOS_CARTERA = [
  { id: 'corriente', etiqueta: 'Por vencer' },
  { id: 'd30', etiqueta: '1 a 30 días' },
  { id: 'd60', etiqueta: '31 a 60 días' },
  { id: 'd90', etiqueta: '61 a 90 días' },
  { id: 'mas90', etiqueta: 'Más de 90 días' },
];

const rangoPorDias = (diasVencida) => {
  if (diasVencida <= 0) return 'corriente';
  if (diasVencida <= 30) return 'd30';
  if (diasVencida <= 60) return 'd60';
  return diasVencida <= 90 ? 'd90' : 'mas90';
};

// Facturas a crédito con saldo de un cliente. Las devoluciones bajan su propia factura y los abonos se
// aplican primero a la factura más antigua (como se acostumbra al cobrar cartera).
export function facturasPendientes(cliente, ahora = Date.now()) {
  const facturas = ventasDeCliente(cliente)
    .filter((venta) => venta.metodo === METODO_CREDITO)
    .map((venta) => {
      const devuelto = estado.devoluciones.filter((nota) => nota.ventaId === venta.id).reduce((suma, nota) => suma + nota.total, 0);
      return { venta, saldo: venta.total - devuelto };
    })
    .sort((a, b) => new Date(a.venta.fecha) - new Date(b.venta.fecha));
  let abonos = estado.pagos.filter((pago) => pago.tipo === 'abono' && pago.terceroId === cliente.id).reduce((suma, pago) => suma + pago.valor, 0);
  for (const factura of facturas) {
    const aplicado = Math.min(abonos, factura.saldo);
    factura.saldo -= aplicado;
    abonos -= aplicado;
  }
  return facturas.filter((factura) => factura.saldo > 0).map(({ venta, saldo }) => {
    const vence = vencimientoDe(venta);
    const diasVencida = Math.floor((ahora - new Date(vence).getTime()) / DIA_MS);
    return { id: venta.id, fecha: venta.fecha, vence, diasVencida, rango: rangoPorDias(diasVencida), total: venta.total, saldo };
  });
}

// Cartera por antigüedad: una fila por cliente con deuda y el saldo repartido en cada rango
export function carteraPorEdades(ahora = Date.now()) {
  return estado.clientes.map((cliente) => {
    const fila = { id: cliente.id, nombre: cliente.nombre, total: 0, ...Object.fromEntries(RANGOS_CARTERA.map((rango) => [rango.id, 0])) };
    facturasPendientes(cliente, ahora).forEach((factura) => {
      fila[factura.rango] += factura.saldo;
      fila.total += factura.saldo;
    });
    return fila;
  }).filter((fila) => fila.total > 0).sort((a, b) => b.total - a.total);
}

// --- Altas, cambios y bajas --------------------------------------------------------------------------------
// Limpia y valida los datos; ni el nombre ni el documento pueden repetirse entre clientes
function prepararDatos(datos, idActual) {
  const limpios = validarCliente(datos);
  const otros = estado.clientes.filter((cliente) => cliente.id !== idActual);
  if (otros.some((cliente) => normalizar(cliente.nombre) === normalizar(limpios.nombre))) throw new Error(`Ya existe un cliente llamado ${limpios.nombre}`);
  if (limpios.documento && otros.some((cliente) => cliente.documento === limpios.documento && cliente.tipoDocumento === limpios.tipoDocumento)) {
    throw new Error(`Ya existe un cliente con el documento ${limpios.tipoDocumento} ${limpios.documento}`);
  }
  return limpios;
}

export function agregarCliente(datos) {
  exigirPermiso('clientes', 'crear', 'crear clientes');
  const limpios = prepararDatos(datos, null);
  const cliente = { id: siguienteCodigo(estado.clientes.map((existente) => existente.id), 'C', 3), ...limpios, creadoEn: new Date().toISOString() };
  estado.clientes.push(cliente);
  registrarAuditoria('clientes', 'Cliente creado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
  return cliente;
}

// Las ventas anteriores conservan el nombre con el que se hicieron; la deuda sigue al cliente por su ID
export function actualizarCliente(id, datos) {
  exigirPermiso('clientes', 'editar', 'editar clientes');
  const cliente = buscarCliente(id);
  if (!cliente) throw new Error('El cliente no existe');
  const limpios = prepararDatos(datos, id);
  if (cliente.generico && limpios.limiteCredito) throw new Error('El consumidor final no puede tener cupo de crédito');
  if (limpios.limiteCredito !== cliente.limiteCredito) {
    registrarAuditoria('clientes', 'Cupo de crédito cambiado', `${cliente.id} · $ ${cliente.limiteCredito ?? 0} → $ ${limpios.limiteCredito}`);
  }
  Object.assign(cliente, limpios);
  registrarAuditoria('clientes', 'Cliente editado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
}

export function eliminarCliente(id) {
  exigirPermiso('clientes', 'eliminar', 'eliminar clientes');
  const cliente = buscarCliente(id);
  if (!cliente) throw new Error('El cliente no existe');
  if (cliente.generico) throw new Error('El consumidor final no se elimina: es el cliente de las ventas de mostrador');
  const deuda = deudaDeCliente(cliente);
  if (deuda > 0) throw new Error(`${cliente.nombre} tiene una deuda pendiente: registra el abono antes de eliminarlo`);
  estado.clientes = estado.clientes.filter((candidato) => candidato.id !== id);
  registrarAuditoria('clientes', 'Cliente eliminado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
}
