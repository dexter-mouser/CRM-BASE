import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { logoCompleto } from '../../components/logo/logo.js';
import { iniciarSesion } from '../../core/sesion.js';
import { icono, ICONO_OJO, ICONO_OJO_TACHADO } from '../../core/iconos.js';
import { USUARIOS, CUENTAS_PRUEBA } from '../../config/acceso.js';
import { MENU } from '../../config/nav.js';
import { estado, guardarEstado } from '../../core/store.js';
import { DOMINIO_CORREO } from '../../core/validacion.js';
import { registrarAuditoria } from '../../services/auditoria.service.js';

// Bloqueo temporal tras varios intentos fallidos seguidos (en el servidor este control debe repetirse por usuario e IP)
const CLAVE_INTENTOS = 'generico.intentos';
const MAXIMO_INTENTOS = 5;
const MINUTOS_BLOQUEO = 5;
const MENSAJES_AVISO = {
  inactividad: 'Tu sesión se cerró por inactividad. Ingresa de nuevo.',
  desactivado: 'Tu acceso fue desactivado. Pide acceso al dueño de la tienda.',
};

const leerIntentos = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_INTENTOS)) ?? { fallos: 0, hasta: 0 }; } catch { return { fallos: 0, hasta: 0 }; }
};
const guardarIntentos = (datos) => {
  try { localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(datos)); } catch { /* sin almacenamiento */ }
};
const minutosDeBloqueo = () => Math.ceil((leerIntentos().hasta - Date.now()) / 60000);

// Deja registradas las cuentas de prueba aunque haya datos guardados de antes
function asegurarCuentasDePrueba() {
  let cambio = false;
  CUENTAS_PRUEBA.filter((cuenta) => estado.roles.some((rol) => rol.id === cuenta.rolId)).forEach((cuenta) => {
    const persona = estado.usuarios.find((existente) => existente.id === cuenta.id);
    if (!persona) {
      estado.usuarios.push({ ...cuenta, activo: true });
      cambio = true;
    } else if (persona.correo !== cuenta.correo) {
      persona.correo = cuenta.correo;
      cambio = true;
    }
  });
  if (cambio) guardarEstado();
}

export async function dibujar() {
  const documento = await cargarHtml(new URL('./acceso.html', import.meta.url));
  asegurarCuentasDePrueba();
  const cuentas = CUENTAS_PRUEBA.map((cuenta) => ({
    correo: cuenta.correo,
    rol: estado.roles.find((rol) => rol.id === cuenta.rolId)?.nombre ?? '',
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
    registrarAuditoria('acceso', 'Intento de ingreso fallido', motivo, 'Sin identificar');
    guardarEstado();
  };
  const entrar = (usuario) => {
    guardarIntentos({ fallos: 0, hasta: 0 });
    registrarAuditoria('acceso', 'Ingreso', usuario.correo, usuario.nombre);
    guardarEstado();
    iniciarSesion(usuario, recordar.checked);
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
    const persona = estado.usuarios.find((candidato) => candidato.correo === correo && candidato.activo);
    if (persona) return entrar({ usuario: persona.correo, nombre: persona.nombre, correo: persona.correo });
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
    const activa = usuario && estado.usuarios.some((persona) => persona.correo === usuario.correo && persona.activo);
    if (activa) return entrar(usuario);
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
    } catch {
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
