// Cuadrícula de datos reutilizable (la misma de Registrar venta): encabezado, una casilla de búsqueda debajo de cada
// columna y filas alineadas. Las casillas se combinan y filtran mientras se escribe, sin tildes ni mayúsculas.
//
// montarCuadricula(contenedor, { plantillas, titulo, columnas, filas, vacio, porPagina, alPintar, filtrosIniciales })
//   columnas: [{ clave, titulo, ancho, alinear, filtrable, html }]
//     ancho    fracción o medida CSS de la columna (por defecto 1fr)
//     alinear  'derecha' para cifras
//     filtrable  false para quitar la casilla de búsqueda (columnas de acciones)
//     html     función (fila) -> HTML ya escapado; sin ella se muestra fila[clave] como texto
//   filas: lista de objetos; el texto de cada clave es el que se filtra
//   filtrosIniciales: { clave: texto } para abrir la cuadrícula ya filtrada (por ejemplo desde un enlace)
//   alPintar: función (cuerpo) llamada tras cada pintado, para activar campos numéricos u otros comportamientos
//   exportar: { modulo, archivo } muestra "Exportar CSV" si el rol tiene ese permiso en el módulo; descarga las filas
//             que se ven con el filtro (todas las páginas), con las columnas que tienen búsqueda
// Devuelve { actualizar(filasNuevas), filtradas() }: repinta sin perder lo escrito en las casillas y entrega las filas visibles tras filtrar.
import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, rellenar, repetir } from '../../core/template.js';
import { puede } from '../../core/autorizacion.js';
import { descargarCsv } from '../../services/csv.service.js';
import { mostrarAviso } from '../toast/toast.js';

const POR_PAGINA = 50;
const ANCHO_POR_FRACCION = 120;

export const cargarPlantillasCuadricula = () => cargarHtml(new URL('./cuadricula-datos.html', import.meta.url));

// Una columna de ancho fijo crece o se encoge entre el 60 % de ese ancho y el ancho pedido. Una columna flexible
// (fr) nunca baja de 120 px por fracción: sin ese mínimo, las fijas crecen primero y dejan al nombre casi sin espacio
const PROPORCION_MINIMA = 0.6;
const minimoDeColumna = (ancho) => Math.round(ancho * PROPORCION_MINIMA);
export const anchoFlexible = (ancho = 'minmax(0, 1fr)') => {
  const fijo = /^(\d+)px$/.exec(ancho);
  if (fijo) return `minmax(${minimoDeColumna(Number(fijo[1]))}px, ${fijo[1]}px)`;
  const fracciones = /^(?:minmax\(0, )?([\d.]+)fr\)?$/.exec(ancho);
  return fracciones ? `minmax(${Math.round(Number(fracciones[1]) * ANCHO_POR_FRACCION)}px, ${fracciones[1]}fr)` : ancho;
};

const normalizar = (texto) => String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Descarga en CSV las filas filtradas con el texto de cada columna que tiene búsqueda (sin las de acciones)
function exportarFilas({ archivo }, columnas, filas) {
  const exportables = columnas.filter((columna) => columna.filtrable !== false);
  descargarCsv(`${archivo}.csv`, exportables.map((columna) => columna.titulo), filas.map((fila) => exportables.map((columna) => fila[columna.clave] ?? '')));
  mostrarAviso(`${filas.length} registro(s) exportados correctamente`);
}

export function montarCuadricula(contenedor, {
  plantillas, titulo, columnas, filas, vacio = 'No hay datos para mostrar.', porPagina = POR_PAGINA, alPintar, filtrosIniciales = {}, exportar = null,
}) {
  const clase = (columna) => (columna.alinear === 'derecha' ? 'alinear-derecha' : '');

  contenedor.innerHTML = rellenar(plantillas.querySelector('#cuadricula-estructura').innerHTML, {
    titulo,
    encabezados: repetir(plantillas, 'cuadricula-encabezado', columnas.map((columna) => ({ titulo: columna.titulo, clase: clase(columna) }))),
    filtros: columnas.map((columna) => (columna.filtrable === false
      ? plantillas.querySelector('#cuadricula-filtro-vacio').innerHTML
      : repetir(plantillas, 'cuadricula-filtro', [{ clave: columna.clave, titulo: columna.titulo }]))).join(''),
  });
  contenedor.classList.add('contenedor-cuadricula', 'desplazable');

  const cuadricula = buscar('.cuadricula-datos', contenedor);
  const cuerpo = buscar('.cuerpo-cuadricula', contenedor);
  const resumen = buscar('.resumen-cuadricula', contenedor);
  const verMas = buscar('.ver-mas-cuadricula', contenedor);
  const casillas = buscarTodos('[data-columna]', contenedor);
  let datos = filas;
  let visibles = porPagina;

  // Las columnas sin búsqueda (acciones) no se encogen: sus botones quedan siempre en una línea
  const fija = (columna) => columna.filtrable === false && /^\d+px$/.test(columna.ancho ?? '');
  cuadricula.style.setProperty('--columnas', columnas.map((columna) => (fija(columna) ? columna.ancho : anchoFlexible(columna.ancho))).join(' '));
  // Ancho mínimo: el mínimo de cada columna fija más 120 px por cada fracción; si no cabe, se desplaza en horizontal
  const anchoMinimo = columnas.reduce((suma, columna) => {
    const ancho = columna.ancho ?? 'minmax(0, 1fr)';
    const fijo = /^(\d+)px$/.exec(ancho);
    if (fijo) return suma + (fija(columna) ? Number(fijo[1]) : minimoDeColumna(Number(fijo[1])));
    return suma + Number(/([\d.]+)fr/.exec(ancho)?.[1] ?? 1) * ANCHO_POR_FRACCION;
  }, 0) + (columnas.length - 1) * 8 + 16;
  cuadricula.style.minWidth = `${Math.max(480, anchoMinimo)}px`;

  const celdaDe = (columna, fila) => (columna.html
    ? repetir(plantillas, 'cuadricula-celda-html', [{ clase: clase(columna), contenido: columna.html(fila) }])
    : repetir(plantillas, 'cuadricula-celda', [{ clase: clase(columna), texto: fila[columna.clave] ?? '' }]));

  function filtrar() {
    const criterios = casillas.map((casilla) => [casilla.dataset.columna, normalizar(casilla.value.trim())]).filter(([, texto]) => texto);
    return datos.filter((fila) => criterios.every(([clave, texto]) => normalizar(fila[clave]).includes(texto)));
  }

  function pintar() {
    const encontradas = filtrar();
    const mostradas = encontradas.slice(0, visibles);
    cuerpo.innerHTML = mostradas
      .map((fila) => rellenar(plantillas.querySelector('#cuadricula-fila').innerHTML, { celdas: columnas.map((columna) => celdaDe(columna, fila)).join('') }))
      .join('');
    if (!encontradas.length) {
      cuerpo.innerHTML = repetir(plantillas, 'cuadricula-vacio', [{ texto: datos.length ? 'Sin coincidencias. Cambia lo escrito en las casillas.' : vacio }]);
    }
    resumen.textContent = datos.length === encontradas.length
      ? `${datos.length} registro(s)`
      : `${encontradas.length} de ${datos.length} registro(s)`;
    verMas.hidden = encontradas.length <= mostradas.length;
    alPintar?.(cuerpo);
  }

  casillas.forEach((casilla) => casilla.addEventListener('input', () => {
    visibles = porPagina;
    pintar();
  }));
  verMas.onclick = () => {
    visibles += porPagina;
    pintar();
  };
  const botonExportar = buscar('.exportar-cuadricula', contenedor);
  botonExportar.hidden = !(exportar && puede(exportar.modulo, 'exportar'));
  botonExportar.onclick = () => exportarFilas(exportar, columnas, filtrar());

  casillas.forEach((casilla) => { casilla.value = filtrosIniciales[casilla.dataset.columna] ?? ''; });
  pintar();
  return {
    actualizar(filasNuevas) {
      datos = filasNuevas;
      pintar();
    },
    filtradas: filtrar,
  };
}
