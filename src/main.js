// Arranque de las páginas protegidas (paginas/*.html): verifica la sesión y monta el menú.
import { buscar } from './core/dom.js';
import { iniciarTema } from './core/tema.js';
import { requerirSesion, cerrarSesion, vigilarInactividad } from './core/sesion.js';
import { usuarioActual } from './core/autorizacion.js';
import { iniciar } from './core/router.js';
import { montarEncabezado } from './components/header/header.js';
import { montarMenuLateral, alternarMenuLateral } from './components/sidebar/sidebar.js';

iniciarTema();
const sesion = requerirSesion();
// Si la persona fue desactivada o eliminada en Roles y permisos, la sesión deja de servir
if (sesion && !usuarioActual()) cerrarSesion('desactivado');
else if (sesion) {
  vigilarInactividad();
  await Promise.all([
    montarMenuLateral(buscar('#ranura-menu')),
    montarEncabezado(buscar('#ranura-encabezado'), { alAlternarMenu: alternarMenuLateral, sesion }),
  ]);
  iniciar();
}
