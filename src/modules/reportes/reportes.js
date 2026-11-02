import { buscar, buscarTodos } from '../../core/dom.js';
import { aPesos, aFecha, fechaDeHoy, aFechaLocal } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { descargarCsv } from '../../services/csv.service.js';
import * as servicioReportes from '../../services/reportes.service.js';
import { carteraPorEdades, RANGOS_CARTERA } from '../../services/clientes.service.js';
import { cargarPlantillasTabla, montarTablaResumen } from '../../components/tabla-resumen/tabla-resumen.js';

let documento;
let plantillasTabla;

const primerDiaDelMes = () => `${fechaDeHoy().slice(0, 8)}01`;
const haceDias = (dias) => aFechaLocal(new Date(Date.now() - dias * 86400000).toISOString());

export async function dibujar() {
  documento = await cargarHtml(new URL('./reportes.html', import.meta.url));
  plantillasTabla = await cargarPlantillasTabla();
  return seccion(documento, 'principal', { desde: primerDiaDelMes(), hasta: fechaDeHoy() });
}

export function montar(raiz, contexto) {
  const desde = buscar('#fecha-desde', raiz);
  const hasta = buscar('#fecha-hasta', raiz);
  let reporte;

  const tabla = (selector, columnas, vacio) => montarTablaResumen(buscar(selector, raiz), { plantillas: plantillasTabla, columnas, vacio });
  const derecha = (clave, titulo) => ({ clave, titulo, alinear: 'derecha' });
  const tablas = {
    porVendedor: tabla('#por-vendedor', [{ clave: 'vendedor', titulo: 'Vendedor' }, derecha('cantidad', 'Facturas'), derecha('total', 'Total neto')], 'No hay ventas en este rango.'),
    inactivos: tabla('#inactivos', [
      { clave: 'nombre', titulo: 'Cliente', html: (fila) => repetir(documento, 'enlace-cliente', [fila]) },
      { clave: 'ultima', titulo: 'Última compra' }, derecha('dias', 'Días'),
    ], 'Todos los clientes han comprado en los últimos 60 días.'),
    cartera: tabla('#cartera', [
      { clave: 'nombre', titulo: 'Cliente' },
      ...RANGOS_CARTERA.map((rango) => derecha(rango.id, rango.etiqueta)),
      { clave: 'total', titulo: 'Total', alinear: 'derecha', html: (fila) => repetir(documento, 'total-cartera', [fila]) },
    ], 'No hay cartera pendiente.'),
    porMetodo: tabla('#por-metodo', [{ clave: 'metodo', titulo: 'Medio de pago' }, derecha('valor', 'Total')], 'No hay ventas en este rango.'),
    masVendidos: tabla('#mas-vendidos', [{ clave: 'id', titulo: 'Código' }, { clave: 'nombre', titulo: 'Producto' }, derecha('cantidad', 'Unidades'), derecha('total', 'Total')], 'No hay ventas en este rango.'),
    stockBajo: tabla('#stock-bajo', [{ clave: 'id', titulo: 'Código' }, { clave: 'nombre', titulo: 'Producto' }, derecha('stockMinimo', 'Mínimo'), derecha('existencias', 'Stock')], 'Ningún producto tiene poco stock.'),
    deudas: tabla('#deudas', [{ clave: 'nombre', titulo: 'Cliente' }, derecha('deuda', 'Deuda')], 'Ningún cliente tiene deuda.'),
  };

  const pintar = () => {
    reporte = servicioReportes.reporteDeVentas(desde.value, hasta.value);
    buscar('#indicadores', raiz).innerHTML = repetir(documento, 'indicador', [
      { etiqueta: 'Total vendido', valor: aPesos(reporte.total) },
      { etiqueta: 'Ventas', valor: reporte.cantidad },
      { etiqueta: 'Ticket promedio', valor: aPesos(reporte.ticketPromedio) },
      { etiqueta: 'Utilidad estimada', valor: aPesos(reporte.utilidad) },
    ]);
    tablas.porMetodo.actualizar(reporte.porMetodo.map((fila) => ({ metodo: fila.metodo, valor: aPesos(fila.valor) })));
    tablas.masVendidos.actualizar(reporte.masVendidos.map((fila) => ({ ...fila, total: aPesos(fila.total) })));

    const clientes = servicioReportes.clientesNuevosYRecurrentes(desde.value, hasta.value);
    const conversion = servicioReportes.conversionDeCotizaciones(desde.value, hasta.value);
    buscar('#indicadores-clientes', raiz).innerHTML = repetir(documento, 'indicador', [
      { etiqueta: 'Clientes nuevos', valor: clientes.nuevos },
      { etiqueta: 'Clientes recurrentes', valor: clientes.recurrentes },
      { etiqueta: 'Cotizaciones creadas', valor: conversion.cantidad },
      { etiqueta: 'Conversión de cotizaciones', valor: `${conversion.conversion} %` },
    ]);
    tablas.porVendedor.actualizar(servicioReportes.ventasPorVendedor(desde.value, hasta.value).map((fila) => ({ ...fila, total: aPesos(fila.total) })));
    tablas.inactivos.actualizar(servicioReportes.clientesInactivos().map((fila) => ({ ...fila, ultima: aFecha(fila.ultima.slice(0, 10)) })));
    const cartera = carteraPorEdades();
    const totales = { nombre: 'Total', clase: 'fila-total', total: 0, ...Object.fromEntries(RANGOS_CARTERA.map((rango) => [rango.id, 0])) };
    cartera.forEach((fila) => {
      RANGOS_CARTERA.forEach((rango) => { totales[rango.id] += fila[rango.id]; });
      totales.total += fila.total;
    });
    const enPesos = (fila) => ({ ...fila, ...Object.fromEntries([...RANGOS_CARTERA.map((rango) => rango.id), 'total'].map((clave) => [clave, aPesos(fila[clave])])) });
    tablas.cartera.actualizar([...cartera.map((fila) => enPesos({ ...fila, clase: '' })), ...(cartera.length ? [enPesos(totales)] : [])]);
    tablas.stockBajo.actualizar(servicioReportes.productosConStockBajo());
    tablas.deudas.actualizar(servicioReportes.deudasDeClientes().map((fila) => ({ nombre: fila.nombre, deuda: aPesos(fila.deuda) })));
  };

  const rangos = {
    hoy: () => [fechaDeHoy(), fechaDeHoy()],
    semana: () => [haceDias(6), fechaDeHoy()],
    mes: () => [primerDiaDelMes(), fechaDeHoy()],
  };
  buscarTodos('[data-rango]', raiz).forEach((boton) => {
    boton.onclick = () => {
      [desde.value, hasta.value] = rangos[boton.dataset.rango]();
      pintar();
    };
  });

  const alCambiarFechas = () => {
    if (!desde.value || !hasta.value) return;
    if (desde.value > hasta.value) return contexto.alerta('La fecha inicial no puede ser posterior a la final');
    pintar();
  };
  desde.onchange = alCambiarFechas;
  hasta.onchange = alCambiarFechas;

  buscar('#descargar-ventas', raiz).onclick = () => {
    if (!reporte.ventas.length) return contexto.alerta('No hay ventas en este rango para descargar');
    descargarCsv(
      `ventas-${desde.value}_${hasta.value}.csv`,
      ['N°', 'Fecha', 'Cliente', 'Pago', 'Productos', 'Total'],
      reporte.ventas.map((venta) => [
        venta.id, aFecha(venta.fecha), venta.cliente, venta.metodo,
        venta.items.map((item) => `${item.nombre} x${item.cantidad}`).join('; '), venta.total,
      ]),
    );
    contexto.aviso('Documento CSV descargado correctamente');
  };

  pintar();
}
