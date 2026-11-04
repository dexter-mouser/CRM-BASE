import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { aPesos, fechaDeHoy } from '../../core/format.js';
import { puede } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { opcionesDe, primeroActivo } from '../../services/catalogos.service.js';
import { nombreDeTienda, enTiendaActiva } from '../../core/tienda.js';
import * as servicioEmpleados from '../../services/empleados.service.js';
import { conectarImportacion } from '../../components/importar-csv/importar-csv.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

const tiendasActivas = () => estado.tiendas.filter((tienda) => tienda.activa);

// Los empleados de la sucursal activa (o de todas)
const empleadosDeLaVista = () => estado.empleados.filter(enTiendaActiva);

export async function dibujar() {
  documento = await cargarHtml(new URL('./empleados.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  const activos = empleadosDeLaVista().filter((empleado) => empleado.activo);
  const desempeno = activos.map(servicioEmpleados.desempenoDelMes);
  const resumen = [
    { etiqueta: 'Empleados activos', valor: activos.length, detalle: `${empleadosDeLaVista().length - activos.length} retirados` },
    { etiqueta: 'Ventas del mes', valor: aPesos(desempeno.reduce((suma, uno) => suma + uno.total, 0)), detalle: 'Hechas por el equipo con su usuario' },
    { etiqueta: 'Comisiones estimadas', valor: aPesos(desempeno.reduce((suma, uno) => suma + uno.comision, 0)), detalle: 'Según el % de cada persona' },
  ];
  return seccion(documento, 'principal', {
    resumen: repetir(documento, 'tarjeta', resumen),
  });
}

export function montar(raiz, contexto) {
  let porRetirar = null;
  buscar('#nuevo-empleado', raiz).hidden = !puede('empleados', 'crear');

  const ejecutar = (accion, mensaje) => {
    try {
      accion();
      contexto.aviso(mensaje);
      contexto.redibujar();
      return true;
    } catch (error) {
      contexto.alerta(error.message);
      return false;
    }
  };

  // Las casillas de acceso solo aplican si el empleado tiene usuario; usuario.tiendas vacío = todas
  const mostrarAcceso = (usuarioId, formulario) => {
    const usuario = estado.usuarios.find((candidato) => candidato.id === usuarioId);
    formulario.mostrar('tiendasAcceso', Boolean(usuario));
    if (!usuario) return;
    formulario.escribir({ tiendasAcceso: usuario.tiendas?.length ? usuario.tiendas : estado.tiendas.map((tienda) => tienda.id) });
  };

  const formulario = montarFormulario(buscar('#formulario-empleado', raiz), {
    plantillas: plantillasFormulario,
    clave: 'empleado',
    titulo: 'Nuevo empleado',
    tituloEditar: (empleado) => `Editar a ${empleado.nombre}`,
    textoGuardar: 'Guardar empleado',
    alError: contexto.alerta,
    columnas: 4,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre completo', obligatorio: true, ancho: 2 },
      {
        clave: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'seleccion', obligatorio: true,
        valor: () => primeroActivo('tiposDocumento'), opciones: (empleado) => opcionesDe('tiposDocumento', empleado?.tipoDocumento),
      },
      { clave: 'documento', etiqueta: 'Documento', maximo: 20, obligatorio: true },
      { clave: 'cargo', etiqueta: 'Cargo', tipo: 'lista', maximo: 60, obligatorio: true, opciones: () => servicioEmpleados.CARGOS },
      {
        clave: 'tiendaId', etiqueta: 'Sucursal donde trabaja', tipo: 'seleccion', obligatorio: true,
        opciones: () => tiendasActivas().map((tienda) => [tienda.id, tienda.nombre]), valor: () => tiendasActivas()[0]?.id ?? '',
      },
      { clave: 'fechaIngreso', etiqueta: 'Fecha de ingreso', tipo: 'fecha', valor: fechaDeHoy, obligatorio: true },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' },
      { clave: 'turno', etiqueta: 'Turno', maximo: 120, ejemplo: 'Lunes a sábado 8:00 a 17:00' },
      { clave: 'metaMensual', etiqueta: 'Meta de ventas del mes', tipo: 'entero', valor: 0, ayuda: '0 = sin meta' },
      { clave: 'comision', etiqueta: 'Comisión (%)', tipo: 'decimal', valor: 0 },
      {
        clave: 'usuarioId', etiqueta: 'Usuario del sistema', tipo: 'seleccion', valor: '', alCambiar: mostrarAcceso,
        opciones: () => [['', 'Sin usuario'], ...estado.usuarios.map((usuario) => [usuario.id, `${usuario.nombre} · ${usuario.correo}`])],
      },
      {
        clave: 'tiendasAcceso', etiqueta: 'Sucursales a las que puede entrar con su usuario', tipo: 'casillas', ancho: 'completo',
        opciones: () => estado.tiendas.map((tienda) => [tienda.id, tienda.nombre]),
      },
    ],
    alGuardar: (datos, empleado) => {
      if (!datos.usuarioId) delete datos.tiendasAcceso;
      return empleado
        ? ejecutar(() => servicioEmpleados.actualizarEmpleado(empleado.id, datos), 'Empleado actualizado correctamente')
        : ejecutar(() => servicioEmpleados.agregarEmpleado(datos), 'Empleado registrado correctamente');
    },
  });
  const abrirFormulario = (empleado) => formulario.abrir(empleado);
  buscar('#nuevo-empleado', raiz).onclick = () => abrirFormulario(null);

  conectarImportacion(raiz, contexto, {
    modulo: 'empleados', formato: 'empleados', registros: () => estado.empleados, importar: servicioEmpleados.importarEmpleados, alImportar: contexto.redibujar,
  });

  const editar = puede('empleados', 'editar');
  montarCuadricula(buscar('#cuadricula-empleados', raiz), {
    exportar: { modulo: 'empleados', archivo: 'empleados' },
    plantillas: plantillasCuadricula,
    titulo: 'Empleados',
    vacio: 'Aún no hay empleados en esta sucursal.',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '74px' },
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(140px, 1.2fr)' },
      { clave: 'cargo', titulo: 'Cargo', ancho: 'minmax(100px, 1fr)' },
      { clave: 'tienda', titulo: 'Sucursal', ancho: '110px' },
      { clave: 'usuario', titulo: 'Usuario', ancho: '96px' },
      { clave: 'ventas', titulo: 'Ventas del mes', ancho: '120px', alinear: 'derecha' },
      { clave: 'meta', titulo: 'Meta', ancho: '110px', filtrable: false, html: (fila) => fila.avance },
      { clave: 'comision', titulo: 'Comisión', ancho: '110px', alinear: 'derecha' },
      { clave: 'estado', titulo: 'Estado', ancho: '84px' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '270px', filtrable: false, html: (fila) => fila.acciones },
    ],
    filas: empleadosDeLaVista().map((empleado) => {
      const resultado = servicioEmpleados.desempenoDelMes(empleado);
      const usuario = servicioEmpleados.usuarioDeEmpleado(empleado);
      return {
        id: empleado.id,
        nombre: empleado.nombre,
        cargo: empleado.cargo,
        tienda: nombreDeTienda(empleado.tiendaId),
        usuario: usuario ? (usuario.activo ? 'Activo' : 'Inactivo') : 'Sin usuario',
        ventas: `${aPesos(resultado.total)} (${resultado.cantidad})`,
        meta: resultado.avance ?? 0,
        avance: resultado.avance === null
          ? '<span class="texto-suave">Sin meta</span>'
          : repetir(documento, 'avance', [{ texto: `${resultado.avance} %`, ancho: Math.min(100, Math.max(0, resultado.avance)), titulo: `Meta: ${aPesos(empleado.metaMensual)}` }]),
        comision: `${aPesos(resultado.comision)} · ${String(empleado.comision ?? 0).replace('.', ',')} %`,
        estado: empleado.activo ? 'Activo' : 'Retirado',
        acciones: repetir(documento, 'acciones-empleado', [{
          id: empleado.id,
          edicion: editar ? repetir(documento, 'botones-edicion', [{
            id: empleado.id,
            textoEstado: empleado.activo ? 'Retirar' : 'Reintegrar',
            claseEstado: empleado.activo ? 'peligro' : '',
          }]) : '',
        }]),
      };
    }),
  });

  // --- Ficha del empleado -----------------------------------------------------------------------------------
  const ficha = crearFicha(buscar('#ficha-empleado', raiz), plantillasFicha);
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const empleado = servicioEmpleados.buscarEmpleado(id);
    if (!empleado) return null;
    const resultado = servicioEmpleados.desempenoDelMes(empleado);
    const usuario = servicioEmpleados.usuarioDeEmpleado(empleado);
    const tiendasUsuario = usuario ? (usuario.tiendas?.length ? usuario.tiendas.map(nombreDeTienda).join(', ') : 'Todas las sucursales') : '';
    return {
      etiqueta: 'Ficha del empleado',
      titulo: `${empleado.nombre} · ${empleado.id}`,
      subtitulo: [empleado.cargo, nombreDeTienda(empleado.tiendaId), empleado.activo ? 'Activo' : 'Retirado'].join(' · '),
      indicadores: [
        { etiqueta: 'Ventas del mes', valor: aPesos(resultado.total) },
        { etiqueta: 'Avance de la meta', valor: resultado.avance === null ? 'Sin meta' : `${resultado.avance} %` },
        { etiqueta: 'Comisión estimada', valor: aPesos(resultado.comision) },
        { etiqueta: 'Cajas abiertas en el mes', valor: String(resultado.cajas) },
      ],
      datos: [
        { etiqueta: 'Documento', valor: `${empleado.tipoDocumento} ${empleado.documento}` },
        { etiqueta: 'Fecha de ingreso', valor: empleado.fechaIngreso ?? '' },
        { etiqueta: 'Teléfono', valor: empleado.telefono ?? '' },
        { etiqueta: 'Correo', valor: empleado.correo ?? '' },
        { etiqueta: 'Turno', valor: empleado.turno ?? '' },
        { etiqueta: 'Meta mensual', valor: empleado.metaMensual ? aPesos(empleado.metaMensual) : 'Sin meta' },
        { etiqueta: 'Comisión', valor: `${String(empleado.comision ?? 0).replace('.', ',')} %` },
        { etiqueta: 'Usuario del sistema', valor: usuario ? `${usuario.correo} · ${usuario.activo ? 'activo' : 'inactivo'}` : 'Sin usuario' },
        { etiqueta: 'Sucursales a las que entra', valor: tiendasUsuario, ancho: true },
      ],
      alEditar: editar ? () => abrirFormulario(servicioEmpleados.buscarEmpleado(id)) : null,
    };
  });

  buscar('#cuadricula-empleados', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const empleado = servicioEmpleados.buscarEmpleado(boton.dataset.ficha ?? boton.dataset.editar ?? boton.dataset.estado);
    if (!empleado) return;
    if (boton.dataset.ficha) return abrirFicha(empleado.id);
    if (boton.dataset.editar) return abrirFormulario(empleado);
    if (!empleado.activo) return ejecutar(() => servicioEmpleados.cambiarEstadoEmpleado(empleado.id, true), `${empleado.nombre} reintegrado correctamente`);
    porRetirar = empleado.id;
    buscar('#texto-retiro', raiz).textContent = `¿Retirar a ${empleado.nombre}?${empleado.usuarioId ? ' Su usuario quedará inactivo.' : ''}`;
    buscar('#confirmar-retiro', raiz).hidden = false;
  });
  buscar('#retiro-no', raiz).onclick = () => { buscar('#confirmar-retiro', raiz).hidden = true; };
  buscar('#retiro-si', raiz).onclick = () => {
    const empleado = servicioEmpleados.buscarEmpleado(porRetirar);
    ejecutar(() => servicioEmpleados.cambiarEstadoEmpleado(porRetirar, false), `${empleado.nombre} retirado correctamente`);
  };
}
