// Campos numéricos escritos a mano: son de texto, así que no tienen flechas de aumento ni rueda del ratón.
// data-numero="entero" admite solo dígitos; data-numero="entero-negativo" admite además un "-" inicial.
import { buscarTodos } from './dom.js';

export const leerEntero = (texto) => parseInt(String(texto).replace(/[^\d-]/g, ''), 10) || 0;

export function activarCamposNumericos(raiz) {
  buscarTodos('[data-numero]', raiz).forEach((campo) => {
    const admiteNegativo = campo.dataset.numero === 'entero-negativo';
    campo.addEventListener('input', () => {
      const signo = admiteNegativo && campo.value.trimStart().startsWith('-') ? '-' : '';
      const limpio = signo + campo.value.replace(/\D/g, '');
      if (limpio !== campo.value) campo.value = limpio;
    });
  });
}
