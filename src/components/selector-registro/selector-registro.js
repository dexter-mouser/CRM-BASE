// Selector de un registro (cliente, proveedor, producto, factura…) con la forma de la cuadrícula: debajo de los
// títulos, una sola fila de casillas de búsqueda que muestran los datos del registro elegido, siempre a la vista.
// Escribir en cualquier casilla (se combinan, sin tildes ni mayúsculas) muestra las coincidencias; flechas y Enter o
// un clic eligen; Escape cierra. Siempre hay un registro elegido si se da uno por defecto (por ejemplo, Consumidor final).
//
// const selector = montarSelectorRegistro(contenedor, opciones)
//   plantillas   resultado de cargarPlantillasSelector()
//   clave        nombre corto para los id (cliente, proveedor…)
//   etiqueta     qué se elige, en plural para los textos de ayuda (clientes, proveedores…)
//   columnas     [{ clave, titulo, ancho, alinear, filtrable, html }] igual que en la cuadrícula
//   registros    función que devuelve la lista (se llama en cada búsqueda, así siempre está al día); cada
//                registro tiene id y los textos de cada columna
//   elegido      id elegido al montar (o función que lo da)
//   vacio        texto cuando no hay ninguno elegido
//   alElegir     función (registro) al elegir uno
//   alSalir      función opcional: Enter sin nada que elegir (por ejemplo, pasar a los productos)
// Devuelve { elegido(), elegir(id, avisar), habilitar(si), enfocar(), raiz }
import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, rellenar, repetir } from '../../core/template.js';
import { anchoFlexible } from '../cuadricula-datos/cuadricula-datos.js';

const MAXIMO_RESULTADOS = 8;
const TEXTO_BUSCAR = 'Buscar';
let consecutivo = 0;

export const cargarPlantillasSelector = () => cargarHtml(new URL('./selector-registro.html', import.meta.url));

const normalizar = (texto) => String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function montarSelectorRegistro(contenedor, {
  plantillas, clave, etiqueta = 'registros', columnas, registros, elegido = null, vacio = 'Sin elegir',
  alElegir = () => {}, alSalir = null,
}) {
  const prefijo = `selector-${clave}-${++consecutivo}`;
  const plantilla = (id) => plantillas.querySelector(`#${id}`).innerHTML;
  const clase = (columna) => (columna.alinear === 'derecha' ? 'alinear-derecha' : '');
  const filtrables = columnas.filter((columna) => columna.filtrable !== false);

  contenedor.innerHTML = rellenar(plantilla('selector-estructura'), {
    clave,
    etiqueta,
    encabezados: repetir(plantillas, 'selector-encabezado', columnas.map((columna) => ({ titulo: columna.titulo, clase: clase(columna) }))),
    filtros: columnas.map((columna) => rellenar(plantilla(columna.filtrable === false ? 'selector-fijo' : 'selector-filtro'), {
      clave: columna.clave, titulo: columna.titulo, clase: clase(columna), etiqueta,
    })).join(''),
  });
  const raiz = contenedor.firstElementChild;
  raiz.style.setProperty('--columnas-selector', columnas.map((columna) => anchoFlexible(columna.ancho)).join(' '));
  const filaElegida = buscar('[data-elegido]', raiz);
  const anuncio = buscar('[data-anuncio]', raiz);
  const panel = buscar('[data-resultados]', raiz);
  const casillas = buscarTodos('[data-filtro-selector]', raiz);
  const columnaDe = (claveColumna) => columnas.find((columna) => columna.clave === claveColumna);
  const columnaDelAviso = filtrables.find((columna) => String(columna.ancho).includes('fr')) ?? filtrables[0];
  let actual = null;
  let encontrados = [];
  let posicionActiva = 0;

  const celdas = (registro) => columnas.map((columna) => (columna.html
    ? rellenar(plantilla('selector-celda-html'), { clase: clase(columna), titulo: columna.titulo, contenido: columna.html(registro) })
    : rellenar(plantilla('selector-celda'), { clase: clase(columna), titulo: columna.titulo, texto: registro[columna.clave] ?? '' }))).join('');

  // Los datos del elegido van como texto de ayuda de cada casilla: se ven siempre y escribir encima busca otro.
  // Sin elegido, las casillas dicen "Buscar" y la columna flexible (la del nombre, la más ancha) dice qué falta elegir
  function pintarElegido() {
    casillas.forEach((casilla) => {
      const columna = columnaDe(casilla.dataset.filtroSelector);
      const vacia = columna === columnaDelAviso ? vacio : TEXTO_BUSCAR;
      const texto = actual ? String(actual[columna.clave] ?? '') || '—' : vacia;
      casilla.placeholder = texto;
      casilla.title = actual ? `${columna.titulo}: ${texto}` : '';
    });
    buscarTodos('[data-celda-fija]', raiz).forEach((celda) => {
      const columna = columnaDe(celda.dataset.celdaFija);
      if (!actual) celda.textContent = '';
      else if (columna.html) celda.innerHTML = columna.html(actual);
      else celda.textContent = actual[columna.clave] ?? '';
    });
    filaElegida.classList.toggle('sin-registro', !actual);
    anuncio.textContent = actual ? `Elegido: ${actual.nombre ?? actual.id}` : vacio;
  }

  function cerrar() {
    panel.hidden = true;
    encontrados = [];
  }

  function marcarActiva() {
    buscarTodos('.resultado-selector', panel).forEach((fila, posicion) => fila.classList.toggle('activa', posicion === posicionActiva));
    buscar('.resultado-selector.activa', panel)?.scrollIntoView({ block: 'nearest' });
  }

  function pintarResultados() {
    const criterios = casillas.map((casilla) => [casilla.dataset.filtroSelector, normalizar(casilla.value)]).filter(([, texto]) => texto);
    if (!criterios.length) return cerrar();
    encontrados = registros().filter((registro) => criterios.every(([columna, texto]) => normalizar(registro[columna]).includes(texto)));
    posicionActiva = 0;
    let aviso = `${encontrados.length} ${etiqueta}`;
    if (!encontrados.length) aviso = 'Sin coincidencias';
    else if (encontrados.length > MAXIMO_RESULTADOS) aviso = `Mostrando ${MAXIMO_RESULTADOS} de ${encontrados.length}; escribe más para afinar`;
    panel.innerHTML = encontrados.slice(0, MAXIMO_RESULTADOS).map((registro, posicion) => rellenar(plantilla('selector-resultado'), {
      idOpcion: `${prefijo}-${posicion}`, id: registro.id, celdas: celdas(registro),
    })).join('') + rellenar(plantilla('selector-aviso'), { texto: `${aviso} · clic o Enter para elegir` });
    panel.hidden = false;
    marcarActiva();
  }

  // avisar = false al escribir el valor desde fuera (abrir un formulario, cargar un documento)
  function elegir(id, avisar = true) {
    actual = registros().find((registro) => String(registro.id) === String(id)) ?? null;
    casillas.forEach((casilla) => { casilla.value = ''; });
    cerrar();
    pintarElegido();
    if (avisar && actual) alElegir(actual);
  }

  casillas.forEach((casilla) => {
    casilla.addEventListener('input', pintarResultados);
    casilla.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') return cerrar();
      if (evento.key === 'Enter') {
        evento.preventDefault();
        if (!panel.hidden && encontrados.length) return elegir(encontrados[posicionActiva].id);
        return alSalir?.();
      }
      if (panel.hidden || !encontrados.length) return;
      const ultima = Math.min(encontrados.length, MAXIMO_RESULTADOS) - 1;
      if (evento.key === 'ArrowDown') posicionActiva = Math.min(ultima, posicionActiva + 1);
      else if (evento.key === 'ArrowUp') posicionActiva = Math.max(0, posicionActiva - 1);
      else return;
      evento.preventDefault();
      marcarActiva();
    });
  });
  panel.addEventListener('pointerdown', (evento) => evento.preventDefault());
  panel.addEventListener('click', (evento) => {
    const fila = evento.target.closest('.resultado-selector');
    if (fila) elegir(fila.dataset.id);
  });
  raiz.addEventListener('focusout', (evento) => {
    if (!raiz.contains(evento.relatedTarget)) cerrar();
  });

  elegir(typeof elegido === 'function' ? elegido() : elegido, false);

  return {
    elegido: () => actual,
    elegir,
    habilitar: (si) => casillas.forEach((casilla) => { casilla.disabled = !si; }),
    enfocar: () => buscar(`[data-filtro-selector="${filtrables[0]?.clave}"]`, raiz)?.focus({ preventScroll: true }),
    raiz,
  };
}
