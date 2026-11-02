import { buscar } from '../../core/dom.js';

let temporizador;

// Muestra el aviso inferior. tipo: 'exito' (con ✓, para cambios aplicados) o 'alerta' (para advertencias).
export function mostrarAviso(texto, tipo = 'exito') {
  const aviso = buscar('#aviso');
  aviso.textContent = texto;
  aviso.dataset.tipo = tipo;
  aviso.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => aviso.classList.remove('visible'), 3000);
}
