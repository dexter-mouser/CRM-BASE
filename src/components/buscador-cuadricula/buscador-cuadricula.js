// Fila de búsqueda de la cuadrícula: los títulos de las columnas son casillas (código, referencia, descripción…).
// Las casillas se combinan. El panel que se abre debajo muestra los resultados alineados con las columnas y,
// mientras no se escribe nada, las últimas búsquedas. Flechas y Enter eligen; Escape cierra.
import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, repetir } from '../../core/template.js';
import { leerBusquedas, registrarBusqueda, borrarBusquedas, ETIQUETAS_BUSQUEDA } from '../../core/busquedas.js';
import { filtrarProductos, buscarProductoPorId } from '../../services/inventario.service.js';

const MAXIMO_RESULTADOS = 8;

export const cargarPlantillasBuscador = () =>
  cargarHtml(new URL('./buscador-cuadricula.html', import.meta.url));

export function montarBuscadorCuadricula(raiz, { plantillas, alElegir }) {
  const campos = buscarTodos('[data-filtro]', raiz);
  const fila = buscar('.fila-busqueda', raiz);
  const panel = buscar('#resultados-cuadricula', raiz);
  let encontrados = [];
  let posicionActiva = 0;
  let modo = 'cerrado';

  const filtros = () => Object.fromEntries(campos.map((campo) => [campo.dataset.filtro, campo.value]));
  const hayTexto = () => campos.some((campo) => campo.value.trim());

  function marcarActiva() {
    buscarTodos('.fila-resultado', panel).forEach((resultado, posicion) =>
      resultado.classList.toggle('activa', posicion === posicionActiva));
    const activa = buscar('.fila-resultado.activa', panel);
    activa?.scrollIntoView({ block: 'nearest' });
    campos.forEach((campo) => (activa
      ? campo.setAttribute('aria-activedescendant', activa.id)
      : campo.removeAttribute('aria-activedescendant')));
  }

  function cerrar() {
    modo = 'cerrado';
    panel.hidden = true;
    marcarActiva();
  }

  function pintarResultados() {
    modo = 'resultados';
    encontrados = filtrarProductos(filtros());
    posicionActiva = 0;
    const visibles = encontrados.slice(0, MAXIMO_RESULTADOS)
      .map((producto, posicion) => ({ ...producto, posicion }));
    let resumen = `${encontrados.length} producto(s)`;
    if (!encontrados.length) resumen = 'Sin coincidencias';
    else if (encontrados.length > MAXIMO_RESULTADOS) resumen = `Mostrando ${MAXIMO_RESULTADOS} de ${encontrados.length}; escribe más para afinar`;
    panel.innerHTML = repetir(plantillas, 'fila-resultado', visibles) + `<div class="aviso-cuadricula texto-suave">${resumen}</div>`;
    panel.hidden = false;
    marcarActiva();
  }

  function pintarRecientes() {
    const recientes = leerBusquedas().filter((busqueda) => campos.some((campo) => campo.dataset.filtro === busqueda.columna));
    if (!recientes.length) return cerrar();
    modo = 'recientes';
    panel.innerHTML = '<div class="cabecera-recientes"><span class="texto-suave">Últimas búsquedas</span>'
      + '<button type="button" class="boton-enlace" data-borrar>Borrar</button></div>'
      + '<div class="recientes">'
      + repetir(plantillas, 'busqueda-reciente', recientes.map((busqueda) => ({ ...busqueda, etiquetaColumna: ETIQUETAS_BUSQUEDA[busqueda.columna] })))
      + '</div>';
    panel.hidden = false;
    marcarActiva();
  }

  const actualizar = () => (hayTexto() ? pintarResultados() : pintarRecientes());

  // Al elegir se guardan las búsquedas escritas y se limpian las casillas para la siguiente
  function elegir(producto) {
    if (!producto) return;
    campos.forEach((campo) => {
      registrarBusqueda(campo.dataset.filtro, campo.value);
      campo.value = '';
    });
    cerrar();
    alElegir(producto);
  }

  campos.forEach((campo) => {
    campo.addEventListener('focus', actualizar);
    campo.addEventListener('input', actualizar);
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') return cerrar();
      if (modo !== 'resultados' || !encontrados.length) return;
      const ultima = Math.min(encontrados.length, MAXIMO_RESULTADOS) - 1;
      if (evento.key === 'ArrowDown') posicionActiva = Math.min(ultima, posicionActiva + 1);
      else if (evento.key === 'ArrowUp') posicionActiva = Math.max(0, posicionActiva - 1);
      else if (evento.key === 'Enter') {
        evento.preventDefault();
        // Un lector de códigos escribe el ID o la referencia completa y pulsa Enter: gana la coincidencia exacta
        const escrito = campo.value.trim().toLowerCase();
        const exacto = ['id', 'referencia'].includes(campo.dataset.filtro) && escrito
          ? encontrados.find((producto) => String(producto[campo.dataset.filtro]).toLowerCase() === escrito)
          : null;
        return elegir(exacto ?? encontrados[posicionActiva]);
      } else return;
      evento.preventDefault();
      marcarActiva();
    });
  });

  // Se evita que el clic en el panel le quite el foco a la casilla
  panel.addEventListener('pointerdown', (evento) => evento.preventDefault());
  panel.addEventListener('click', (evento) => {
    const resultado = evento.target.closest('.fila-resultado');
    if (resultado) return elegir(buscarProductoPorId(resultado.dataset.id));

    const reciente = evento.target.closest('.reciente');
    if (reciente) {
      const campo = campos.find((candidato) => candidato.dataset.filtro === reciente.dataset.columna);
      campo.value = reciente.dataset.texto;
      campo.focus();
      return actualizar();
    }

    if (evento.target.closest('[data-borrar]')) {
      borrarBusquedas();
      cerrar();
    }
  });

  fila.addEventListener('focusout', (evento) => {
    if (!fila.contains(evento.relatedTarget)) cerrar();
  });
}
