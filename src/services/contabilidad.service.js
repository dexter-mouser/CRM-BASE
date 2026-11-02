// Contabilidad diaria: cada día pasado se cierra en orden y su resumen queda guardado sin cambios.
// Un día se puede cerrar desde que termina (el día de hoy no se cierra) y solo si no queda una caja abierta.
import { estado, guardarEstado } from '../core/store.js';
import { aFecha, aFechaLocal, fechaDeHoy } from '../core/format.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirMotivo } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

const sumar = (lista, campo) => lista.reduce((acumulado, elemento) => acumulado + elemento[campo], 0);

// Suma o resta días a una fecha "AAAA-MM-DD" en hora local
function sumarDias(dia, cantidad) {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, diaDelMes + cantidad);
  return [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, '0'), String(fecha.getDate()).padStart(2, '0')].join('-');
}

const diaDeAyer = () => sumarDias(fechaDeHoy(), -1);

export const ultimoDiaCerrado = () => estado.contabilidad.reduce((mayor, cierre) => (cierre.dia > mayor ? cierre.dia : mayor), '');

// Resumen de lo ocurrido en un día; el costo usa el costo del producto al momento de calcularlo
export function resumenDelDia(dia) {
  const ventas = estado.ventas.filter((venta) => aFechaLocal(venta.fecha) === dia);
  const costoDe = (productoId) => estado.productos.find((producto) => producto.id === productoId)?.costo ?? 0;
  const totalVentas = sumar(ventas, 'total');
  const costoVendido = ventas.reduce((acumulado, venta) =>
    acumulado + venta.items.reduce((subtotal, item) => subtotal + item.cantidad * costoDe(item.productoId), 0), 0);
  const pagos = estado.pagos.filter((pago) => aFechaLocal(pago.fecha) === dia);
  const devoluciones = estado.devoluciones.filter((devolucion) => aFechaLocal(devolucion.fecha) === dia);
  const totalDevuelto = sumar(devoluciones, 'total');
  const costoDevuelto = devoluciones.reduce((acumulado, devolucion) =>
    acumulado + devolucion.items.reduce((subtotal, item) => subtotal + item.cantidad * costoDe(item.productoId), 0), 0);
  const movimientos = estado.movimientosCaja.filter((movimiento) => aFechaLocal(movimiento.fecha) === dia);
  const cierresDeCaja = estado.cajas.filter((caja) => caja.cierre && aFechaLocal(caja.cierre.fecha) === dia);
  return {
    cantidadVentas: ventas.length,
    totalVentas,
    costoVendido,
    devoluciones: totalDevuelto,
    utilidad: totalVentas - totalDevuelto - (costoVendido - costoDevuelto),
    ventasCredito: sumar(ventas.filter((venta) => venta.metodo === 'Crédito'), 'total')
      - sumar(devoluciones.filter((devolucion) => devolucion.metodo === 'Crédito'), 'total'),
    abonosClientes: sumar(pagos.filter((pago) => pago.tipo === 'abono'), 'valor'),
    pagosProveedores: sumar(pagos.filter((pago) => pago.tipo === 'proveedor'), 'valor'),
    comprasFacturadas: sumar(estado.facturas.filter((factura) => factura.fecha === dia), 'total'),
    ingresosCaja: sumar(movimientos.filter((movimiento) => movimiento.tipo === 'ingreso'), 'valor'),
    egresosCaja: sumar(movimientos.filter((movimiento) => movimiento.tipo === 'egreso'), 'valor'),
    diferenciaCaja: cierresDeCaja.reduce((acumulado, caja) => acumulado + caja.cierre.diferencia, 0),
  };
}

function primerDiaConMovimientos() {
  const dias = [
    ...estado.ventas.map((venta) => aFechaLocal(venta.fecha)),
    ...estado.pagos.map((pago) => aFechaLocal(pago.fecha)),
    ...estado.movimientosCaja.map((movimiento) => aFechaLocal(movimiento.fecha)),
    ...estado.devoluciones.map((devolucion) => aFechaLocal(devolucion.fecha)),
    ...estado.cajas.map((caja) => aFechaLocal(caja.apertura)),
    ...estado.facturas.map((factura) => factura.fecha),
  ];
  return dias.length ? dias.reduce((menor, dia) => (dia < menor ? dia : menor)) : null;
}

// Días por cerrar, del más antiguo al de ayer
export function diasPendientes() {
  const ultimo = ultimoDiaCerrado();
  const inicio = ultimo ? sumarDias(ultimo, 1) : primerDiaConMovimientos();
  const ayer = diaDeAyer();
  const pendientes = [];
  if (!inicio) return pendientes;
  for (let dia = inicio; dia <= ayer; dia = sumarDias(dia, 1)) pendientes.push(dia);
  return pendientes;
}

export function cerrarDia(dia) {
  exigirPermiso('contabilidad', 'crear', 'cerrar la contabilidad');
  const pendientes = diasPendientes();
  if (!pendientes.includes(dia)) throw new Error('Ese día ya está cerrado o todavía no ha terminado');
  if (dia !== pendientes[0]) throw new Error(`Cierra primero el día ${aFecha(pendientes[0])}`);
  const cajaAbierta = estado.cajas.find((caja) => !caja.cierre && aFechaLocal(caja.apertura) <= dia);
  if (cajaAbierta) throw new Error(`Cierra la caja abierta el ${aFecha(aFechaLocal(cajaAbierta.apertura))} antes de cerrar la contabilidad`);
  const cierre = { dia, cerradoEn: new Date().toISOString(), ...resumenDelDia(dia) };
  estado.contabilidad.push(cierre);
  registrarAuditoria('contabilidad', 'Día cerrado', `${dia} · ventas $ ${cierre.totalVentas} · devoluciones $ ${cierre.devoluciones}`);
  guardarEstado();
  return cierre;
}

// Cierra en orden todos los días pendientes y devuelve cuántos cerró; se detiene en el primero que no se pueda cerrar
export function cerrarDiasPendientes() {
  let cerrados = 0;
  for (const dia of diasPendientes()) {
    try {
      cerrarDia(dia);
      cerrados++;
    } catch (error) {
      if (!cerrados) throw error;
      break;
    }
  }
  return cerrados;
}

// Permiso especial: solo se reabre el último día cerrado (así los cierres siguen en orden), con motivo y auditoría
export function reabrirUltimoDia(motivo) {
  exigirPermiso('contabilidad', 'reabrir', 'reabrir la contabilidad');
  const dia = ultimoDiaCerrado();
  if (!dia) throw new Error('No hay días cerrados para reabrir');
  const motivoLimpio = exigirMotivo(motivo);
  const cierre = estado.contabilidad.find((candidato) => candidato.dia === dia);
  estado.contabilidad = estado.contabilidad.filter((candidato) => candidato.dia !== dia);
  registrarAuditoria('contabilidad', 'Día reabierto', `${dia} · ventas $ ${cierre.totalVentas} · motivo: ${motivoLimpio}`);
  guardarEstado();
  return dia;
}
