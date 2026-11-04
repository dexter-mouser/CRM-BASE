import { buscar, buscarTodos } from '../../core/dom.js';
import { cargarHtml, repetir } from '../../core/template.js';
import { icono, ICONO_HAMBURGUESA, ICONO_CAMPANA, ICONO_LUPA, ICONO_MAS } from '../../core/iconos.js';
import { aFecha } from '../../core/format.js';
import { buscarCliente } from '../../services/clientes.service.js';
import { marcaActual } from '../../services/ajustes.service.js';
import { alertasDeCotizaciones } from '../../services/embudo.service.js';
import { puede, rolVisto, volverAMiRol } from '../../core/autorizacion.js';
import { GRUPOS, enlaceDeSeccion } from '../../config/nav.js';
import { tiendasPermitidas, puedeVerTodas, tiendaActivaId, elegirTienda, nombreDeTienda, TODAS_LAS_TIENDAS } from '../../core/tienda.js';
import { tareasPendientes, estaVencidaTarea } from '../../services/actividades.service.js';
import { prepararBotonTema } from '../../core/tema.js';
import { vistaActual } from '../../core/router.js';
import { mostrarAviso } from '../toast/toast.js';
import { registrarFallaDeAlmacenamiento } from '../../core/preferencias.js';
import { logoCompleto } from '../logo/logo.js';
import { mensajeDeError } from '../../core/errores.js';

// Aviso que deja el cambio de tienda para mostrarlo después de recargar
const CLAVE_AVISO_PENDIENTE = 'generico.aviso-pendiente';

export async function montarEncabezado(ranura, { alAlternarMenu, sesion }) {
  const documento = await cargarHtml(new URL('./header.html', import.meta.url));
  ranura.innerHTML = documento.querySelector('header').outerHTML;

  buscar('#alternar-menu').innerHTML = icono(ICONO_HAMBURGUESA);
  buscar('#alternar-menu').onclick = alAlternarMenu;
  prepararBotonTema(buscar('#alternar-tema'), (tema) => mostrarAviso(`Tema ${tema} aplicado correctamente`));
  refrescarMarca();
  pintarVerComo(documento);

  const iniciales = sesion.nombre.split(' ').slice(0, 2).map((palabra) => palabra[0]).join('').toUpperCase();
  const avatar = buscar('#usuario');
  avatar.textContent = iniciales;
  avatar.title = sesion.nombre;
  avatar.setAttribute('aria-label', `Usuario: ${sesion.nombre}`);

  montarBuscadorDePantallas(documento);
  montarSelectorDeTienda(documento);
  const vender = buscar('#boton-vender');
  vender.hidden = !puede('nueva-venta', 'crear') || vistaActual() === 'nueva-venta';
  buscar('#icono-vender').innerHTML = icono(ICONO_MAS);

  montarAlertas(documento);
}

// Buscador de pantallas: escribe "kardex" o "caja" y Enter abre esa pantalla. Ctrl+K lo enfoca desde cualquier página.
function montarBuscadorDePantallas(documento) {
  const pantallas = GRUPOS.flatMap((grupo) => grupo.secciones
    .filter((seccion) => puede(seccion.modulo, 'ver'))
    .map((seccion) => ({ texto: `${seccion.etiqueta} · ${grupo.etiqueta}`, enlace: enlaceDeSeccion(seccion) })));
  const campo = buscar('#buscar-pantalla');
  buscar('#icono-buscador').innerHTML = icono(ICONO_LUPA);
  buscar('#lista-pantallas').innerHTML = repetir(documento, 'opcion-pantalla', pantallas);
  const normalizar = (texto) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const abrir = () => {
    const escrito = normalizar(campo.value);
    if (!escrito) return;
    const elegida = pantallas.find((pantalla) => normalizar(pantalla.texto) === escrito)
      ?? pantallas.find((pantalla) => normalizar(pantalla.texto).startsWith(escrito))
      ?? pantallas.find((pantalla) => normalizar(pantalla.texto).includes(escrito));
    if (elegida) location.href = elegida.enlace;
    else mostrarAviso(`No hay una pantalla que se llame "${campo.value.trim()}"`, 'alerta');
  };
  buscar('#buscador-pantallas').onsubmit = (evento) => {
    evento.preventDefault();
    abrir();
  };
  // Elegir una opción de la lista la abre de inmediato
  campo.addEventListener('change', () => { if (pantallas.some((pantalla) => pantalla.texto === campo.value)) abrir(); });
  document.addEventListener('keydown', (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
      evento.preventDefault();
      campo.focus();
      campo.select();
    }
  });
}

// Selector de la sucursal activa: ventas, caja y stock se registran en ella; los listados la filtran
function montarSelectorDeTienda(documento) {
  const selector = buscar('#tienda-activa');
  const tiendas = tiendasPermitidas();
  const activa = tiendaActivaId();
  const opciones = [
    ...tiendas.map((tienda) => ({ id: tienda.id, nombre: tienda.nombre })),
    ...(puedeVerTodas() ? [{ id: TODAS_LAS_TIENDAS, nombre: 'Todas las sucursales' }] : []),
  ];
  selector.innerHTML = repetir(documento, 'opcion-tienda', opciones.map((opcion) => ({ ...opcion, seleccion: opcion.id === activa ? 'selected' : '' })));
  selector.disabled = opciones.length < 2;
  selector.onchange = () => {
    try {
      elegirTienda(selector.value);
      const nombre = selector.value === TODAS_LAS_TIENDAS ? 'Todas las sucursales' : nombreDeTienda(selector.value);
      try {
        sessionStorage.setItem(CLAVE_AVISO_PENDIENTE, `${nombre}: vista aplicada correctamente`);
      } catch (error) {
        registrarFallaDeAlmacenamiento(error);
      }
      location.reload();
    } catch (error) {
      mostrarAviso(mensajeDeError(error), 'alerta');
    }
  };
  // Aviso que dejó el cambio de tienda antes de recargar
  try {
    const pendiente = sessionStorage.getItem(CLAVE_AVISO_PENDIENTE);
    if (pendiente) {
      sessionStorage.removeItem(CLAVE_AVISO_PENDIENTE);
      mostrarAviso(pendiente);
    }
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
}

// Alertas del perfil de la sesión: cotizaciones vencidas sin motivo (de ese vendedor) y tareas vencidas o de hoy.
// La primera vez que se abre una página en la sesión se avisa también con un mensaje.
const CLAVE_ALERTAS_AVISADAS = 'generico.alertas-avisadas';
let plantillasEncabezado = null;

// Vuelve a calcular las alertas después de un cambio (registrar un motivo, completar una tarea)
export function refrescarAlertas() {
  if (plantillasEncabezado) pintarAlertas(plantillasEncabezado);
}

function montarAlertas(documento) {
  plantillasEncabezado = documento;
  const boton = buscar('#boton-alertas');
  const lista = buscar('#lista-alertas');
  boton.innerHTML = icono(ICONO_CAMPANA);
  boton.onclick = () => {
    lista.hidden = !lista.hidden;
    boton.setAttribute('aria-expanded', String(!lista.hidden));
  };
  document.addEventListener('click', (evento) => {
    if (!lista.hidden && !evento.target.closest('.contenedor-alertas')) {
      lista.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
    }
  });
  const cotizaciones = pintarAlertas(documento);

  let avisadas = false;
  try {
    avisadas = sessionStorage.getItem(CLAVE_ALERTAS_AVISADAS) === '1';
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
  if (cotizaciones && !avisadas) {
    mostrarAviso(`Tienes ${cotizaciones} cotización(es) vencida(s): registra el motivo en el Embudo`, 'alerta');
    try {
      sessionStorage.setItem(CLAVE_ALERTAS_AVISADAS, '1');
    } catch (error) {
      registrarFallaDeAlmacenamiento(error);
    }
  }
}

// Pinta el contador y la lista; devuelve cuántas cotizaciones vencidas hay
function pintarAlertas(documento) {
  const nombreCliente = (id) => buscarCliente(id)?.nombre ?? id;
  const finDeHoy = new Date().setHours(23, 59, 59, 999);
  const cotizaciones = alertasDeCotizaciones().map((cotizacion) => ({
    enlace: `embudo.html?perdida=${encodeURIComponent(cotizacion.id)}`,
    titulo: `Cotización ${cotizacion.id} vencida sin motivo`,
    detalle: `${cotizacion.cliente} · venció el ${aFecha(cotizacion.vigenciaHasta.slice(0, 10))} · registra por qué se perdió`,
  }));
  const tareas = tareasPendientes().filter((tarea) => new Date(tarea.vence).getTime() <= finDeHoy).map((tarea) => ({
    enlace: `clientes.html?ficha=${encodeURIComponent(tarea.clienteId)}`,
    titulo: `${estaVencidaTarea(tarea) ? 'Tarea vencida' : 'Tarea para hoy'}: ${tarea.descripcion}`,
    detalle: `${nombreCliente(tarea.clienteId)} · ${tarea.responsable}`,
  }));
  const alertas = [...cotizaciones, ...tareas];

  const boton = buscar('#boton-alertas');
  const lista = buscar('#lista-alertas');
  const contador = buscar('#contador-alertas');
  contador.hidden = !alertas.length;
  contador.textContent = alertas.length;
  boton.setAttribute('aria-label', alertas.length ? `Alertas: ${alertas.length} pendiente(s)` : 'Alertas: ninguna');
  lista.innerHTML = alertas.length
    ? repetir(documento, 'alerta', alertas)
    : '<div class="texto-suave">No tienes alertas pendientes.</div>';
  return cotizaciones.length;
}

// Logo y nombre comercial de Ajustes en el encabezado (también al guardar la marca)
export function refrescarMarca() {
  const enlace = buscar('.marca');
  enlace.innerHTML = logoCompleto(32);
  enlace.setAttribute('aria-label', `${marcaActual().nombreComercial}, ir al panel`);
}

// Franja fija mientras el Propietario ve la app como otro rol; "Volver a mi rol" regresa a Roles con su vista propia
function pintarVerComo(documento) {
  const rol = rolVisto();
  if (!rol) return;
  document.body.insertAdjacentHTML('beforeend', repetir(documento, 'franja-ver-como', [{ rol: rol.nombre }]));
  buscar('#volver-a-mi-rol').onclick = () => {
    volverAMiRol();
    location.href = 'roles.html';
  };
}
