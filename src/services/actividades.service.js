// Seguimiento de clientes: actividades registradas (llamadas, WhatsApp, visitas, correos, notas) y tareas con
// fecha de vencimiento y responsable. Una tarea queda pendiente hasta que se marca como hecha.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso, usuarioActual, nombreDeUsuario } from '../core/autorizacion.js';
import { exigirFecha, exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

export const TIPOS_ACTIVIDAD = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  visita: 'Visita',
  correo: 'Correo',
  nota: 'Nota',
  tarea: 'Tarea',
};

const DIA_MS = 86_400_000;

export const actividadesDeCliente = (clienteId) => estado.actividades.filter((actividad) => actividad.clienteId === clienteId);

export const esPendiente = (actividad) => actividad.tipo === 'tarea' && !actividad.completada;
export const estaVencidaTarea = (actividad, ahora = Date.now()) => esPendiente(actividad) && new Date(actividad.vence).getTime() < ahora;

// Tareas pendientes de la persona de la sesión (el rol protegido ve las de todos)
export function tareasPendientes() {
  const usuario = usuarioActual();
  const esPropietario = estado.roles.find((rol) => rol.id === usuario?.rolId)?.protegido;
  return estado.actividades
    .filter((actividad) => esPendiente(actividad) && (esPropietario || actividad.responsableCorreo === usuario?.correo))
    .sort((a, b) => new Date(a.vence) - new Date(b.vence));
}

// datos: { clienteId, tipo, descripcion, vence ('AAAA-MM-DD', solo tareas), responsableCorreo }
export function registrarActividad(datos) {
  exigirPermiso('seguimiento', 'crear', 'registrar actividades');
  const cliente = estado.clientes.find((candidato) => candidato.id === datos.clienteId);
  if (!cliente) throw new Error('Elige el cliente');
  if (!TIPOS_ACTIVIDAD[datos.tipo]) throw new Error('Elige el tipo de actividad');
  const esTarea = datos.tipo === 'tarea';
  const responsable = estado.usuarios.find((usuario) => usuario.correo === datos.responsableCorreo && usuario.activo) ?? usuarioActual();
  const actividad = {
    id: siguienteCodigo(estado.actividades.map((existente) => existente.id), 'AC', 4),
    clienteId: cliente.id,
    tipo: datos.tipo,
    descripcion: exigirTexto(datos.descripcion, 'la descripción', { maximo: LIMITES.textoLargo }),
    fecha: new Date().toISOString(),
    vence: esTarea ? `${exigirFecha(datos.vence, 'la fecha de la tarea')}T18:00:00` : '',
    responsable: responsable?.nombre ?? nombreDeUsuario(),
    responsableCorreo: responsable?.correo ?? '',
    completada: !esTarea,
    origen: datos.origen ?? '',
  };
  if (esTarea && new Date(actividad.vence).getTime() < Date.now() - DIA_MS) throw new Error('La fecha de la tarea no puede ser anterior a hoy');
  estado.actividades.push(actividad);
  registrarAuditoria('seguimiento', esTarea ? 'Tarea creada' : 'Actividad registrada', `${actividad.id} · ${cliente.nombre} · ${TIPOS_ACTIVIDAD[actividad.tipo]}`);
  guardarEstado();
  return actividad;
}

export function completarTarea(id, resultado = '') {
  exigirPermiso('seguimiento', 'editar', 'completar tareas');
  const tarea = estado.actividades.find((actividad) => actividad.id === id);
  if (!tarea || tarea.tipo !== 'tarea') throw new Error('La tarea no existe');
  if (tarea.completada) throw new Error('La tarea ya está hecha');
  tarea.completada = true;
  tarea.completadaEn = new Date().toISOString();
  tarea.resultado = exigirTexto(resultado, 'el resultado', { obligatorio: false, maximo: LIMITES.textoLargo });
  registrarAuditoria('seguimiento', 'Tarea completada', `${tarea.id} · ${tarea.descripcion}`);
  guardarEstado();
  return tarea;
}

// Cambia una actividad registrada: descripción, resultado y, si es una tarea pendiente, su fecha y responsable
export function actualizarActividad(id, datos) {
  exigirPermiso('seguimiento', 'editar', 'editar actividades');
  const actividad = estado.actividades.find((candidata) => candidata.id === id);
  if (!actividad) throw new Error('La actividad no existe');
  const descripcion = exigirTexto(datos.descripcion, 'la descripción', { maximo: LIMITES.textoLargo });
  const resultado = exigirTexto(datos.resultado ?? actividad.resultado ?? '', 'el resultado', { obligatorio: false, maximo: LIMITES.textoLargo });
  if (esPendiente(actividad)) {
    const vence = `${exigirFecha(datos.vence, 'la fecha de la tarea')}T18:00:00`;
    if (vence !== actividad.vence && new Date(vence).getTime() < Date.now() - DIA_MS) throw new Error('La fecha de la tarea no puede ser anterior a hoy');
    const responsable = estado.usuarios.find((usuario) => usuario.correo === datos.responsableCorreo && usuario.activo);
    actividad.vence = vence;
    if (responsable) {
      actividad.responsable = responsable.nombre;
      actividad.responsableCorreo = responsable.correo;
    }
  }
  actividad.descripcion = descripcion;
  actividad.resultado = resultado;
  registrarAuditoria('seguimiento', 'Actividad editada', `${actividad.id} · ${actividad.descripcion}`);
  guardarEstado();
  return actividad;
}

export function eliminarActividad(id) {
  exigirPermiso('seguimiento', 'eliminar', 'eliminar actividades');
  const actividad = estado.actividades.find((candidata) => candidata.id === id);
  if (!actividad) throw new Error('La actividad no existe');
  estado.actividades = estado.actividades.filter((candidata) => candidata.id !== id);
  registrarAuditoria('seguimiento', 'Actividad eliminada', `${actividad.id} · ${actividad.descripcion}`);
  guardarEstado();
}
