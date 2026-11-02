import { buscar, escaparHtml } from './dom.js';
import { animar } from './animate.js';
import { activarCamposNumericos } from './numeros.js';
import { MENU, grupoDeModulo, enlaceDeSeccion } from '../config/nav.js';
import { rutas } from '../config/routes.js';
import { mostrarAviso } from '../components/toast/toast.js';
import { puede } from './autorizacion.js';
import { cargarCabecera, dibujarCabecera, moverAccionesACabecera } from '../components/cabecera-seccion/cabecera-seccion.js';

const ESQUELETO = '<div class="tarjetas">' + '<div class="esqueleto"></div>'.repeat(4) + '</div>'
  + '<div class="dos-columnas"><div class="esqueleto alto"></div><div class="esqueleto alto"></div></div>';
let turno = 0;

// Cada página HTML declara su vista en <body data-vista="...">
export const vistaActual = () => document.body.dataset.vista || 'panel';

// Parte de la página que se muestra (?seccion=...). Si la página se divide y no se pide ninguna, la primera.
export function seccionActual() {
  const propias = (grupoDeModulo(vistaActual())?.secciones ?? []).filter((seccion) => seccion.modulo === vistaActual() && seccion.seccion);
  const pedida = new URLSearchParams(location.search).get('seccion');
  return propias.some((seccion) => seccion.seccion === pedida) ? pedida : (propias[0]?.seccion ?? '');
}

// Pestañas con las secciones del grupo de la página (las mismas que el menú muestra bajo el grupo abierto)
function pestanasDelGrupo() {
  const grupo = grupoDeModulo(vistaActual());
  const secciones = (grupo?.secciones ?? []).filter((seccion) => puede(seccion.modulo, 'ver'));
  if (secciones.length < 2) return '';
  const enlaces = secciones.map((seccion) => {
    const actual = seccion.modulo === vistaActual() && (!seccion.seccion || seccion.seccion === seccionActual());
    return `<a class="pestana-grupo${actual ? ' activa' : ''}" href="${escaparHtml(enlaceDeSeccion(seccion))}"${actual ? ' aria-current="page"' : ''}>${escaparHtml(seccion.etiqueta)}</a>`;
  }).join('');
  return `<nav class="pestanas-grupo" aria-label="Secciones de ${escaparHtml(grupo.etiqueta)}">${enlaces}</nav>`;
}

// Oculta las partes de la página que no son de la sección actual (elementos con data-seccion)
function mostrarSoloSeccion(raiz) {
  const seccion = seccionActual();
  if (!seccion) return;
  raiz.querySelectorAll('[data-seccion]').forEach((parte) => { parte.hidden = parte.dataset.seccion !== seccion; });
}

// Cada módulo exporta dibujar(contexto) -> HTML y, opcionalmente, montar(raiz, contexto).
// Encima del módulo van la cabecera destacada de la sección y las pestañas del grupo.
async function mostrar(conEsqueleto) {
  const id = vistaActual(), miTurno = ++turno, raiz = buscar('#vista');
  try {
    if (conEsqueleto) {
      raiz.innerHTML = ESQUELETO;
      await new Promise((resolver) => setTimeout(resolver, 450));
    }
    if (!puede(id, 'ver')) {
      raiz.innerHTML = '<div class="caja"><strong>No tienes acceso a esta pantalla</strong><div class="texto-suave margen-superior">Tu rol no incluye este módulo. Pide acceso al dueño de la tienda.</div></div>';
      return;
    }
    const modulo = await (rutas[id] || rutas.placeholder)();
    const opcion = MENU.find((elemento) => elemento.id === id) || { etiqueta: id };
    const contexto = {
      id,
      etiqueta: opcion.etiqueta,
      seccion: seccionActual(),
      redibujar: () => mostrar(false),
      aviso: (texto) => mostrarAviso(texto, 'exito'),
      alerta: (texto) => mostrarAviso(texto, 'alerta'),
    };
    await cargarCabecera();
    const html = await modulo.dibujar(contexto);
    if (miTurno !== turno) return;
    // data-grupo da a todo el contenido el color del grupo del menú (cabecera, pestañas, fichas y formularios)
    raiz.innerHTML = `<div class="vista${conEsqueleto ? '' : ' sin-animacion'}" data-grupo="${escaparHtml(grupoDeModulo(id)?.id ?? '')}">${dibujarCabecera(contexto)}${pestanasDelGrupo()}${html}</div>`;
    animar(raiz, conEsqueleto);
    activarCamposNumericos(raiz);
    mostrarSoloSeccion(raiz);
    moverAccionesACabecera(raiz);
    modulo.montar?.(raiz, contexto);
  } catch (error) {
    raiz.innerHTML = '<div class="caja"><div class="texto-suave">No se pudo cargar esta pantalla. Si abriste el archivo directamente, usa un servidor local (ver README).</div></div>';
    console.error(error);
  }
}

export function iniciar() { mostrar(true); }
