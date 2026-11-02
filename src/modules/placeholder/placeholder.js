import { cargarHtml, seccion } from '../../core/template.js';

export async function dibujar({ etiqueta }) {
  const documento = await cargarHtml(new URL('./placeholder.html', import.meta.url));
  return seccion(documento, 'principal', { etiqueta });
}
