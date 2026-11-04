import { preferencias } from './preferencias.js';
import { icono, ICONO_SOL, ICONO_LUNA } from './iconos.js';
import { estado } from './store.js';

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
  aplicarMarca(estado.ajustes.marca.acento);
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

// Color de marca de Ajustes. Con el índigo del diseño se usan los valores de tono.css; con otro color se ponen en
// <html> las variables que tono.css usa en los dos temas (en oscuro, el color aclarado). previo.js repite este cálculo
// antes de pintar para que la página no parpadee.
const ACENTO_DEL_DISENO = '#4553c9';
const VARIABLES_DE_MARCA = ['--marca-claro', '--marca-texto-claro', '--marca-suave-claro', '--marca-oscuro', '--marca-texto-oscuro', '--marca-suave-oscuro'];

// Luminancia relativa de un color #rrggbb (0 = negro, 1 = blanco)
function luminancia(color) {
  const [rojo, verde, azul] = [1, 3, 5].map((inicio) => parseInt(color.slice(inicio, inicio + 2), 16) / 255)
    .map((canal) => (canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rojo + 0.7152 * verde + 0.0722 * azul;
}

function variablesDeMarca(acento) {
  if (!acento || acento === ACENTO_DEL_DISENO) return {};
  return {
    '--marca-claro': acento,
    '--marca-texto-claro': luminancia(acento) > 0.4 ? '#12142b' : '#ffffff',
    '--marca-suave-claro': `color-mix(in srgb, ${acento} 12%, #ffffff)`,
    '--marca-oscuro': `color-mix(in srgb, ${acento} 55%, #ffffff)`,
    '--marca-texto-oscuro': '#12142b',
    '--marca-suave-oscuro': `color-mix(in srgb, ${acento} 28%, #161615)`,
  };
}

export function aplicarMarca(acento) {
  const raiz = document.documentElement;
  VARIABLES_DE_MARCA.forEach((variable) => raiz.style.removeProperty(variable));
  Object.entries(variablesDeMarca(acento)).forEach(([variable, valor]) => raiz.style.setProperty(variable, valor));
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
