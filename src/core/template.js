import { escaparHtml } from './dom.js';

const memoria = new Map();
const MARCADORES = /(?:<!--)?\{\{\{(\w+)\}\}\}(?:-->)?|\{\{(\w+)\}\}/g;

// Carga un archivo .html y lo devuelve como contenedor consultable
export async function cargarHtml(url) {
  const clave = String(url);
  if (!memoria.has(clave)) {
    // no-cache: el navegador revalida con el servidor y nunca muestra una plantilla vieja tras un cambio
    const respuesta = await fetch(url, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error('No se pudo cargar ' + clave);
    memoria.set(clave, await respuesta.text());
  }
  const contenedor = document.createElement('div');
  contenedor.innerHTML = memoria.get(clave);
  return contenedor;
}

// {{x}} escapa el valor; {{{x}}} inserta HTML; <!--{{{x}}}--> sirve dentro de tablas
export const rellenar = (html, datos) =>
  html.replace(MARCADORES, (_coincidencia, claveHtml, claveTexto) =>
    claveHtml ? (datos[claveHtml] ?? '') : escaparHtml(datos[claveTexto] ?? ''));

export const seccion = (documento, id, datos = {}) =>
  rellenar(documento.querySelector('#' + id).innerHTML, datos);

export const repetir = (documento, id, elementos) => {
  const plantilla = documento.querySelector('#' + id).innerHTML;
  return elementos.map((elemento) => rellenar(plantilla, elemento)).join('');
};
