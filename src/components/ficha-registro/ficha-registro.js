// Ficha de un registro (la misma idea de la ficha del cliente): se abre desde el botón "Ficha" de una fila de la
// cuadrícula, muestra toda la información desplegada y, si el registro se puede cambiar, ofrece "Editar".
//
// const ficha = crearFicha(contenedor, plantillas)
// ficha.abrir(id, armar): armar() devuelve las opciones de la ficha (o null si el registro ya no existe):
//   { titulo, subtitulo, etiqueta, insignias, indicadores, datos, contenido, acciones, alEditar, alMontar }
//   indicadores  [{ etiqueta, valor, clase }]      cifras destacadas
//   datos        [{ etiqueta, valor, html, ancho }] campos del registro (html: valor ya escapado; ancho: ocupa la fila)
//   contenido    HTML extra (por ejemplo, contenedores de cuadrículas que se llenan en alMontar)
//   acciones     HTML de botones propios; el módulo los escucha en el contenedor
//   alEditar     función que abre el formulario del módulo con el registro; sin ella no hay botón "Editar"
//   alMontar     función (seccion) llamada tras pintar la ficha
// ficha.cerrar(), ficha.idAbierto() y ficha.refrescar() (vuelve a abrir la misma ficha con los datos nuevos).
import { cargarHtml, rellenar, repetir } from '../../core/template.js';

export const cargarPlantillasFicha = () => cargarHtml(new URL('./ficha-registro.html', import.meta.url));

let consecutivo = 0;

export function crearFicha(contenedor, plantillas) {
  const clave = `ficha-${++consecutivo}`;
  let abierta = null; // { id, armar }

  const plantilla = (id) => plantillas.querySelector(`#${id}`).innerHTML;

  function pintar(opciones) {
    const {
      titulo, subtitulo = '', etiqueta = 'Ficha', insignias = '', indicadores = [], datos = [],
      contenido = '', acciones = '', alEditar = null, alMontar = null,
    } = opciones;
    const listaDatos = datos.filter((dato) => dato && dato.valor !== undefined).map((dato) => rellenar(
      plantilla(dato.html ? 'dato-html' : 'dato'),
      { etiqueta: dato.etiqueta, valor: dato.valor === '' || dato.valor === null ? '—' : dato.valor, clase: dato.ancho ? 'dato-ancho' : '' },
    )).join('');

    contenedor.innerHTML = rellenar(plantilla('ficha-registro'), {
      clave,
      etiqueta,
      titulo,
      subtitulo,
      insignias,
      acciones,
      editar: alEditar ? plantilla('boton-editar') : '',
      indicadores: indicadores.length ? rellenar(plantilla('indicadores'), { lista: repetir(plantillas, 'indicador', indicadores.map((indicador) => ({ clase: '', ...indicador }))) }) : '',
      datos: listaDatos ? rellenar(plantilla('datos'), { lista: listaDatos }) : '',
      contenido,
    });
    contenedor.hidden = false;
    const seccion = contenedor.firstElementChild;
    seccion.querySelector('[data-cerrar-ficha]').onclick = cerrar;
    const editar = seccion.querySelector('[data-editar-ficha]');
    if (editar) editar.onclick = alEditar;
    alMontar?.(seccion);
    return seccion;
  }

  // armar: función que devuelve las opciones de la ficha (se vuelve a llamar al refrescar)
  function abrir(id, armar) {
    const opciones = armar();
    if (!opciones) return;
    abierta = { id, armar };
    const seccion = pintar(opciones);
    seccion.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function cerrar() {
    abierta = null;
    contenedor.innerHTML = '';
    contenedor.hidden = true;
  }

  function refrescar() {
    if (!abierta) return;
    const opciones = abierta.armar();
    if (opciones) pintar(opciones);
    else cerrar();
  }

  contenedor.hidden = true;
  return { abrir, cerrar, refrescar, idAbierto: () => abierta?.id ?? null };
}
