import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { puede } from '../../core/autorizacion.js';
import { aPesos, aFecha } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import * as servicioContabilidad from '../../services/contabilidad.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;

const paresDeResumen = (resumen) => [
  ['Ventas registradas', resumen.cantidadVentas],
  ['Total vendido', aPesos(resumen.totalVentas)],
  ['Devoluciones y anulaciones', aPesos(resumen.devoluciones)],
  ['Costo de lo vendido', aPesos(resumen.costoVendido)],
  ['Utilidad estimada', aPesos(resumen.utilidad)],
  ['Ventas a Crédito', aPesos(resumen.ventasCredito)],
  ['Abonos de clientes', aPesos(resumen.abonosClientes)],
  ['Pagos a proveedores', aPesos(resumen.pagosProveedores)],
  ['Compras facturadas', aPesos(resumen.comprasFacturadas)],
  ['Ingresos de caja', aPesos(resumen.ingresosCaja)],
  ['Egresos de caja', aPesos(resumen.egresosCaja)],
  ['Diferencia de caja', aPesos(resumen.diferenciaCaja)],
].map(([etiqueta, valor]) => ({ etiqueta, valor: String(valor) }));
const lineasDeResumen = (resumen) => repetir(documento, 'linea-resumen', paresDeResumen(resumen));

function contenidoPendiente() {
  const pendientes = servicioContabilidad.diasPendientes();
  if (!pendientes.length) {
    const ultimo = servicioContabilidad.ultimoDiaCerrado();
    return seccion(documento, 'al-dia', {
      detalle: ultimo ? `El último día cerrado fue ${aFecha(ultimo)}.` : 'Aún no hay días con movimientos para cerrar.',
    });
  }
  const dia = pendientes[0];
  return seccion(documento, 'dia-pendiente', {
    dia: aFecha(dia),
    pendientes: pendientes.length === 1 ? 'Es el único día pendiente.' : `Hay ${pendientes.length} días pendientes; se cierran del más antiguo al más reciente.`,
    lineas: lineasDeResumen(servicioContabilidad.resumenDelDia(dia)),
    cerrarTodos: pendientes.length > 1 ? repetir(documento, 'boton-cerrar-todos', [{ cantidad: pendientes.length }]) : '',
  });
}

function contenidoReabrir() {
  const ultimo = servicioContabilidad.ultimoDiaCerrado();
  if (!ultimo || !puede('contabilidad', 'reabrir')) return '';
  return seccion(documento, 'reabrir-dia', { dia: aFecha(ultimo) });
}

export async function dibujar() {
  documento = await cargarHtml(new URL('./contabilidad.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha] = await Promise.all([cargarPlantillasCuadricula(), cargarPlantillasFicha()]);
  return seccion(documento, 'principal', {
    contenido: contenidoPendiente(),
    reabrir: contenidoReabrir(),
  });
}

const COLUMNAS_CIERRES = [
  ['dia', 'Día', '120px'], ['cantidad', 'Ventas', '80px'], ['total', 'Total vendido', '112px'], ['devoluciones', 'Devoluciones', '112px'],
  ['costo', 'Costo', '104px'], ['utilidad', 'Utilidad', '104px'], ['credito', 'Crédito', '96px'], ['abonos', 'Abonos', '96px'],
  ['pagos', 'Pagos a proveedores', '124px'], ['compras', 'Compras', '104px'], ['diferencia', 'Dif. de caja', '104px'],
].map(([clave, titulo, ancho]) => ({ clave, titulo, ancho, alinear: clave === 'dia' ? undefined : 'derecha' }));
const columnasCierres = () => [...COLUMNAS_CIERRES, {
  clave: 'acciones', titulo: 'Acciones', ancho: '90px', filtrable: false, html: (fila) => repetir(documento, 'accion-cierre', [{ dia: fila.diaClave }]),
}];

export function montar(raiz, contexto) {
  montarCuadricula(buscar('#cuadricula-cierres', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Días cerrados',
    vacio: 'Aún no hay días cerrados.',
    columnas: columnasCierres(),
    filas: estado.contabilidad.slice().sort((a, b) => b.dia.localeCompare(a.dia)).map((cierre) => ({
      diaClave: cierre.dia,
      dia: aFecha(cierre.dia),
      cantidad: cierre.cantidadVentas,
      total: aPesos(cierre.totalVentas),
      devoluciones: aPesos(cierre.devoluciones ?? 0),
      costo: aPesos(cierre.costoVendido),
      utilidad: aPesos(cierre.utilidad),
      credito: aPesos(cierre.ventasCredito ?? 0),
      abonos: aPesos(cierre.abonosClientes),
      pagos: aPesos(cierre.pagosProveedores),
      compras: aPesos(cierre.comprasFacturadas),
      diferencia: aPesos(cierre.diferenciaCaja),
    })),
  });

  // Ficha del día cerrado: su resumen guardado (no se edita; solo se puede reabrir el último día)
  const ficha = crearFicha(buscar('#ficha-cierre', raiz), plantillasFicha);
  const abrirFicha = (dia) => ficha.abrir(dia, () => {
    const cierre = estado.contabilidad.find((candidato) => candidato.dia === dia);
    if (!cierre) return null;
    return {
      etiqueta: 'Ficha del día cerrado',
      titulo: `Contabilidad del ${aFecha(cierre.dia)}`,
      subtitulo: cierre.cerradoEn ? `Cerrado el ${aFecha(cierre.cerradoEn)}` : '',
      indicadores: [
        { etiqueta: 'Total vendido', valor: aPesos(cierre.totalVentas) },
        { etiqueta: 'Utilidad estimada', valor: aPesos(cierre.utilidad) },
        { etiqueta: 'Diferencia de caja', valor: aPesos(cierre.diferenciaCaja), clase: cierre.diferenciaCaja < 0 ? 'texto-negativo' : '' },
      ],
      datos: paresDeResumen({ devoluciones: 0, ventasCredito: 0, ...cierre }),
    };
  });
  buscar('#cuadricula-cierres', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-ficha]');
    if (boton) abrirFicha(boton.dataset.ficha);
  });

  const panelReabrir = buscar('#panel-reabrir', raiz);
  if (panelReabrir) {
    buscar('#abrir-reabrir', raiz).onclick = () => {
      panelReabrir.hidden = false;
      panelReabrir.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      buscar('#motivo-reabrir', raiz).focus();
    };
    buscar('#cancelar-reabrir', raiz).onclick = () => { panelReabrir.hidden = true; };
  }

  const botonReabrir = buscar('#reabrir-dia-boton', raiz);
  if (botonReabrir) {
    botonReabrir.onclick = () => {
      try {
        const dia = servicioContabilidad.reabrirUltimoDia(buscar('#motivo-reabrir', raiz).value);
        contexto.aviso(`Contabilidad del ${aFecha(dia)} reabierta correctamente`);
        contexto.redibujar();
      } catch (error) {
        contexto.alerta(error.message);
      }
    };
  }

  const confirmacion = buscar('#confirmar-cierre', raiz);
  if (!confirmacion) return;
  let accionPendiente = null;

  const pedirConfirmacion = (texto, accion) => {
    accionPendiente = accion;
    buscar('#texto-cierre', raiz).textContent = texto;
    confirmacion.hidden = false;
    buscar('#confirmar-cierre-no', raiz).focus();
  };

  const pendientes = servicioContabilidad.diasPendientes();
  buscar('#cerrar-dia', raiz).onclick = () => pedirConfirmacion(
    `Al cerrar el ${aFecha(pendientes[0])}, su resumen queda guardado y no cambia. ¿Cerrarlo?`,
    () => {
      servicioContabilidad.cerrarDia(pendientes[0]);
      return `Contabilidad del ${aFecha(pendientes[0])} cerrada correctamente`;
    },
  );

  const cerrarTodos = buscar('#cerrar-todos', raiz);
  if (cerrarTodos) {
    cerrarTodos.onclick = () => pedirConfirmacion(
      `Se cerrarán ${pendientes.length} días en orden, y el resumen de cada uno queda guardado. ¿Continuar?`,
      () => `${servicioContabilidad.cerrarDiasPendientes()} días cerrados correctamente`,
    );
  }

  buscar('#confirmar-cierre-no', raiz).onclick = () => { confirmacion.hidden = true; };
  buscar('#confirmar-cierre-si', raiz).onclick = () => {
    try {
      contexto.aviso(accionPendiente());
      contexto.redibujar();
    } catch (error) {
      confirmacion.hidden = true;
      contexto.alerta(error.message);
    }
  };
}
