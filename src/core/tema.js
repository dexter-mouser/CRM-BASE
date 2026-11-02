import { preferencias } from './preferencias.js';
import { icono, ICONO_SOL, ICONO_LUNA } from './iconos.js';

const CLAVE_TEMA = 'generico.tema';

const TEMA_AUTOMATICO = 'automatico';

const consultaOscuro = matchMedia('(prefers-color-scheme: dark)');

export const leerTema = () => preferencias.leer(CLAVE_TEMA) || TEMA_AUTOMATICO;

// El atributo data-tema siempre queda en 'claro' u 'oscuro': el automático se resuelve con el dispositivo
function pintarTema(tema) {
  const resuelto = tema === 'claro' || tema === 'oscuro' ? tema : (consultaOscuro.matches ? 'oscuro' : 'claro');
  document.documentElement.dataset.tema = resuelto;
}

export function iniciarTema() {
  pintarTema(leerTema());
  // En automático, sigue los cambios del dispositivo sin recargar
  consultaOscuro.addEventListener('change', () => {
    if (leerTema() === TEMA_AUTOMATICO) pintarTema(TEMA_AUTOMATICO);
  });
}

// Aplica y guarda el tema: 'claro', 'oscuro' o 'automatico' (sigue al dispositivo)
export function aplicarTema(tema) {
  if (tema !== 'claro' && tema !== 'oscuro') tema = TEMA_AUTOMATICO;
  pintarTema(tema);
  preferencias.guardar(CLAVE_TEMA, tema);
  return tema;
}

// Cambia entre claro y oscuro y devuelve el tema aplicado
function alternarTema() {
  return aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro');
}

// Botón de tema como icono: la luna se ve en modo claro y el sol en modo oscuro (lo decide el CSS)
export function prepararBotonTema(boton, alCambiar) {
  boton.innerHTML = icono(ICONO_LUNA, 'icono-luna') + icono(ICONO_SOL, 'icono-sol');
  boton.title = 'Cambiar entre modo claro y oscuro';
  boton.onclick = () => {
    const tema = alternarTema();
    if (alCambiar) alCambiar(tema);
  };
}
