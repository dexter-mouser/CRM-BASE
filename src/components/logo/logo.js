// Logo de la marca: el de Ajustes (imagen y nombre comercial) o, sin imagen, la G de Genérico con el color de acento.
// El glifo usa las variables del tema, por lo que cambia con el modo claro/oscuro.
import { marcaActual } from '../../services/ajustes.service.js';
import { escaparHtml } from '../../core/dom.js';

const GLIFO =
  '<circle cx="32" cy="32" r="22" style="fill:none;stroke:var(--suave);stroke-width:1.2;opacity:.5"/>'
  + '<circle cx="47.6" cy="16.4" r="2.4" style="fill:var(--suave)"/>'
  + '<path d="M43.5 22.4A15 15 0 1 0 47 32H34" style="fill:none;stroke:var(--acento-texto);stroke-width:6;stroke-linecap:round;stroke-linejoin:round"/>';

const logoIcono = (tamano) =>
  `<svg width="${tamano}" height="${tamano}" viewBox="0 0 64 64" aria-hidden="true" style="flex:none">`
  + `<rect x="4" y="4" width="56" height="56" rx="16" style="fill:var(--acento)"/>${GLIFO}</svg>`;

const logoImagen = (logo, tamano) => `<img class="logo-imagen" src="${escaparHtml(logo)}" width="${tamano}" height="${tamano}" alt="">`;

export function logoCompleto(tamano = 32) {
  const { nombreComercial, logo } = marcaActual();
  return `<span class="logo">${logo ? logoImagen(logo, tamano) : logoIcono(tamano)}<span>${escaparHtml(nombreComercial)}</span></span>`;
}
