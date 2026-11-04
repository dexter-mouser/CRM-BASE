import { buscar } from '../../core/dom.js';
import { buscarCliente } from '../../services/clientes.service.js';
import { usuariosActivos } from '../../services/roles.service.js';
import { aFecha, fechaDeHoy } from '../../core/format.js';
import { puede, rolActual, usuarioActual } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import * as servicioActividades from '../../services/actividades.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { refrescarAlertas } from '../../components/header/header.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { COLUMNAS_CLIENTE, clientesParaElegir } from '../../components/selector-registro/registros.js';
import { nombreDe, opcionesDe, primeroActivo } from '../../services/catalogos.service.js';
import { importarActividades } from '../../services/importacion.service.js';
import { mensajeDeError } from '../../core/errores.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

const nombreCliente = (id) => buscarCliente(id)?.nombre ?? id;

// Clientes que se buscan y eligen en el formulario (el consumidor final no tiene seguimiento)
const clientesConDatos = () => clientesParaElegir((cliente) => !cliente.generico);
const { buscarActividad } = servicioActividades;

export async function dibujar() {
  documento = await cargarHtml(new URL('./seguimiento.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  return seccion(documento, 'principal');
}

export function montar(raiz, contexto) {
  const ficha = crearFicha(buscar('#ficha-actividad', raiz), plantillasFicha);
  buscar('#nueva-actividad', raiz).hidden = !puede('seguimiento', 'crear');

  const ejecutar = (accion, mensaje) => {
    try {
      accion();
      contexto.aviso(mensaje);
      return true;
    } catch (error) {
      contexto.alerta(mensajeDeError(error));
      return false;
    }
  };

  const estadoDe = (actividad) => {
    if (!servicioActividades.esPendiente(actividad)) return { texto: actividad.tipo === 'tarea' ? 'Hecha' : 'Registrada', clase: 'suave' };
    return servicioActividades.estaVencidaTarea(actividad) ? { texto: 'Vencida', clase: '' } : { texto: 'Pendiente', clase: 'suave' };
  };

  // --- Formulario (nueva actividad o edición) -------------------------------------------------------------
  // La fecha y el responsable solo aplican a una tarea pendiente; el resultado, a una actividad ya registrada
  const mostrarCamposTarea = (tipo, formularioActividad) => {
    const actividad = formularioActividad.registro();
    const esTarea = actividad ? servicioActividades.esPendiente(actividad) : tipo === 'tarea';
    formularioActividad.mostrar('vence', esTarea);
    formularioActividad.mostrar('responsableCorreo', esTarea);
    formularioActividad.mostrar('resultado', Boolean(actividad));
  };

  const formulario = montarFormulario(buscar('#formulario-actividad', raiz), {
    plantillas: plantillasFormulario,
    clave: 'actividad',
    titulo: 'Nueva actividad o tarea',
    tituloEditar: (actividad) => `Editar ${actividad.id}`,
    alError: contexto.alerta,
    campos: [
      {
        clave: 'clienteId', etiqueta: 'Cliente', tipo: 'registro', obligatorio: true, valor: '', plural: 'clientes', vacio: 'Elige el cliente',
        columnas: COLUMNAS_CLIENTE, registros: clientesConDatos,
      },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', obligatorio: true, valor: () => primeroActivo('tiposActividad'), opciones: (actividad) => opcionesDe('tiposActividad', actividad?.tipo), alCambiar: mostrarCamposTarea },
      { clave: 'descripcion', etiqueta: 'Descripción', maximo: 300, obligatorio: true, ejemplo: 'Qué se habló o qué hay que hacer' },
      { clave: 'vence', etiqueta: 'Fecha de la tarea', tipo: 'fecha', valor: fechaDeHoy, obligatorio: true },
      {
        clave: 'responsableCorreo', etiqueta: 'Responsable', tipo: 'seleccion', valor: () => usuarioActual()?.correo ?? '',
        opciones: () => usuariosActivos().map((usuario) => [usuario.correo, usuario.nombre]),
      },
      { clave: 'resultado', etiqueta: 'Resultado', maximo: 300, ancho: 'completo', ejemplo: 'En qué quedó' },
    ],
    alGuardar: (datos, actividad) => {
      const aplicado = ejecutar(
        () => (actividad ? servicioActividades.actualizarActividad(actividad.id, datos) : servicioActividades.registrarActividad(datos)),
        actividad ? 'Actividad actualizada correctamente' : (datos.tipo === 'tarea' ? 'Tarea creada correctamente' : 'Actividad registrada correctamente'),
      );
      if (!aplicado) return false;
      pintar();
      ficha.refrescar();
      refrescarAlertas();
      return true;
    },
  });

  // Al editar, el cliente y el tipo no cambian
  const abrirFormulario = (actividad) => {
    formulario.habilitar('clienteId', !actividad);
    formulario.habilitar('tipo', !actividad);
    formulario.abrir(actividad ? { ...actividad, vence: actividad.vence ? actividad.vence.slice(0, 10) : null } : null);
  };

  buscar('#nueva-actividad', raiz).onclick = () => abrirFormulario(null);

  // --- Cuadrículas ------------------------------------------------------------------------------------------
  const botonEditar = (id) => (puede('seguimiento', 'editar') ? repetir(documento, 'boton-editar', [{ id }]) : '');
  const botonEliminar = (id) => (puede('seguimiento', 'eliminar') ? repetir(documento, 'boton-eliminar', [{ id }]) : '');
  const botonCompletar = (actividad) => (servicioActividades.esPendiente(actividad) && puede('seguimiento', 'editar')
    ? repetir(documento, 'boton-completar', [{ id: actividad.id }]) : '');

  const tareas = montarCuadricula(buscar('#cuadricula-tareas', raiz), {
    exportar: { modulo: 'seguimiento', archivo: 'tareas' },
    importar: { modulo: 'seguimiento', formato: 'actividades', registros: () => [], importar: importarActividades, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Tareas pendientes',
    vacio: 'No tienes tareas pendientes.',
    columnas: [
      { clave: 'vence', titulo: 'Fecha', ancho: '110px' },
      { clave: 'cliente', titulo: 'Cliente', ancho: 'minmax(0, 1fr)' },
      { clave: 'descripcion', titulo: 'Tarea', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'responsable', titulo: 'Responsable', ancho: '120px' },
      { clave: 'estado', titulo: 'Estado', ancho: '96px', html: (fila) => repetir(documento, 'estado-tarea', [fila.insignia]) },
      { clave: 'acciones', titulo: 'Acciones', ancho: '370px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: [],
  });

  const historial = montarCuadricula(buscar('#cuadricula-actividades', raiz), {
    exportar: { modulo: 'seguimiento', archivo: 'actividades' },
    importar: { modulo: 'seguimiento', formato: 'actividades', registros: () => [], importar: importarActividades, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Historial de actividades',
    vacio: 'Aún no hay actividades registradas.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '84px' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
      { clave: 'cliente', titulo: 'Cliente', ancho: 'minmax(0, 1fr)' },
      { clave: 'tipo', titulo: 'Tipo', ancho: '96px' },
      { clave: 'descripcion', titulo: 'Descripción', ancho: 'minmax(0, 2fr)' },
      { clave: 'responsable', titulo: 'Responsable', ancho: '120px' },
      { clave: 'estado', titulo: 'Estado', ancho: '100px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '250px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: [],
  });

  function pintar() {
    const pendientes = servicioActividades.tareasPendientes();
    const esPropietario = rolActual()?.protegido;
    buscar('#alcance-tareas', raiz).textContent = esPropietario ? 'Ves las tareas de todas las personas.' : 'Ves solo las tareas asignadas a ti.';
    tareas.actualizar(pendientes.map((tarea) => ({
      vence: aFecha(tarea.vence.slice(0, 10)),
      cliente: nombreCliente(tarea.clienteId),
      descripcion: tarea.descripcion,
      responsable: tarea.responsable,
      insignia: estadoDe(tarea),
      estado: estadoDe(tarea).texto,
      acciones: repetir(documento, 'acciones-tarea', [{ id: tarea.id, editar: botonEditar(tarea.id), eliminar: botonEliminar(tarea.id), completar: botonCompletar(tarea) }]),
    })));
    historial.actualizar(servicioActividades.listarActividades().slice().reverse().map((actividad) => ({
      id: actividad.id,
      fecha: aFecha(actividad.fecha),
      cliente: nombreCliente(actividad.clienteId),
      tipo: nombreDe('tiposActividad', actividad.tipo),
      descripcion: actividad.descripcion + (actividad.resultado ? ` · ${actividad.resultado}` : ''),
      responsable: actividad.responsable,
      estado: estadoDe(actividad).texto,
      acciones: repetir(documento, 'acciones-actividad', [{ id: actividad.id, editar: botonEditar(actividad.id), eliminar: botonEliminar(actividad.id) }]),
    })));
  }

  // --- Ficha de la actividad --------------------------------------------------------------------------------
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const actividad = buscarActividad(id);
    if (!actividad) return null;
    return {
      etiqueta: `Ficha de ${nombreDe('tiposActividad', actividad.tipo).toLowerCase()}`,
      titulo: `${actividad.id} · ${nombreCliente(actividad.clienteId)}`,
      subtitulo: `${nombreDe('tiposActividad', actividad.tipo)} · ${estadoDe(actividad).texto}`,
      datos: [
        { etiqueta: 'Cliente', valor: repetir(documento, 'enlace-cliente', [{ id: actividad.clienteId, nombre: nombreCliente(actividad.clienteId) }]), html: true },
        { etiqueta: 'Registrada', valor: aFecha(actividad.fecha) },
        { etiqueta: 'Responsable', valor: actividad.responsable },
        { etiqueta: 'Fecha de la tarea', valor: actividad.vence ? aFecha(actividad.vence.slice(0, 10)) : '' },
        { etiqueta: 'Hecha el', valor: actividad.completadaEn ? aFecha(actividad.completadaEn) : '' },
        { etiqueta: 'Descripción', valor: actividad.descripcion, ancho: true },
        { etiqueta: 'Resultado', valor: actividad.resultado ?? '', ancho: true },
      ],
      acciones: botonCompletar(actividad),
      alEditar: puede('seguimiento', 'editar') ? () => abrirFormulario(buscarActividad(id)) : null,
    };
  });

  // --- Acciones de las filas y de la ficha ------------------------------------------------------------------
  let actividadPorEliminar = null;
  const confirmar = buscar('#confirmar-eliminar-actividad', raiz);
  const pedirEliminar = (actividad) => {
    actividadPorEliminar = actividad.id;
    buscar('#texto-eliminar-actividad', raiz).textContent = `¿Eliminar ${actividad.id} · ${actividad.descripcion}?`;
    confirmar.hidden = false;
    confirmar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    buscar('#eliminar-actividad-no', raiz).focus();
  };
  buscar('#eliminar-actividad-no', raiz).onclick = () => { confirmar.hidden = true; };
  buscar('#eliminar-actividad-si', raiz).onclick = () => {
    if (ejecutar(() => servicioActividades.eliminarActividad(actividadPorEliminar), 'Actividad eliminada correctamente')) {
      if (ficha.idAbierto() === actividadPorEliminar) ficha.cerrar();
      pintar();
      refrescarAlertas();
    }
    confirmar.hidden = true;
  };

  const alTocar = (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    if (boton.dataset.ficha) abrirFicha(boton.dataset.ficha);
    else if (boton.dataset.editar) abrirFormulario(buscarActividad(boton.dataset.editar));
    else if (boton.dataset.eliminar) pedirEliminar(buscarActividad(boton.dataset.eliminar));
    else if (boton.dataset.completar && ejecutar(() => servicioActividades.completarTarea(boton.dataset.completar), 'Tarea marcada como hecha correctamente')) {
      pintar();
      ficha.refrescar();
      refrescarAlertas();
    }
  };
  ['#cuadricula-tareas', '#cuadricula-actividades', '#ficha-actividad'].forEach((selector) => buscar(selector, raiz).addEventListener('click', alTocar));

  pintar();
}
