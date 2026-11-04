import { buscar } from '../../core/dom.js';
import { estado, guardarEstado } from '../../core/store.js';
import { aPesos, fechaDeHoy, formatoFecha } from '../../core/format.js';
import { sesionActual } from '../../core/sesion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { resumirItems, estaAnulada } from '../../services/ventas.service.js';
import { cajaAbierta, efectivoEnCaja } from '../../services/caja.service.js';
import { clientesConDeuda, deudaDeCliente } from '../../services/clientes.service.js';
import { ventasEntre, totalNetoEntre, ventasPorDia } from '../../services/reportes.service.js';
import { habilitarReordenamiento } from '../../components/reordenar/reordenar.js';
import { ACCESOS_PRINCIPALES, enlaceDeSeccion } from '../../config/nav.js';
import { gruposVisibles } from '../../components/sidebar/sidebar.js';
import { puede } from '../../core/autorizacion.js';
import { icono } from '../../core/iconos.js';
import { enTiendaActiva, tiendaActiva } from '../../core/tienda.js';
import { existenciasVisibles, productosBajoMinimo, bodegaActiva } from '../../services/inventario.service.js';
import { alertasDeCotizaciones } from '../../services/embudo.service.js';
import { tareasPendientes, estaVencidaTarea } from '../../services/actividades.service.js';
import { cargarPlantillasTabla, montarTablaResumen } from '../../components/tabla-resumen/tabla-resumen.js';

// Últimas ventas: se calculan al dibujar y se pintan con la tabla de resumen al montar
let ultimasVentas = [];
let plantillasTabla;

const ALTURA_MAXIMA_BARRA = 170;
const ALTURA_MINIMA_BARRA = 4;

const calcularPorcentaje = (valor, total) => (total > 0 ? Math.max(0, Math.min(100, Math.round((valor / total) * 100))) : 0);

function saludoSegunHora() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  return hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export async function dibujar(contexto) {
  const documento = await cargarHtml(new URL('./panel.html', import.meta.url));
  plantillasTabla = await cargarPlantillasTabla();
  const hoy = fechaDeHoy();
  const ventasDeHoy = ventasEntre(hoy, hoy).filter((venta) => !estaAnulada(venta));
  const semana = ventasPorDia(7);
  const mayorDia = Math.max(...semana.map((dia) => dia.total), 0);
  const conDeuda = clientesConDeuda();
  const productosNegativos = estado.productos.filter((producto) => existenciasVisibles(producto) < 0).length;

  const metricas = [
    {
      etiqueta: 'Ventas del día',
      valor: totalNetoEntre(hoy, hoy),
      formato: 'pesos',
      detalle: `${ventasDeHoy.length} ${ventasDeHoy.length === 1 ? 'venta' : 'ventas'} hoy`,
    },
    {
      etiqueta: 'Efectivo en caja',
      valor: efectivoEnCaja(),
      formato: 'pesos',
      detalle: cajaAbierta() ? 'Caja abierta' : 'Caja cerrada',
    },
    {
      etiqueta: 'Créditos pendientes',
      valor: conDeuda.reduce((acumulado, cliente) => acumulado + deudaDeCliente(cliente), 0),
      formato: 'pesos',
      detalle: `${conDeuda.length} ${conDeuda.length === 1 ? 'cliente' : 'clientes'} con deuda`,
    },
    {
      etiqueta: 'Productos en negativo',
      valor: productosNegativos,
      formato: 'numero',
      detalle: `de ${estado.productos.length} productos`,
    },
  ];
  const porcentajes = [
    calcularPorcentaje(metricas[0].valor, mayorDia),
    cajaAbierta() ? 100 : 0,
    calcularPorcentaje(conDeuda.length, estado.clientes.length),
    calcularPorcentaje(productosNegativos, estado.productos.length),
  ];
  const tarjetas = estado.orden.map((indice) => ({ indice, ...metricas[indice], porcentaje: porcentajes[indice] }));

  const formatoDia = formatoFecha({ weekday: 'short' });
  const barras = semana.map((dia, posicion) => ({
    altura: mayorDia > 0 ? Math.max(ALTURA_MINIMA_BARRA, Math.round((dia.total / mayorDia) * ALTURA_MAXIMA_BARRA)) : ALTURA_MINIMA_BARRA,
    retraso: posicion * 60,
    titulo: `${formatoDia.format(dia.fecha)}: ${aPesos(dia.total)}`,
  }));
  const etiquetas = semana.map((dia) => ({ texto: formatoDia.format(dia.fecha).replace('.', '') }));
  ultimasVentas = estado.ventas.filter(enTiendaActiva).slice(-5).reverse().map((venta) => ({
    cliente: venta.cliente,
    productos: resumirItems(venta),
    metodo: venta.metodo,
    total: aPesos(venta.total),
  }));

  // La cabecera saluda a la persona y dice de qué tienda es el resumen
  contexto.cabecera = {
    titulo: `${saludoSegunHora()}, ${(sesionActual()?.nombre ?? '').split(' ')[0]}`,
    descripcion: `Resumen del día en ${tiendaActiva()?.nombre ?? 'todas tus sucursales'}. Arrastra las tarjetas para reordenarlas.`,
  };
  return seccion(documento, 'principal', {
    accesos: repetir(documento, 'acceso-principal', accesosPrincipales()),
    pendientes: pendientes(documento),
    funciones: repetir(documento, 'grupo-funciones', gruposVisibles().map((grupo) => ({
      etiqueta: grupo.etiqueta,
      icono: icono(grupo.icono),
      enlaces: repetir(documento, 'enlace-funcion', grupo.secciones.map((parte) => ({ etiqueta: parte.etiqueta, enlace: enlaceDeSeccion(parte) }))),
    }))),
    tarjetas: repetir(documento, 'tarjeta-resumen', tarjetas),
    barras: repetir(documento, 'barra', barras),
    etiquetas: repetir(documento, 'etiqueta-barra', etiquetas),
  });
}

// Accesos principales que el rol de la persona puede usar
const accesosPrincipales = () => ACCESOS_PRINCIPALES
  .filter((acceso) => puede(acceso.modulo, acceso.permiso))
  .map((acceso) => ({ ...acceso, icono: icono(acceso.icono) }));

// Lo que está por hacer: tareas de hoy, cotizaciones vencidas, productos bajo el mínimo y traslados por recibir
function pendientes(documento) {
  const finDeHoy = new Date().setHours(23, 59, 59, 999);
  const lista = [];
  if (puede('seguimiento', 'ver')) {
    const tareas = tareasPendientes().filter((tarea) => new Date(tarea.vence).getTime() <= finDeHoy);
    const vencidas = tareas.filter((tarea) => estaVencidaTarea(tarea)).length;
    if (tareas.length) lista.push({ texto: `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'} para hoy${vencidas ? ` (${vencidas} vencidas)` : ''}`, enlace: 'seguimiento.html' });
  }
  if (puede('embudo', 'ver')) {
    const cotizacionesVencidas = alertasDeCotizaciones().length;
    if (cotizacionesVencidas) lista.push({ texto: `${cotizacionesVencidas} ${cotizacionesVencidas === 1 ? 'cotización vencida' : 'cotizaciones vencidas'} sin cerrar`, enlace: 'embudo.html' });
  }
  if (puede('inventario', 'ver')) {
    const bajos = productosBajoMinimo().length;
    if (bajos) lista.push({ texto: `${bajos} ${bajos === 1 ? 'producto' : 'productos'} en o bajo el stock mínimo`, enlace: 'inventario.html' });
  }
  if (puede('bodegas', 'ver')) {
    const bodega = bodegaActiva();
    const porRecibir = estado.traslados.filter((traslado) => traslado.estado === 'enviado' && (!bodega || traslado.destinoId === bodega.id)).length;
    if (porRecibir) lista.push({ texto: `${porRecibir} ${porRecibir === 1 ? 'traslado' : 'traslados'} por recibir`, enlace: 'bodegas.html#traslados' });
  }
  if (puede('caja', 'ver') && tiendaActiva() && !cajaAbierta()) lista.push({ texto: `La caja de ${tiendaActiva().nombre} está cerrada`, enlace: 'caja.html' });
  return lista.length
    ? repetir(documento, 'pendiente', lista)
    : '<li class="texto-suave">No hay pendientes por ahora.</li>';
}

export function montar(raiz, contexto) {
  montarTablaResumen(buscar('#ultimas-ventas', raiz), {
    plantillas: plantillasTabla,
    columnas: [
      { clave: 'cliente', titulo: 'Cliente' },
      { clave: 'productos', titulo: 'Productos', clase: 'celda-ancha' },
      { clave: 'metodo', titulo: 'Pago' },
      { clave: 'total', titulo: 'Total', alinear: 'derecha' },
    ],
    filas: ultimasVentas,
    vacio: 'Aún no hay ventas en esta sucursal.',
  });

  habilitarReordenamiento(buscar('#contenedor-tarjetas', raiz), {
    selector: '.resumen',
    alCambiar: (orden) => {
      estado.orden = orden;
      guardarEstado();
      contexto.aviso('Orden de las tarjetas actualizado correctamente');
    },
  });
}
