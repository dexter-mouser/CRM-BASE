// Utilidades mínimas para trabajar con el DOM
const REEMPLAZOS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const buscar = (selector, raiz = document) => raiz.querySelector(selector);
export const buscarTodos = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];
export const escaparHtml = (texto) => String(texto).replace(/[&<>"']/g, (caracter) => REEMPLAZOS[caracter]);
