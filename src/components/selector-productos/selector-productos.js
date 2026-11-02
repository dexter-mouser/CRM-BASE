// Buscador de productos: filtra por ID, nombre, referencia, costo o stock (varias palabras a la vez).
// Enter elige el primer resultado, lo que sirve para ID escritos o leídos con lector de códigos.
// Con la casilla vacía muestra las últimas búsquedas.
import { buscar } from '../../core/dom.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { aPesos } from '../../core/format.js';
import { leerBusquedas, registrarBusqueda } from '../../core/busquedas.js';
import { buscarProductos, buscarProductoPorId } from '../../services/inventario.service.js';

const MAXIMO_RESULTADOS = 8;
let documento;

export async function dibujarSelector() {
  documento = await cargarHtml(new URL('./selector-productos.html', import.meta.url));
  return seccion(documento, 'selector');
}

export function montarSelectorProductos(raiz, { alElegir }) {
  const campo = buscar('#buscar-producto', raiz);
  const lista = buscar('#resultados-productos', raiz);
  const conteo = buscar('#conteo-productos', raiz);
  const recientes = buscar('#recientes-productos', raiz);

  const pintarRecientes = () => {
    const busquedas = leerBusquedas().filter((busqueda) => busqueda.columna === 'general');
    recientes.innerHTML = campo.value.trim() || !busquedas.length
      ? ''
      : '<span class="texto-suave">Últimas búsquedas:</span>' + repetir(documento, 'busqueda-reciente-simple', busquedas);
  };

  const pintar = () => {
    pintarRecientes();
    const encontrados = buscarProductos(campo.value);
    const visibles = encontrados.slice(0, MAXIMO_RESULTADOS).map((producto) => ({ ...producto, costo: aPesos(producto.costo) }));
    lista.innerHTML = repetir(documento, 'resultado-producto', visibles);
    if (!encontrados.length) conteo.textContent = 'Sin coincidencias';
    else if (encontrados.length > MAXIMO_RESULTADOS) conteo.textContent = `Mostrando ${MAXIMO_RESULTADOS} de ${encontrados.length}; escribe más para afinar`;
    else conteo.textContent = `${encontrados.length} producto(s)`;
  };

  campo.oninput = pintar;
  campo.onkeydown = (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    lista.querySelector('.resultado')?.click();
  };
  recientes.onclick = (evento) => {
    const reciente = evento.target.closest('.reciente');
    if (!reciente) return;
    campo.value = reciente.dataset.texto;
    campo.focus();
    pintar();
  };
  lista.onclick = (evento) => {
    const boton = evento.target.closest('.resultado');
    if (!boton) return;
    registrarBusqueda('general', campo.value);
    alElegir(buscarProductoPorId(boton.dataset.id));
    campo.focus();
    campo.select();
  };
  pintar();
}
