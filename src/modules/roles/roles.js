import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { ACCIONES, MODULOS_PERMISOS } from '../../config/permisos.js';
import { esPropietario, puede, verComoRol } from '../../core/autorizacion.js';
import * as servicioRoles from '../../services/roles.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { nombreDeTienda } from '../../core/tienda.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;
let rolSeleccionadoId = null;

const contarPersonas = (rolId) => {
  const cantidad = servicioRoles.miembrosDeRol(rolId);
  return cantidad === 1 ? '1 usuario' : `${cantidad} usuarios`;
};

export async function dibujar() {
  documento = await cargarHtml(new URL('./roles.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  if (!servicioRoles.buscarRol(rolSeleccionadoId)) rolSeleccionadoId = estado.roles[0].id;
  return seccion(documento, 'principal', {
    roles: '',
    encabezados: repetir(documento, 'encabezado-accion', ACCIONES),
  });
}

export function montar(raiz, contexto) {
  const rolActual = () => servicioRoles.buscarRol(rolSeleccionadoId);

  // Ejecuta un cambio y muestra el aviso; devuelve si se pudo aplicar
  const ejecutar = (accion, mensaje) => {
    try {
      accion();
      contexto.aviso(mensaje);
      return true;
    } catch (error) {
      contexto.alerta(error.message);
      return false;
    }
  };

  const opcionesDeRoles = (seleccionadoId) => repetir(documento, 'opcion-rol', estado.roles.map((rol) => ({
    id: rol.id,
    nombre: rol.nombre,
    seleccion: rol.id === seleccionadoId ? 'selected' : '',
  })));

  const pintarRoles = () => {
    buscar('#lista-roles', raiz).innerHTML = repetir(documento, 'tarjeta-rol', estado.roles.map((rol) => ({
      id: rol.id,
      nombre: rol.nombre,
      actual: String(rol.id === rolSeleccionadoId),
      insignia: rol.protegido ? documento.querySelector('#insignia-protegido').innerHTML : '',
      personas: contarPersonas(rol.id),
    })));
  };

  const pintarDetalle = () => {
    const rol = rolActual();
    buscar('#rol-titulo', raiz).textContent = rol.nombre;
    buscar('#rol-descripcion-actual', raiz).textContent = rol.descripcion || 'Sin descripción';
    buscar('#editar-rol', raiz).disabled = rol.protegido;
    buscar('#ver-como-rol', raiz).disabled = rol.protegido;
    buscar('#eliminar-rol', raiz).disabled = rol.protegido;
    buscar('#confirmar-eliminar-rol', raiz).hidden = true;

    buscar('#matriz-permisos', raiz).innerHTML = repetir(documento, 'fila-permiso', MODULOS_PERMISOS.map((modulo) => ({
      modulo: modulo.etiqueta,
      celdas: ACCIONES.map((accion) => {
        if (!modulo.acciones.includes(accion.id)) return documento.querySelector('#celda-vacia').innerHTML;
        const marcada = (rol.permisos[modulo.id] ?? []).includes(accion.id);
        return repetir(documento, 'celda-permiso', [{
          modulo: modulo.id,
          accion: accion.id,
          descripcion: `${accion.etiqueta} en ${modulo.etiqueta}`,
          estado: `${marcada ? 'checked' : ''} ${rol.protegido ? 'disabled' : ''}`,
        }]);
      }).join(''),
    })));
  };

  // Vista previa: los módulos que el rol puede ver y, en cada uno, lo que puede hacer
  const pintarVistaPrevia = () => {
    const rol = rolActual();
    buscar('#vista-previa-rol', raiz).innerHTML = repetir(documento, 'vista-previa-modulo', MODULOS_PERMISOS.map((modulo) => {
      const concedidas = rol.protegido ? modulo.acciones : (rol.permisos[modulo.id] ?? []).filter((accion) => modulo.acciones.includes(accion));
      const visible = concedidas.includes('ver');
      return {
        nombre: modulo.etiqueta,
        clase: visible ? '' : 'sin-acceso',
        acciones: visible
          ? repetir(documento, 'vista-previa-accion', ACCIONES.filter((accion) => concedidas.includes(accion.id) && accion.id !== 'ver'))
            || '<span class="texto-suave">Solo consulta</span>'
          : 'Sin acceso: no aparece en el menú',
      };
    }));
  };

  const filasPersonas = () => estado.usuarios.map((usuario) => ({
    ...usuario,
    rolNombre: servicioRoles.buscarRol(usuario.rolId)?.nombre ?? '',
    estadoTexto: usuario.activo ? 'Activo' : 'Inactivo',
  }));

  const cuadriculaPersonas = montarCuadricula(buscar('#cuadricula-personas', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Personas',
    vacio: 'Aún no hay usuarios.',
    columnas: [
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1fr)' },
      { clave: 'correo', titulo: 'Correo', ancho: 'minmax(0, 1.2fr)' },
      { clave: 'rolNombre', titulo: 'Rol', ancho: '170px', html: (fila) => repetir(documento, 'celda-rol-persona', [{ id: fila.id, nombre: fila.nombre, opciones: opcionesDeRoles(fila.rolId) }]) },
      { clave: 'estadoTexto', titulo: 'Activo', ancho: '90px', html: (fila) => repetir(documento, 'celda-activo-persona', [{ id: fila.id, nombre: fila.nombre, marcado: fila.activo ? 'checked' : '' }]) },
      { clave: 'acciones', titulo: 'Acciones', ancho: '90px', filtrable: false, html: (fila) => repetir(documento, 'accion-persona', [{ id: fila.id }]) },
    ],
    filas: filasPersonas(),
  });

  // Ficha de la persona: el rol y el estado se cambian en la misma fila
  const fichaPersona = crearFicha(buscar('#ficha-persona', raiz), plantillasFicha);
  const abrirFichaPersona = (id) => fichaPersona.abrir(id, () => {
    const usuario = estado.usuarios.find((candidato) => candidato.id === id);
    if (!usuario) return null;
    const empleado = estado.empleados.find((candidato) => candidato.usuarioId === usuario.id);
    return {
      etiqueta: 'Ficha del usuario',
      titulo: `${usuario.nombre} · ${usuario.id}`,
      subtitulo: `${servicioRoles.buscarRol(usuario.rolId)?.nombre ?? 'Sin rol'} · ${usuario.activo ? 'Activa' : 'Inactiva'}`,
      datos: [
        { etiqueta: 'Correo', valor: usuario.correo },
        { etiqueta: 'Rol', valor: servicioRoles.buscarRol(usuario.rolId)?.nombre ?? '' },
        { etiqueta: 'Empleado', valor: empleado ? `${empleado.nombre} · ${empleado.id}` : 'Sin ficha de empleado' },
        { etiqueta: 'Sucursales a las que entra', valor: usuario.tiendas?.length ? usuario.tiendas.map(nombreDeTienda).join(', ') : 'Todas las sucursales', ancho: true },
      ],
    };
  });
  buscar('#cuadricula-personas', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-ficha]');
    if (boton) abrirFichaPersona(boton.dataset.ficha);
  });

  const pintarPersonas = () => {
    cuadriculaPersonas.actualizar(filasPersonas());
    fichaPersona.refrescar();
  };

  const pintarTodo = () => {
    pintarRoles();
    pintarDetalle();
    pintarVistaPrevia();
    pintarPersonas();
  };

  // Formulario de rol (crear o editar el rol elegido)
  const formularioRol = montarFormulario(buscar('#formulario-rol', raiz), {
    plantillas: plantillasFormulario,
    clave: 'rol',
    titulo: 'Nuevo rol',
    tituloEditar: (rol) => `Editar rol ${rol.nombre}`,
    textoGuardar: 'Guardar rol',
    columnas: 2,
    alError: contexto.alerta,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true, ejemplo: 'Por ejemplo: Supervisor' },
      { clave: 'descripcion', etiqueta: 'Descripción', ejemplo: 'Qué hace este rol' },
    ],
    alGuardar: (datos, rol) => {
      const aplicado = ejecutar(() => {
        if (rol) servicioRoles.actualizarRol(rol.id, datos);
        else rolSeleccionadoId = servicioRoles.crearRol(datos).id;
      }, rol ? 'Rol actualizado correctamente' : 'Rol creado correctamente');
      if (!aplicado) return false;
      pintarTodo();
      return true;
    },
  });

  buscar('#nuevo-rol', raiz).onclick = () => formularioRol.abrir(null);
  buscar('#editar-rol', raiz).onclick = () => formularioRol.abrir(rolActual());

  // Ver como este rol: solo el Propietario; la app se recorre desde el panel con el menú y los permisos del rol
  buscar('#ver-como-rol', raiz).hidden = !esPropietario();
  buscar('#ver-como-rol', raiz).onclick = () => {
    try {
      verComoRol(rolActual().id);
      location.href = 'panel.html';
    } catch (error) {
      contexto.alerta(error.message);
    }
  };

  // Elegir un rol de la lista
  buscar('#lista-roles', raiz).addEventListener('click', (evento) => {
    const tarjeta = evento.target.closest('[data-rol]');
    if (!tarjeta) return;
    rolSeleccionadoId = tarjeta.dataset.rol;
    if (formularioRol.registro()) formularioRol.cerrar();
    pintarTodo();
  });

  // Eliminar un rol, con confirmación
  buscar('#eliminar-rol', raiz).onclick = () => {
    buscar('#texto-eliminar-rol', raiz).textContent = `¿Eliminar el rol ${rolActual().nombre}?`;
    buscar('#confirmar-eliminar-rol', raiz).hidden = false;
    buscar('#eliminar-rol-no', raiz).focus();
  };
  buscar('#eliminar-rol-no', raiz).onclick = () => { buscar('#confirmar-eliminar-rol', raiz).hidden = true; };
  buscar('#eliminar-rol-si', raiz).onclick = () => {
    const aplicado = ejecutar(() => servicioRoles.eliminarRol(rolSeleccionadoId), 'Rol eliminado correctamente');
    if (!aplicado) {
      buscar('#confirmar-eliminar-rol', raiz).hidden = true;
      return;
    }
    rolSeleccionadoId = estado.roles[0].id;
    pintarTodo();
  };

  // Permisos: cada casilla se aplica al marcarla
  buscar('#matriz-permisos', raiz).addEventListener('change', (evento) => {
    const casilla = evento.target.closest('[data-modulo]');
    if (!casilla) return;
    const aplicado = ejecutar(
      () => servicioRoles.establecerPermiso(rolSeleccionadoId, casilla.dataset.modulo, casilla.dataset.accion, casilla.checked),
      'Permisos actualizados correctamente',
    );
    if (!aplicado) casilla.checked = !casilla.checked;
    pintarDetalle();
    pintarVistaPrevia();
  });

  // Personas
  buscar('#cuadricula-personas', raiz).addEventListener('change', (evento) => {
    const selector = evento.target.closest('[data-persona]');
    const interruptor = evento.target.closest('[data-activo]');
    if (selector) {
      ejecutar(() => servicioRoles.cambiarRolUsuario(selector.dataset.persona, selector.value), 'Rol del usuario cambiado correctamente');
    } else if (interruptor) {
      ejecutar(() => servicioRoles.cambiarEstadoUsuario(interruptor.dataset.activo, interruptor.checked), 'Estado del usuario actualizado correctamente');
    } else return;
    pintarTodo();
  });

  // Persona nueva: el rol elegido en la lista viene marcado
  const formularioPersona = montarFormulario(buscar('#formulario-persona', raiz), {
    plantillas: plantillasFormulario,
    clave: 'persona',
    titulo: 'Agregar usuario',
    textoGuardar: 'Guardar usuario',
    alError: contexto.alerta,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true },
      { clave: 'correo', etiqueta: 'Correo', obligatorio: true, ejemplo: 'nombre@generico.com', ayuda: 'Puedes escribir solo lo que va antes de la @' },
      { clave: 'rolId', etiqueta: 'Rol', tipo: 'seleccion', valor: () => rolSeleccionadoId, opciones: () => estado.roles.map((rol) => [rol.id, rol.nombre]) },
    ],
    alGuardar: (datos) => {
      if (!ejecutar(() => servicioRoles.agregarUsuario(datos), 'Persona agregada correctamente')) return false;
      pintarTodo();
      return true;
    },
  });
  buscar('#agregar-persona', raiz).onclick = () => formularioPersona.abrir(null);

  if (!puede('auditoria', 'ver')) buscar('#ver-auditoria-roles', raiz).hidden = true;
  pintarTodo();
}
