// Menú lateral: los 6 grupos siempre a la vista. Tocar un grupo despliega sus secciones sin cambiar de página;
// la página se abre al tocar una sección. Solo un grupo queda desplegado a la vez.
// Recogido: tocar un grupo expande el menú mientras se elige la sección (no cambia la preferencia guardada).
// Celular: el menú es una barra inferior y las secciones del grupo tocado salen en un panel encima de la barra.
import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, rellenar } from '../../core/template.js';
import { icono, ICONO_SALIR } from '../../core/iconos.js';
import { preferencias } from '../../core/preferencias.js';
import { cerrarSesion } from '../../core/sesion.js';
import { vistaActual, seccionActual } from '../../core/router.js';
import { GRUPOS, enlaceDeSeccion } from '../../config/nav.js';
import { puede } from '../../core/autorizacion.js';

const CLAVE_MENU = 'generico.menu-recogido';
const esCelular = () => matchMedia('(max-width: 800px)').matches;

// Secciones de un grupo que la persona puede ver
export const seccionesVisibles = (grupo) => grupo.secciones.filter((seccion) => puede(seccion.modulo, 'ver'));

// Grupos con al menos una sección visible para la persona
export const gruposVisibles = () => GRUPOS.map((grupo) => ({ ...grupo, secciones: seccionesVisibles(grupo) })).filter((grupo) => grupo.secciones.length);

// La sección de la página abierta: mismo módulo y, si la página se divide, la misma parte
export const esSeccionActual = (seccion) => seccion.modulo === vistaActual() && (!seccion.seccion || seccion.seccion === seccionActual());

export async function montarMenuLateral(ranura) {
  const documento = await cargarHtml(new URL('./sidebar.html', import.meta.url));
  ranura.innerHTML = documento.querySelector('aside').outerHTML;

  const menu = buscar('#menu-lateral');
  const plantillaGrupo = documento.querySelector('#grupo-menu').innerHTML;
  const plantillaSeccion = documento.querySelector('#seccion-enlace').innerHTML;
  const plantillaSalir = documento.querySelector('#opcion-salir').innerHTML;

  const grupos = gruposVisibles();
  const abiertoAlInicio = esCelular() ? null : grupos.find((grupo) => grupo.secciones.some(esSeccionActual))?.id;

  const partes = grupos.map((grupo, posicion) => {
    const actual = grupo.secciones.some(esSeccionActual);
    const abierto = grupo.id === abiertoAlInicio;
    const abreGrupoInferior = grupo.abajo && !grupos[posicion - 1]?.abajo;
    const html = rellenar(plantillaGrupo, {
      id: grupo.id,
      etiqueta: grupo.etiqueta,
      corta: grupo.corta ?? grupo.etiqueta,
      icono: icono(grupo.icono),
      clase: actual ? 'activa' : '',
      claseGrupo: abierto ? 'abierto' : '',
      abierto: String(abierto),
      oculto: abierto ? '' : 'hidden',
      cuenta: grupo.secciones.length,
      secciones: grupo.secciones.map((seccion) => rellenar(plantillaSeccion, {
        etiqueta: seccion.etiqueta,
        enlace: enlaceDeSeccion(seccion),
        clase: esSeccionActual(seccion) ? 'activa' : '',
      })).join(''),
    });
    return (abreGrupoInferior ? '<div class="separador-flexible"></div>' : '') + html;
  });

  // "Cerrar sesión" es siempre la última opción del menú
  menu.innerHTML = partes.join('') + rellenar(plantillaSalir, { icono: icono(ICONO_SALIR) });
  buscar('.opcion-menu.activa', menu)?.setAttribute('aria-current', 'true');
  buscar('.opcion-seccion.activa', menu)?.setAttribute('aria-current', 'page');
  buscar('#cerrar-sesion', menu).onclick = () => cerrarSesion();

  if (preferencias.leer(CLAVE_MENU) === '1') menu.classList.add('recogido');

  // Despliega un grupo (y pliega los demás) o lo pliega si ya estaba abierto
  const desplegar = (contenedor, abrir) => {
    buscarTodos('.grupo-menu', menu).forEach((grupo) => {
      const abierto = grupo === contenedor && abrir;
      grupo.classList.toggle('abierto', abierto);
      buscar('.opcion-menu', grupo).setAttribute('aria-expanded', String(abierto));
      buscar('.secciones-grupo', grupo).hidden = !abierto;
    });
  };

  const plegarTodo = () => {
    desplegar(null, false);
    if (menu.dataset.expandidoTemporal) {
      delete menu.dataset.expandidoTemporal;
      menu.classList.add('recogido');
    }
  };

  menu.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.grupo-menu > .opcion-menu');
    if (!boton) return;
    const contenedor = boton.parentElement;
    // Con el menú recogido se expande mientras se elige la sección
    if (!esCelular() && menu.classList.contains('recogido')) {
      menu.classList.remove('recogido');
      menu.dataset.expandidoTemporal = '1';
      desplegar(contenedor, true);
      return;
    }
    desplegar(contenedor, !contenedor.classList.contains('abierto'));
  });

  // En el celular o con el menú expandido de forma temporal, tocar fuera o Escape lo pliega
  document.addEventListener('click', (evento) => {
    if (menu.contains(evento.target)) return;
    if (esCelular() || menu.dataset.expandidoTemporal) plegarTodo();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && (esCelular() || menu.dataset.expandidoTemporal)) plegarTodo();
  });
}

export const leerMenuRecogido = () => preferencias.leer(CLAVE_MENU) === '1';

export function establecerMenuRecogido(recogido) {
  const menu = buscar('#menu-lateral');
  delete menu.dataset.expandidoTemporal;
  menu.classList.toggle('recogido', recogido);
  preferencias.guardar(CLAVE_MENU, recogido ? '1' : '0');
}

export function alternarMenuLateral() {
  establecerMenuRecogido(!leerMenuRecogido());
}
