// Cabecera destacada de cada sección: grupo del menú, título, descripción y los botones principales de la página.
// La dibuja el router encima de cada módulo con los datos de config/nav.js (etiqueta y descripcion de la sección).
// Un módulo puede completar el título o cambiar la descripción en dibujar(): contexto.cabecera = { complemento, descripcion }.
// Los botones con data-accion-cabecera se mueven a la cabecera (solo los de la parte visible de la página).
import { buscarTodos } from '../../core/dom.js';
import { cargarHtml, rellenar } from '../../core/template.js';
import { icono } from '../../core/iconos.js';
import { grupoDeModulo, seccionDeMenu } from '../../config/nav.js';

let plantillas;

export async function cargarCabecera() {
  plantillas ??= await cargarHtml(new URL('./cabecera-seccion.html', import.meta.url));
}

// HTML de la cabecera de un módulo (y de la parte pedida si la página se divide)
export function dibujarCabecera({ id, etiqueta, seccion, cabecera = {} }) {
  const grupo = grupoDeModulo(id);
  const entrada = seccionDeMenu(id, seccion);
  const complemento = cabecera.complemento
    ? rellenar(plantillas.querySelector('#complemento-titulo').innerHTML, { texto: cabecera.complemento })
    : '';
  return rellenar(plantillas.querySelector('#cabecera-seccion').innerHTML, {
    grupoId: grupo?.id ?? '',
    grupo: grupo?.etiqueta ?? 'Genérico',
    icono: grupo ? icono(grupo.icono) : '',
    iconoGrande: grupo ? icono(grupo.icono) : '',
    titulo: cabecera.titulo ?? entrada?.etiqueta ?? etiqueta,
    complemento,
    descripcion: cabecera.descripcion ?? entrada?.descripcion ?? '',
  });
}

// Pasa a la cabecera los botones principales del módulo que quedaron visibles
export function moverAccionesACabecera(raiz) {
  const destino = raiz.querySelector('.acciones-cabecera');
  if (!destino) return;
  buscarTodos('[data-accion-cabecera]', raiz)
    .filter((elemento) => !destino.contains(elemento) && !elemento.parentElement?.closest('[hidden]')
      && !(elemento.hasAttribute('data-seccion') && elemento.hidden))
    .forEach((elemento) => destino.append(elemento));
  destino.hidden = !destino.children.length;
}
