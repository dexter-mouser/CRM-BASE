// Arranque de index.html (única página pública). Si ya hay sesión vigente, entra directo.
import { buscar } from './core/dom.js';
import { iniciarTema, prepararBotonTema } from './core/tema.js';
import { sesionActual } from './core/sesion.js';
import { dibujar, montar, destinoSeguro } from './modules/acceso/acceso.js';

iniciarTema();
if (sesionActual()) {
  location.replace(destinoSeguro());
} else {
  const raiz = buscar('#acceso');
  raiz.innerHTML = await dibujar();
  montar(raiz);
  prepararBotonTema(buscar('#alternar-tema'));
}
