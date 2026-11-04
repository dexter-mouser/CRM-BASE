// Reportes: cálculos de solo lectura sobre ventas, inventario y deudas.
import { estado } from '../core/store.js';
import { aFechaLocal } from '../core/format.js';
import { clientesConDeuda, deudaDeCliente } from './clientes.service.js';
import { estaAnulada } from './ventas.service.js';
import { productosBajoMinimo } from './inventario.service.js';
import { cotizaciones, resumenDelEmbudo } from './embudo.service.js';
import { enTiendaActiva } from '../core/tienda.js';
import { nombreDe, parametro } from './catalogos.service.js';


// Ventas cuya fecha local está entre "desde" y "hasta" (ambas incluidas, formato AAAA-MM-DD)
// Solo las de la sucursal activa (o de todas si se ven todas las tiendas)
export const ventasEntre = (desde, hasta) =>
  estado.ventas.filter((venta) => {
    const dia = aFechaLocal(venta.fecha);
    return dia >= desde && dia <= hasta && enTiendaActiva(venta);
  });

// Devoluciones y anulaciones registradas entre dos fechas; restan de las ventas del día en que se hicieron
const devolucionesEntre = (desde, hasta) =>
  estado.devoluciones.filter((devolucion) => {
    const dia = aFechaLocal(devolucion.fecha);
    return dia >= desde && dia <= hasta && enTiendaActiva(devolucion);
  });

// Ventas del rango menos lo devuelto en el rango
export const totalNetoEntre = (desde, hasta) =>
  ventasEntre(desde, hasta).reduce((acumulado, venta) => acumulado + venta.total, 0)
  - devolucionesEntre(desde, hasta).reduce((acumulado, devolucion) => acumulado + devolucion.total, 0);

// La utilidad usa el costo actual del producto, porque las ventas no guardan el costo del momento
export function reporteDeVentas(desde, hasta) {
  const ventas = ventasEntre(desde, hasta);
  const devoluciones = devolucionesEntre(desde, hasta);
  const devuelto = devoluciones.reduce((acumulado, devolucion) => acumulado + devolucion.total, 0);
  const total = ventas.reduce((acumulado, venta) => acumulado + venta.total, 0) - devuelto;
  const cantidad = ventas.filter((venta) => !estaAnulada(venta)).length;
  const costoDe = (productoId) => estado.productos.find((producto) => producto.id === productoId)?.costo ?? 0;

  const porMetodo = new Map();
  const porProducto = new Map();
  let utilidad = 0;
  for (const venta of ventas) {
    porMetodo.set(venta.metodoId, (porMetodo.get(venta.metodoId) ?? 0) + venta.total);
    for (const item of venta.items) {
      const ingreso = item.total;
      utilidad += ingreso - item.cantidad * costoDe(item.productoId);
      const anterior = porProducto.get(item.productoId) ?? { id: item.productoId, nombre: item.nombre, cantidad: 0, total: 0 };
      anterior.cantidad += item.cantidad;
      anterior.total += ingreso;
      porProducto.set(item.productoId, anterior);
    }
  }
  for (const devolucion of devoluciones) {
    porMetodo.set(devolucion.metodoId, (porMetodo.get(devolucion.metodoId) ?? 0) - devolucion.total);
    for (const item of devolucion.items) {
      const ingreso = item.total;
      utilidad -= ingreso - item.cantidad * costoDe(item.productoId);
      const anterior = porProducto.get(item.productoId);
      if (anterior) {
        anterior.cantidad -= item.cantidad;
        anterior.total -= ingreso;
      }
    }
  }
  return {
    ventas,
    devoluciones,
    devuelto,
    total,
    cantidad,
    ticketPromedio: cantidad ? Math.round(total / cantidad) : 0,
    utilidad,
    porMetodo: [...porMetodo].map(([metodoId, valor]) => ({ metodo: nombreDe('metodosPago', metodoId), valor })).sort((a, b) => b.valor - a.valor),
    masVendidos: [...porProducto.values()].filter((producto) => producto.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5),
  };
}

// Productos en o por debajo de su stock mínimo
export const productosConStockBajo = productosBajoMinimo;

// --- Indicadores de clientes ---------------------------------------------------------------------------------
// Primera compra de cada cliente registrado
const primeraCompra = () => {
  const primeras = new Map();
  estado.ventas.filter((venta) => venta.clienteId).forEach((venta) => {
    const dia = aFechaLocal(venta.fecha);
    if (!primeras.has(venta.clienteId) || dia < primeras.get(venta.clienteId)) primeras.set(venta.clienteId, dia);
  });
  return primeras;
};

// En el rango: clientes que compraron por primera vez (nuevos) y los que ya habían comprado antes (recurrentes)
export function clientesNuevosYRecurrentes(desde, hasta) {
  const primeras = primeraCompra();
  const compradores = new Set(ventasEntre(desde, hasta).filter((venta) => venta.clienteId).map((venta) => venta.clienteId));
  let nuevos = 0, recurrentes = 0;
  compradores.forEach((id) => { if (primeras.get(id) >= desde) nuevos++; else recurrentes++; });
  return { nuevos, recurrentes };
}

// Clientes que compraron alguna vez pero llevan más de los días sin comprar de Ajustes
export function clientesInactivos(ahora = Date.now()) {
  return estado.clientes.map((cliente) => {
    const ventas = estado.ventas.filter((venta) => venta.clienteId === cliente.id);
    if (!ventas.length) return null;
    const ultima = ventas.reduce((mayor, venta) => (venta.fecha > mayor ? venta.fecha : mayor), '');
    const dias = Math.floor((ahora - new Date(ultima).getTime()) / 86_400_000);
    return dias > parametro('diasInactividad') ? { id: cliente.id, nombre: cliente.nombre, ultima, dias } : null;
  }).filter(Boolean).sort((a, b) => b.dias - a.dias);
}

// Cotizaciones creadas en el rango y cuántas se convirtieron (ganadas sobre ganadas + perdidas)
export function conversionDeCotizaciones(desde, hasta) {
  const delRango = cotizaciones().filter((cotizacion) => {
    const dia = aFechaLocal(cotizacion.fecha);
    return dia >= desde && dia <= hasta;
  });
  return { cantidad: delRango.length, ...resumenDelEmbudo(delRango) };
}

// Ventas netas por vendedor (quien registró la factura) en el rango
export function ventasPorVendedor(desde, hasta) {
  const porVendedor = new Map();
  ventasEntre(desde, hasta).forEach((venta) => {
    const actual = porVendedor.get(venta.usuario) ?? { vendedor: venta.usuario || 'Sin registro', cantidad: 0, total: 0 };
    actual.cantidad += estaAnulada(venta) ? 0 : 1;
    actual.total += venta.total;
    porVendedor.set(venta.usuario, actual);
  });
  devolucionesEntre(desde, hasta).forEach((nota) => {
    const venta = estado.ventas.find((candidata) => candidata.id === nota.ventaId);
    const actual = venta && porVendedor.get(venta.usuario);
    if (actual) actual.total -= nota.total;
  });
  return [...porVendedor.values()].sort((a, b) => b.total - a.total);
}

export const deudasDeClientes = () =>
  clientesConDeuda().map((cliente) => ({ nombre: cliente.nombre, deuda: deudaDeCliente(cliente) }))
    .sort((a, b) => b.deuda - a.deuda);

// Total vendido por cada uno de los últimos "dias" días, terminando hoy (para la gráfica del panel)
export function ventasPorDia(dias) {
  const resultado = [];
  for (let atras = dias - 1; atras >= 0; atras--) {
    const fecha = new Date(Date.now() - atras * 86400000);
    const dia = aFechaLocal(fecha.toISOString());
    const total = totalNetoEntre(dia, dia);
    resultado.push({ dia, fecha, total });
  }
  return resultado;
}
