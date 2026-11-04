import { buscar } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { aPesos } from '../../core/format.js';
import { puede } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { LISTAS_PRECIO, etiquetaDeLista } from '../../services/inventario.service.js';
import { buscarTienda, resumenDeTienda, agregarTienda, actualizarTienda, cambiarEstadoTienda } from '../../services/tiendas.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasFormulario;

const nombreBodega = (id) => estado.bodegas.find((bodega) => bodega.id === id)?.nombre ?? '—';

export async function dibujar() {
  documento = await cargarHtml(new URL('./tiendas.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasFormulario(),
  ]);
  return seccion(documento, 'principal');
}

export function montar(raiz, contexto) {
  const ficha = crearFicha(buscar('#ficha-tienda', raiz), plantillasFicha);
  const puedeEditar = puede('tiendas', 'editar');
  buscar('#nueva-tienda', raiz).hidden = !puede('tiendas', 'crear');

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

  const botonesEdicion = (tienda) => (puedeEditar ? repetir(documento, 'botones-edicion', [{
    id: tienda.id,
    textoEstado: tienda.activa ? 'Desactivar' : 'Activar',
    claseEstado: tienda.activa ? 'peligro' : '',
  }]) : '');

  const filas = () => estado.tiendas.map((tienda) => {
    const resumen = resumenDeTienda(tienda.id);
    return {
      ...tienda,
      bodega: nombreBodega(tienda.bodegaId),
      lista: etiquetaDeLista(tienda.listaPrecio ?? 'detal'),
      ventasMes: aPesos(resumen.ventasMes),
      caja: resumen.cajaAbierta ? 'Abierta' : 'Cerrada',
      empleados: String(resumen.empleados),
      estadoTexto: tienda.activa ? 'Activa' : 'Inactiva',
    };
  });

  const cuadricula = montarCuadricula(buscar('#cuadricula-tiendas', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Sucursales',
    vacio: 'Aún no hay sucursales. Crea una con "Nueva sucursal".',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '64px' },
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1.2fr)' },
      { clave: 'ciudad', titulo: 'Ciudad', ancho: '110px' },
      { clave: 'bodega', titulo: 'Bodega', ancho: 'minmax(0, 1fr)' },
      { clave: 'lista', titulo: 'Lista de precio', ancho: '150px' },
      { clave: 'ventasMes', titulo: 'Ventas del mes', ancho: '120px', alinear: 'derecha' },
      { clave: 'caja', titulo: 'Caja', ancho: '84px' },
      { clave: 'estadoTexto', titulo: 'Estado', ancho: '90px', html: (fila) => repetir(documento, 'estado-registro', [{ texto: fila.estadoTexto, clase: fila.activa ? 'suave' : '' }]) },
      { clave: 'acciones', titulo: 'Acciones', ancho: '290px', filtrable: false, html: (fila) => repetir(documento, 'acciones-tienda', [{ id: fila.id, editar: botonesEdicion(fila) }]) },
    ],
    filas: filas(),
  });
  const pintar = () => cuadricula.actualizar(filas());

  // --- Formulario -------------------------------------------------------------------------------------------
  const formulario = montarFormulario(buscar('#formulario-tienda', raiz), {
    plantillas: plantillasFormulario,
    clave: 'tienda',
    titulo: 'Nueva sucursal',
    tituloEditar: (tienda) => `Editar ${tienda.nombre}`,
    textoGuardar: 'Guardar sucursal',
    alError: contexto.alerta,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', maximo: 60, obligatorio: true, ejemplo: 'Sucursal Sur' },
      { clave: 'ciudad', etiqueta: 'Ciudad' },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      {
        // Al editar no se ofrece "crear bodega nueva": la tienda debe quedar con una bodega existente
        clave: 'bodegaId', etiqueta: 'Bodega donde vende', tipo: 'seleccion', valor: '',
        opciones: () => [
          ...(formulario.registro() ? [] : [['', 'Crear una bodega nueva']]),
          ...estado.bodegas.filter((bodega) => bodega.activa).map((bodega) => [bodega.id, `${bodega.nombre} · ${bodega.id}`]),
        ],
      },
      { clave: 'listaPrecio', etiqueta: 'Lista de precio por defecto', tipo: 'seleccion', valor: 'detal', opciones: () => LISTAS_PRECIO.map((lista) => [lista.id, lista.numero]) },
      { clave: 'direccion', etiqueta: 'Dirección', maximo: 300, ancho: 'completo' },
    ],
    alGuardar: (datos, tienda) => {
      const aplicado = tienda
        ? ejecutar(() => actualizarTienda(tienda.id, datos), 'Sucursal actualizada correctamente')
        : ejecutar(() => agregarTienda(datos), 'Sucursal creada correctamente');
      if (!aplicado) return false;
      // Una tienda nueva puede crear su bodega: se redibuja para que aparezca en la lista de bodegas
      if (!tienda) contexto.redibujar();
      pintar();
      ficha.refrescar();
      return true;
    },
  });
  const abrirFormulario = (tienda) => formulario.abrir(tienda);
  buscar('#nueva-tienda', raiz).onclick = () => abrirFormulario(null);

  // --- Ficha ------------------------------------------------------------------------------------------------
  const abrirFicha = (id) => ficha.abrir(id, () => {
    const tienda = buscarTienda(id);
    if (!tienda) return null;
    const resumen = resumenDeTienda(tienda.id);
    return {
      etiqueta: 'Ficha de la sucursal',
      titulo: `${tienda.nombre} · ${tienda.id}`,
      subtitulo: [tienda.ciudad, tienda.activa ? 'Activa' : 'Inactiva'].filter(Boolean).join(' · '),
      indicadores: [
        { etiqueta: 'Ventas del mes', valor: aPesos(resumen.ventasMes) },
        { etiqueta: 'N° de ventas del mes', valor: String(resumen.cantidadMes) },
        { etiqueta: 'Caja', valor: resumen.cajaAbierta ? 'Abierta' : 'Cerrada' },
        { etiqueta: 'Empleados activos', valor: String(resumen.empleados) },
      ],
      datos: [
        { etiqueta: 'Bodega donde vende', valor: `${nombreBodega(tienda.bodegaId)} · ${tienda.bodegaId}` },
        { etiqueta: 'Lista de precio por defecto', valor: etiquetaDeLista(tienda.listaPrecio ?? 'detal') },
        { etiqueta: 'Ciudad', valor: tienda.ciudad ?? '' },
        { etiqueta: 'Teléfono', valor: tienda.telefono ?? '' },
        { etiqueta: 'Dirección', valor: tienda.direccion ?? '', ancho: true },
      ],
      alEditar: puedeEditar ? () => abrirFormulario(buscarTienda(id)) : null,
    };
  });

  const alTocar = (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const tienda = buscarTienda(boton.dataset.ficha ?? boton.dataset.editar ?? boton.dataset.estado);
    if (!tienda) return;
    if (boton.dataset.ficha) return abrirFicha(tienda.id);
    if (boton.dataset.editar) return abrirFormulario(tienda);
    if (ejecutar(() => cambiarEstadoTienda(tienda.id, !tienda.activa), `${tienda.nombre} ${tienda.activa ? 'desactivada' : 'activada'} correctamente`)) {
      pintar();
      ficha.refrescar();
    }
  };
  buscar('#cuadricula-tiendas', raiz).addEventListener('click', alTocar);

  if (new URLSearchParams(location.search).get('nueva') === '1' && puede('tiendas', 'crear')) abrirFormulario(null);
}
