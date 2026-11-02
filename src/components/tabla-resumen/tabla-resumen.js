// Tabla de resumen (la hermana sencilla de la cuadrícula): encabezados y filas, sin filtros ni paginación.
// Sirve para reportes y para el panel, donde solo se muestran cifras.
//
// const tabla = montarTablaResumen(contenedor, { plantillas, columnas, filas, vacio })
//   columnas: [{ clave, titulo, alinear, clase, html }]
//     alinear  'derecha' para cifras; clase: clase extra de la columna (por ejemplo 'celda-ancha' para texto largo)
//     html     función (fila) -> HTML ya escapado; sin ella se muestra fila[clave] como texto
//   filas: lista de objetos; fila.clase se pone en la fila (por ejemplo 'fila-total')
//   vacio: texto que se muestra en lugar de la tabla cuando no hay filas
// Devuelve { actualizar(filasNuevas) }.
import { buscar } from '../../core/dom.js';
import { cargarHtml, rellenar, repetir } from '../../core/template.js';

export const cargarPlantillasTabla = () => cargarHtml(new URL('./tabla-resumen.html', import.meta.url));

export function montarTablaResumen(contenedor, { plantillas, columnas, filas = [], vacio = 'No hay datos para mostrar.' }) {
  const plantilla = (id) => plantillas.querySelector(`#${id}`).innerHTML;
  const clase = (columna) => [columna.alinear === 'derecha' ? 'alinear-derecha' : '', columna.clase ?? ''].join(' ').trim();

  contenedor.innerHTML = rellenar(plantilla('tabla-resumen'), {
    vacio,
    encabezados: repetir(plantillas, 'encabezado', columnas.map((columna) => ({ titulo: columna.titulo, clase: clase(columna) }))),
  });
  const cuerpo = buscar('[data-cuerpo-tabla]', contenedor);
  const tabla = buscar('.desplazable', contenedor);
  const mensajeVacio = buscar('[data-vacio-tabla]', contenedor);

  const celda = (columna, fila) => (columna.html
    ? rellenar(plantilla('celda-html'), { clase: clase(columna), contenido: columna.html(fila) })
    : rellenar(plantilla('celda'), { clase: clase(columna), texto: fila[columna.clave] ?? '' }));

  function actualizar(filasNuevas) {
    cuerpo.innerHTML = filasNuevas.map((fila) => rellenar(plantilla('fila'), {
      clase: fila.clase ?? '',
      celdas: columnas.map((columna) => celda(columna, fila)).join(''),
    })).join('');
    tabla.hidden = !filasNuevas.length;
    mensajeVacio.hidden = filasNuevas.length > 0;
  }

  actualizar(filas);
  return { actualizar };
}
