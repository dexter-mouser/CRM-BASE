import { buscar } from '../../core/dom.js';
import { aPesos, aFecha, conMoneda, formatoFecha } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import * as servicioCaja from '../../services/caja.service.js';
import { tiendaActiva, nombreDeTienda } from '../../core/tienda.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { importarMovimientosDeCaja } from '../../services/importacion.service.js';
import { mensajeDeError } from '../../core/errores.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

const aHora = (iso) => formatoFecha({ timeStyle: 'short' }).format(new Date(iso));

const contenidoCajaAbierta = (caja) => {
  const resumen = servicioCaja.resumenDeCaja(caja);
  const lineas = [
    ['Base', resumen.base],
    ['Ventas en efectivo', resumen.ventasEfectivo],
    ['Abonos de clientes en efectivo', resumen.abonosEfectivo],
    ['Ingresos', resumen.ingresos],
    ['Egresos', 0 - resumen.egresos],
    ['Pagos a proveedores en efectivo', 0 - resumen.pagosProveedores],
    ['Devoluciones en efectivo', 0 - resumen.reembolsos],
  ].map(([etiqueta, valor]) => ({ etiqueta, valor: aPesos(valor) }));
  return seccion(documento, 'caja-abierta', {
    apertura: aFecha(caja.apertura),
    lineas: repetir(documento, 'linea-resumen', lineas),
    esperado: aPesos(resumen.esperado),
  });
};

export async function dibujar(contexto) {
  documento = await cargarHtml(new URL('./caja.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  const caja = servicioCaja.cajaAbierta();
  const tienda = tiendaActiva();
  contexto.cabecera = { complemento: tienda?.nombre ?? 'Todas las sucursales' };
  return seccion(documento, 'principal', {
    contenido: !tienda ? seccion(documento, 'sin-tienda') : (caja ? contenidoCajaAbierta(caja) : seccion(documento, 'caja-cerrada')),
  });
}

export function montar(raiz, contexto) {
  montarCuadricula(buscar('#cuadricula-cierres', raiz), {
    exportar: { modulo: 'caja', archivo: 'cierres-de-caja' },
    plantillas: plantillasCuadricula,
    titulo: 'Cierres anteriores',
    vacio: 'Aún no hay cierres de caja.',
    columnas: [
      { clave: 'id', titulo: 'Caja', ancho: '84px' },
      { clave: 'tienda', titulo: 'Sucursal', ancho: '130px' },
      { clave: 'apertura', titulo: 'Apertura', ancho: 'minmax(0, 1fr)' },
      { clave: 'cierre', titulo: 'Cierre', ancho: 'minmax(0, 1fr)' },
      { clave: 'esperado', titulo: 'Esperado', ancho: '112px', alinear: 'derecha' },
      { clave: 'contado', titulo: 'Contado', ancho: '112px', alinear: 'derecha' },
      { clave: 'diferencia', titulo: 'Diferencia', ancho: '112px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '90px', filtrable: false, html: (fila) => repetir(documento, 'accion-cierre', [{ id: fila.id }]) },
    ],
    filas: servicioCaja.cajasDeLaVista().filter((existente) => existente.cierre).reverse().map((existente) => ({
      id: existente.id,
      tienda: nombreDeTienda(existente.tiendaId),
      apertura: aFecha(existente.apertura),
      cierre: aFecha(existente.cierre.fecha),
      esperado: aPesos(existente.cierre.esperado),
      contado: aPesos(existente.cierre.contado),
      diferencia: aPesos(existente.cierre.diferencia),
    })),
  });

  // Ficha del cierre: resumen de la caja tal como quedó (no se edita)
  const resumenEnLineas = (resumen) => [
    ['Base', resumen.base],
    ['Ventas en efectivo', resumen.ventasEfectivo],
    ['Abonos de clientes en efectivo', resumen.abonosEfectivo],
    ['Ingresos', resumen.ingresos],
    ['Egresos', 0 - resumen.egresos],
    ['Pagos a proveedores en efectivo', 0 - resumen.pagosProveedores],
    ['Devoluciones en efectivo', 0 - resumen.reembolsos],
  ].map(([etiqueta, valor]) => ({ etiqueta, valor: aPesos(valor) }));
  const ficha = crearFicha(buscar('#ficha-cierre', raiz), plantillasFicha);
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const cerrada = servicioCaja.buscarCaja(id);
    if (!cerrada?.cierre) return null;
    const resumen = servicioCaja.resumenDeCaja(cerrada);
    return {
      etiqueta: 'Ficha del cierre de caja',
      titulo: `Caja ${cerrada.id} · ${nombreDeTienda(cerrada.tiendaId)}`,
      subtitulo: `${aFecha(cerrada.apertura)} → ${aFecha(cerrada.cierre.fecha)}${cerrada.usuario ? ` · ${cerrada.usuario}` : ''}`,
      indicadores: [
        { etiqueta: 'Esperado', valor: aPesos(cerrada.cierre.esperado) },
        { etiqueta: 'Contado', valor: aPesos(cerrada.cierre.contado) },
        { etiqueta: 'Diferencia', valor: aPesos(cerrada.cierre.diferencia), clase: cerrada.cierre.diferencia < 0 ? 'texto-negativo' : '' },
      ],
      datos: resumenEnLineas(resumen),
      contenido: repetir(documento, 'contenido-ficha-cierre', [{}]),
      alMontar: (seccionFicha) => montarCuadricula(seccionFicha.querySelector('[data-movimientos]'), {
        plantillas: plantillasCuadricula,
        titulo: 'Movimientos',
        vacio: 'Sin ingresos ni egresos manuales.',
        columnas: [
          { clave: 'hora', titulo: 'Hora', ancho: '100px' }, { clave: 'tipo', titulo: 'Tipo', ancho: '110px' },
          { clave: 'concepto', titulo: 'Concepto', ancho: 'minmax(0, 1fr)' }, { clave: 'valor', titulo: 'Valor', ancho: '120px', alinear: 'derecha' },
        ],
        filas: resumen.movimientos.map((movimiento) => ({
          hora: aHora(movimiento.fecha), tipo: movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', concepto: movimiento.concepto, valor: aPesos(movimiento.valor),
        })),
      }),
    };
  });
  buscar('#cuadricula-cierres', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-ficha]');
    if (boton) abrirFicha(boton.dataset.ficha);
  });

  const ejecutar = (accion, mensaje) => {
    try {
      const resultado = accion();
      contexto.aviso(typeof mensaje === 'function' ? mensaje(resultado) : mensaje);
      contexto.redibujar();
      return true;
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
      return false;
    }
  };
  const formulario = (selector, opciones) => montarFormulario(buscar(selector, raiz), { plantillas: plantillasFormulario, alError: contexto.alerta, ...opciones });

  // Caja cerrada: la base con la que empieza el día
  if (buscar('#formulario-abrir-caja', raiz)) {
    formulario('#formulario-abrir-caja', {
      clave: 'apertura',
      incrustado: true,
      textoGuardar: 'Abrir caja',
      columnas: 2,
      campos: [{ clave: 'base', etiqueta: conMoneda('Base'), tipo: 'entero', valor: 0, obligatorio: true }],
      alGuardar: ({ base }) => ejecutar(() => servicioCaja.abrirCaja(base), 'Caja abierta correctamente'),
    });
  }

  // Paneles de proceso de la caja abierta: registrar movimiento y cerrar caja (uno abierto a la vez)
  const caja = servicioCaja.cajaAbierta();
  if (caja && buscar('#panel-movimiento', raiz)) {
    const panelMovimiento = formulario('#panel-movimiento', {
      clave: 'movimiento',
      titulo: 'Registrar movimiento',
      textoGuardar: 'Registrar movimiento',
      campos: [
        { clave: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', valor: 'ingreso', opciones: [['ingreso', 'Ingreso'], ['egreso', 'Egreso']] },
        { clave: 'concepto', etiqueta: 'Concepto', obligatorio: true },
        { clave: 'valor', etiqueta: conMoneda('Valor'), tipo: 'entero', obligatorio: true },
      ],
      alGuardar: (datos) => ejecutar(() => servicioCaja.registrarMovimiento(datos), 'Movimiento registrado correctamente'),
    });
    // El contado no se precarga: hay que contar el efectivo de verdad
    const panelCierre = formulario('#panel-cierre', {
      clave: 'cierre',
      titulo: 'Cerrar caja',
      textoGuardar: 'Cerrar caja',
      columnas: 2,
      campos: [{
        clave: 'contado', etiqueta: conMoneda('Efectivo contado'), tipo: 'entero', obligatorio: true,
        ayuda: `Cuenta el efectivo y escríbelo. Se guarda la diferencia con lo esperado (${aPesos(servicioCaja.resumenDeCaja(caja).esperado)}).`,
      }],
      alGuardar: ({ contado }) => ejecutar(() => servicioCaja.cerrarCaja(contado), (cierre) => {
        const detalle = cierre.diferencia === 0 ? 'sin diferencia' : `diferencia de ${aPesos(cierre.diferencia)}`;
        return `Caja cerrada correctamente: ${detalle}`;
      }),
    });
    buscar('#nuevo-movimiento', raiz).onclick = () => { panelCierre.cerrar(); panelMovimiento.abrir(); };
    buscar('#abrir-cierre', raiz).onclick = () => { panelMovimiento.cerrar(); panelCierre.abrir(); };
  }

  const contenedorMovimientos = buscar('#cuadricula-movimientos', raiz);
  if (caja && contenedorMovimientos) {
    montarCuadricula(contenedorMovimientos, {
      exportar: { modulo: 'caja', archivo: 'movimientos-de-caja' },
      importar: { modulo: 'caja', formato: 'movimientosCaja', registros: () => [], importar: importarMovimientosDeCaja, alImportar: contexto.redibujar },
      plantillas: plantillasCuadricula,
      titulo: 'Movimientos de esta caja',
      vacio: 'Aún no hay ingresos ni egresos manuales.',
      columnas: [
        { clave: 'hora', titulo: 'Hora', ancho: '100px' },
        { clave: 'tipo', titulo: 'Tipo', ancho: '110px' },
        { clave: 'concepto', titulo: 'Concepto', ancho: 'minmax(0, 1fr)' },
        { clave: 'valor', titulo: 'Valor', ancho: '120px', alinear: 'derecha' },
      ],
      filas: servicioCaja.resumenDeCaja(caja).movimientos.slice().reverse().map((movimiento) => ({
        hora: aHora(movimiento.fecha),
        tipo: movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
        concepto: movimiento.concepto,
        valor: aPesos(movimiento.valor),
      })),
    });
  }

}
