import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { logoCompleto } from '../../components/logo/logo.js';
import { iniciarSesion } from '../../core/sesion.js';
import { icono, ICONO_OJO, ICONO_OJO_TACHADO } from '../../core/iconos.js';
import { USUARIOS, CUENTAS_PRUEBA } from '../../config/acceso.js';
import { MENU } from '../../config/nav.js';
import { buscarRol, buscarUsuarioActivoPorCorreo } from '../../services/roles.service.js';
import { DOMINIO_CORREO } from '../../core/validacion.js';
import { registrarFallaDeAlmacenamiento } from '../../core/preferencias.js';
import { registrarEventoDeAcceso } from '../../services/auditoria.service.js';
import { mensajeDeError } from '../../core/errores.js';

// Bloqueo temporal tras varios intentos fallidos seguidos (en el servidor este control debe repetirse por usuario e IP)
const CLAVE_INTENTOS = 'generico.intentos';
const MAXIMO_INTENTOS = 5;
const MINUTOS_BLOQUEO = 5;
const MENSAJES_AVISO = {
  inactividad: 'Tu sesión se cerró por inactividad. Ingresa de nuevo.',
  desactivado: 'Tu acceso fue desactivado. Pide acceso al dueño de la tienda.',
};

const leerIntentos = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_INTENTOS)) ?? { fallos: 0, hasta: 0 };
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
    return { fallos: 0, hasta: 0 };
  }
};
const guardarIntentos = (datos) => {
  try {
    localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(datos));
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
};
const minutosDeBloqueo = () => Math.ceil((leerIntentos().hasta - Date.now()) / 60000);

export async function dibujar() {
  const documento = await cargarHtml(new URL('./acceso.html', import.meta.url));
  const cuentas = CUENTAS_PRUEBA.map((cuenta) => ({
    correo: cuenta.correo,
    rol: buscarRol(cuenta.rolId)?.nombre ?? '',
  }));
  return seccion(documento, 'principal', { logo: logoCompleto(40), cuentas: repetir(documento, 'cuenta-prueba', cuentas) });
}

// Solo se vuelve a páginas propias del menú: evita redirecciones a sitios externos.
const CARPETA_PAGINAS = 'paginas/';
export function destinoSeguro() {
  const pedido = new URLSearchParams(location.search).get('siguiente');
  const pagina = MENU.some((opcion) => `${opcion.id}.html` === pedido) ? pedido : 'panel.html';
  return CARPETA_PAGINAS + pagina;
}

export function montar(raiz) {
  const error = buscar('#error', raiz);
  const recordar = buscar('#recordar', raiz);
  const formularios = { correo: buscar('#f-correo', raiz), clave: buscar('#f-clave', raiz) };
  const botones = buscarTodos('[data-pestana]', raiz);

  const elegir = (nombre) => {
    botones.forEach((boton) => boton.setAttribute('aria-pressed', String(boton.dataset.pestana === nombre)));
    for (const [clave, formulario] of Object.entries(formularios)) formulario.hidden = clave !== nombre;
    error.textContent = '';
    buscar('input', formularios[nombre]).focus();
  };
  const fallar = (texto, campo) => {
    error.textContent = texto;
    campo.focus();
  };
  const aviso = new URLSearchParams(location.search).get('aviso');
  if (MENSAJES_AVISO[aviso]) error.textContent = MENSAJES_AVISO[aviso];

  // Devuelve true si hay un bloqueo vigente y avisa cuánto falta
  const bloqueado = (campo) => {
    if (leerIntentos().hasta <= Date.now()) return false;
    fallar(`Demasiados intentos fallidos. Espera ${minutosDeBloqueo()} minuto(s) e inténtalo de nuevo.`, campo);
    return true;
  };
  const registrarFallo = (motivo) => {
    const datos = leerIntentos();
    datos.fallos = datos.hasta && datos.hasta <= Date.now() ? 1 : datos.fallos + 1;
    if (datos.fallos >= MAXIMO_INTENTOS) {
      datos.hasta = Date.now() + MINUTOS_BLOQUEO * 60000;
      datos.fallos = 0;
    }
    guardarIntentos(datos);
    try {
      registrarEventoDeAcceso('Intento de ingreso fallido', motivo, 'Sin identificar');
    } catch (falla) {
      // El aviso del intento fallido sigue siendo lo que la persona necesita ver
      console.error('No se pudo auditar el intento fallido', falla);
    }
  };
  const entrar = (usuario, campo) => {
    try {
      registrarEventoDeAcceso('Ingreso', usuario.correo, usuario.nombre);
      iniciarSesion(usuario, recordar.checked);
    } catch (falla) {
      return fallar(mensajeDeError(falla), campo);
    }
    guardarIntentos({ fallos: 0, hasta: 0 });
    location.replace(destinoSeguro());
  };

  botones.forEach((boton) => (boton.onclick = () => elegir(boton.dataset.pestana)));

  formularios.correo.onsubmit = (evento) => {
    evento.preventDefault();
    const campo = buscar('#correo', raiz);
    const escrito = campo.value.trim().toLowerCase();
    // Basta con escribir la parte anterior a la arroba: el dominio se completa solo
    const correo = escrito && !escrito.includes('@') ? `${escrito}@${DOMINIO_CORREO}` : escrito;
    if (!correo) return fallar('Escribe tu correo.', campo);
    if (bloqueado(campo)) return;
    // Pueden entrar las personas activas de Roles y permisos y el acceso de prueba
    const persona = buscarUsuarioActivoPorCorreo(correo);
    if (persona) return entrar({ usuario: persona.correo, nombre: persona.nombre, correo: persona.correo }, campo);
    registrarFallo(correo);
    fallar('Ese correo no está autorizado. Pide acceso al dueño de la tienda.', campo);
  };

  formularios.clave.onsubmit = (evento) => {
    evento.preventDefault();
    const campoUsuario = buscar('#usuario', raiz), campoClave = buscar('#clave', raiz);
    if (!campoUsuario.value.trim() || !campoClave.value) return fallar('Escribe tu usuario y tu clave.', campoUsuario);
    if (bloqueado(campoClave)) return;
    const usuario = USUARIOS.find((candidato) =>
      candidato.usuario === campoUsuario.value.trim() && candidato.clave === campoClave.value);
    const activa = usuario && Boolean(buscarUsuarioActivoPorCorreo(usuario.correo));
    if (activa) return entrar(usuario, campoClave);
    registrarFallo(campoUsuario.value.trim());
    fallar('Usuario o clave incorrectos. Revisa los datos e inténtalo de nuevo.', campoClave);
  };

  // Copiar el correo de una cuenta de prueba
  const textoCopiado = buscar('#copiado', raiz);
  buscar('#cuentas-prueba', raiz).addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-copiar]');
    if (!boton) return;
    const correo = boton.dataset.copiar;
    try {
      await navigator.clipboard.writeText(correo);
      textoCopiado.textContent = `Correo ${correo} copiado correctamente`;
    } catch (error) {
      console.error('No se pudo copiar al portapapeles', error);
      buscar('#correo', raiz).value = correo;
      textoCopiado.textContent = 'No se pudo copiar: el correo quedó escrito en el campo';
    }
  });

  // El botón de la clave es un icono: ojo para mostrar y ojo tachado para ocultar
  const botonVer = buscar('#ver', raiz);
  const pintarOjo = (visible) => {
    botonVer.innerHTML = icono(visible ? ICONO_OJO_TACHADO : ICONO_OJO);
    botonVer.setAttribute('aria-label', visible ? 'Ocultar la clave' : 'Mostrar la clave');
    botonVer.setAttribute('aria-pressed', String(visible));
  };
  pintarOjo(false);
  botonVer.onclick = () => {
    const campo = buscar('#clave', raiz);
    const visible = campo.type === 'password';
    campo.type = visible ? 'text' : 'password';
    pintarOjo(visible);
  };
}
