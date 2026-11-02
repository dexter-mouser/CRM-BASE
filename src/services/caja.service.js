// Reglas de negocio de Caja: apertura con base, ingresos y egresos, y cierre con diferencia.
// Efectivo esperado = base + ventas en efectivo + abonos en efectivo + ingresos - egresos - pagos a proveedores en efectivo - devoluciones en efectivo.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirEntero, exigirTexto } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { exigirTiendaActiva, tiendaActivaId, TODAS_LAS_TIENDAS } from '../core/tienda.js';
import { nombreDeUsuario } from '../core/autorizacion.js';

// Cada tienda tiene su propia caja. Sin tienda indicada se usa la sucursal activa.
const tiendaDe = (registro) => registro.tiendaId ?? 'T-01';
export const cajaAbierta = (tiendaId = tiendaActivaId()) => estado.cajas.find((caja) => !caja.cierre && tiendaDe(caja) === tiendaId) ?? null;
export const cajasDeLaVista = () => estado.cajas.filter((caja) => tiendaActivaId() === TODAS_LAS_TIENDAS || tiendaDe(caja) === tiendaActivaId());

const sumar = (lista, campo = 'valor') => lista.reduce((acumulado, elemento) => acumulado + elemento[campo], 0);

// Movimientos de una caja: todo lo ocurrido desde su apertura (y hasta su cierre, si ya se cerró)
export function resumenDeCaja(caja) {
  const desde = new Date(caja.apertura).getTime();
  const hasta = caja.cierre ? new Date(caja.cierre.fecha).getTime() : Infinity;
  // Solo cuenta lo de la tienda de la caja, ocurrido entre su apertura y su cierre
  const dentro = (fecha, registro) => {
    const momento = new Date(fecha).getTime();
    return momento >= desde && momento <= hasta && tiendaDe(registro) === tiendaDe(caja);
  };
  const efectivo = (elemento) => elemento.metodo === 'Efectivo';
  const ventasEfectivo = sumar(estado.ventas.filter((venta) => efectivo(venta) && dentro(venta.fecha, venta)), 'total');
  const abonosEfectivo = sumar(estado.pagos.filter((pago) => pago.tipo === 'abono' && efectivo(pago) && dentro(pago.fecha, pago)));
  const pagosProveedores = sumar(estado.pagos.filter((pago) => pago.tipo === 'proveedor' && efectivo(pago) && dentro(pago.fecha, pago)));
  const movimientos = estado.movimientosCaja.filter((movimiento) => movimiento.cajaId === caja.id);
  const reembolsos = sumar(estado.devoluciones.filter((devolucion) => efectivo(devolucion) && dentro(devolucion.fecha, devolucion)), 'total');
  const ingresos = sumar(movimientos.filter((movimiento) => movimiento.tipo === 'ingreso'));
  const egresos = sumar(movimientos.filter((movimiento) => movimiento.tipo === 'egreso'));
  return {
    base: caja.base,
    ventasEfectivo,
    abonosEfectivo,
    ingresos,
    egresos,
    pagosProveedores,
    reembolsos,
    esperado: caja.base + ventasEfectivo + abonosEfectivo + ingresos - egresos - pagosProveedores - reembolsos,
    movimientos,
  };
}

// Efectivo esperado en la caja abierta de la sucursal activa, o la suma de todas si se ven todas las tiendas
export function efectivoEnCaja() {
  if (tiendaActivaId() === TODAS_LAS_TIENDAS) return estado.cajas.filter((caja) => !caja.cierre).reduce((suma, caja) => suma + resumenDeCaja(caja).esperado, 0);
  const caja = cajaAbierta();
  return caja ? resumenDeCaja(caja).esperado : 0;
}

export function abrirCaja(base) {
  exigirPermiso('caja', 'crear', 'abrir la caja');
  const tienda = exigirTiendaActiva('abrir la caja');
  if (cajaAbierta(tienda.id)) throw new Error(`La caja de ${tienda.nombre} ya está abierta`);
  if (!Number.isInteger(base)) throw new Error('Escribe la base con la que abres la caja (puede ser 0)');
  exigirEntero(base, 'la base');
  const caja = {
    id: siguienteCodigo(estado.cajas.map((existente) => existente.id), 'K', 3),
    tiendaId: tienda.id,
    usuario: nombreDeUsuario(),
    apertura: new Date().toISOString(),
    base,
    cierre: null,
  };
  estado.cajas.push(caja);
  registrarAuditoria('caja', 'Caja abierta', `${caja.id} · ${tienda.nombre} · base $ ${base}`);
  guardarEstado();
  return caja;
}

export function registrarMovimiento({ tipo, concepto, valor }) {
  exigirPermiso('caja', 'crear', 'registrar movimientos de caja');
  const caja = cajaAbierta(exigirTiendaActiva('registrar movimientos de caja').id);
  if (!caja) throw new Error('Abre la caja antes de registrar movimientos');
  if (!['ingreso', 'egreso'].includes(tipo)) throw new Error('Elige si es un ingreso o un egreso');
  const conceptoLimpio = exigirTexto(concepto, 'el concepto del movimiento');
  if (!(valor > 0)) throw new Error('Escribe el valor del movimiento');
  exigirEntero(valor, 'el valor del movimiento', { minimo: 1 });
  const movimiento = {
    id: siguienteCodigo(estado.movimientosCaja.map((existente) => existente.id), 'M', 4),
    cajaId: caja.id,
    fecha: new Date().toISOString(),
    tipo,
    concepto: conceptoLimpio,
    valor,
  };
  estado.movimientosCaja.push(movimiento);
  registrarAuditoria('caja', tipo === 'ingreso' ? 'Ingreso de caja' : 'Egreso de caja', `${movimiento.id} · ${conceptoLimpio} · $ ${valor}`);
  guardarEstado();
  return movimiento;
}

// Devuelve el cierre con la diferencia entre lo contado y lo esperado (negativa si falta efectivo)
export function cerrarCaja(contado) {
  exigirPermiso('caja', 'crear', 'cerrar la caja');
  const caja = cajaAbierta(exigirTiendaActiva('cerrar la caja').id);
  if (!caja) throw new Error('No hay una caja abierta en esta sucursal');
  if (!(contado >= 0)) throw new Error('Escribe el efectivo que contaste (puede ser 0)');
  const esperado = resumenDeCaja(caja).esperado;
  caja.cierre = { fecha: new Date().toISOString(), contado, esperado, diferencia: contado - esperado };
  registrarAuditoria('caja', 'Caja cerrada', `${caja.id} · esperado $ ${esperado} · contado $ ${contado} · diferencia $ ${contado - esperado}`);
  guardarEstado();
  return caja.cierre;
}
