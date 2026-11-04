import { buscar, escaparHtml } from '../../core/dom.js';
import { puede } from '../../core/autorizacion.js';
import { estado } from '../../core/store.js';
import { aPesos, aFecha, fechaDeHoy, conMoneda } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';
import { LISTAS_PRECIO, nombreDePrecio, manejaStock, agregarProducto, actualizarProducto, eliminarProducto, importarProductos, kardexDeProducto, buscarProductoPorId, bodegaActiva, existenciasVisibles, buscarBodega, siguienteIdProducto } from '../../services/inventario.service.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { montarSelectorRegistro } from '../../components/selector-registro/selector-registro.js';
import { COLUMNAS_PRODUCTO, productosParaElegir } from '../../components/selector-registro/registros.js';
import { bodegasActivas } from '../../services/bodegas.service.js';
import { nombreDe, opcionesDe, primeroActivo } from '../../services/catalogos.service.js';
import { buscarOrden } from '../../services/proveedores.service.js';
import { conectarImportacion } from '../../components/importar-csv/importar-csv.js';
import { cargarPlantillasBuscador } from '../../components/buscador-cuadricula/buscador-cuadricula.js';
import { montarFactura } from './factura.js';
import { mostrarComprobanteDeFactura } from '../../components/recibo/comprobantes.js';
import { importarCompras } from '../../services/importacion.service.js';

const CAMPOS = ['referencia', 'nombre', 'categoriaId', 'unidadId', 'costo', 'precioSurtido', 'precioMayor', 'precioDetal', 'iva', 'stockMinimo', 'existencias'];
let documento;
let plantillasCuadricula;
let plantillasFicha;
let plantillasBuscador;
let plantillasFormulario;

export async function dibujar() {
  documento = await cargarHtml(new URL('./inventario.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha, plantillasBuscador, plantillasFormulario] = await Promise.all([
    cargarPlantillasCuadricula(), cargarPlantillasFicha(), cargarPlantillasBuscador(), cargarPlantillasFormulario(),
  ]);
  const bodega = bodegaActiva();
  const activas = bodegasActivas();
  const opcionesBodega = (elegida) => activas.map((una) => ({ valor: una.id, texto: una.nombre, seleccion: una.id === elegida ? 'selected' : '' }));
  return seccion(documento, 'principal', {
    lugarStock: bodega
      ? `El stock que ves y editas es el de <strong>${escaparHtml(bodega.nombre)}</strong>, la bodega de la sucursal activa.`
      : 'Con "Todas las sucursales" ves el stock total; elige una sucursal en el menú superior para editarlo.',
    opcionesBodegaFactura: repetir(documento, 'opcion-elegida', opcionesBodega(bodega?.id ?? activas[0]?.id)),
    opcionesBodegaKardex: repetir(documento, 'opcion-elegida', [{ valor: '', texto: 'Todas las bodegas', seleccion: bodega ? '' : 'selected' }, ...opcionesBodega(bodega?.id)]),
    hoy: fechaDeHoy(),
  });
}

export function montar(raiz, contexto) {
  const bodega = bodegaActiva();
  const ejecutar = (accion, mensaje) => {
    try {
      const resultado = accion();
      contexto.aviso(mensaje);
      return resultado ?? true;
    } catch (error) {
      contexto.alerta(error.message);
      return false;
    }
  };

  buscar('.vista', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-factura]');
    if (boton) mostrarComprobanteDeFactura(estado.facturas[Number(boton.dataset.factura)]);
  });

  // --- Productos: cuadrícula, formulario (nuevo o edición) y ficha -----------------------------------------
  const ficha = crearFicha(buscar('#ficha-producto', raiz), plantillasFicha);
  // En una página dividida el router ya ocultó los botones de las otras partes: aquí solo se ocultan por permiso
  if (!puede('inventario', 'crear')) buscar('#nuevo-producto', raiz).hidden = true;

  const estadoDe = (producto) => {
    if (!manejaStock(producto)) return 'Genérico';
    if (producto.existencias < 0) return 'Negativo';
    return producto.existencias <= (producto.stockMinimo ?? 0) ? 'Bajo mínimo' : '';
  };
  const insigniaDe = (estado) => (estado ? repetir(documento, 'estado-producto', [{ texto: estado, clase: estado === 'Genérico' ? 'informativa' : '' }]) : '');
  const botonEditar = (id) => (puede('inventario', 'editar') ? repetir(documento, 'boton-editar-producto', [{ id }]) : '');
  const botonEliminar = (id) => (puede('inventario', 'eliminar') ? repetir(documento, 'boton-eliminar-producto', [{ id }]) : '');

  const filasProductos = () => estado.productos.map((original) => {
    // Stock de la bodega de la sucursal activa (o el total con "Todas las sucursales")
    const producto = { ...original, existencias: existenciasVisibles(original) };
    const estado = estadoDe(producto);
    return {
      ...producto,
      costoTexto: aPesos(producto.costo),
      precio1: producto.generico ? 'Libre' : aPesos(producto.precioSurtido ?? 0),
      precio2: producto.generico ? 'Libre' : aPesos(producto.precioMayor ?? 0),
      precio3: producto.generico ? 'Libre' : aPesos(producto.precioDetal ?? 0),
      existencias: producto.generico ? '—' : String(producto.existencias),
      stockMinimo: String(producto.stockMinimo ?? 0),
      estado,
    };
  });

  const cuadriculaProductos = montarCuadricula(buscar('#cuadricula-productos', raiz), {
    exportar: { modulo: 'inventario', archivo: 'productos' },
    importar: { modulo: 'inventario', formato: 'productos', registros: () => estado.productos.map((producto) => ({ ...producto, existencias: existenciasVisibles(producto) })), importar: importarProductos, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Productos',
    vacio: 'Aún no hay productos. Agrega uno con "Nuevo producto".',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '60px' },
      { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(0, 1.5fr)' },
      { clave: 'costoTexto', titulo: 'Costo', ancho: '86px', alinear: 'derecha' },
      { clave: 'precio1', titulo: 'Precio 1', ancho: '86px', alinear: 'derecha' },
      { clave: 'precio2', titulo: 'Precio 2', ancho: '86px', alinear: 'derecha' },
      { clave: 'precio3', titulo: 'Precio 3', ancho: '86px', alinear: 'derecha' },
      { clave: 'existencias', titulo: bodega ? 'Stock' : 'Stock total', ancho: '104px', html: (fila) => repetir(documento, 'stock-producto', [{ texto: fila.existencias, insignia: insigniaDe(fila.estado) }]) },
      { clave: 'acciones', titulo: 'Acciones', ancho: '214px', filtrable: false, html: (fila) => repetir(documento, 'acciones-producto', [{ id: fila.id, editar: botonEditar(fila.id), eliminar: botonEliminar(fila.id) }]) },
    ],
    filas: filasProductos(),
  });
  const pintarProductos = () => cuadriculaProductos.actualizar(filasProductos());

  // Guarda solo los campos que cambiaron (cada cambio queda en la auditoría; el stock como ajuste del kardex)
  const guardarEdicion = (id, datos) => {
    const producto = buscarProductoPorId(id);
    CAMPOS.forEach((nombre) => {
      if ((nombre === 'existencias' && !bodega) || (producto.generico && ['existencias', 'stockMinimo'].includes(nombre))) return;
      const actual = nombre === 'existencias' ? existenciasVisibles(producto) : producto[nombre];
      if (datos[nombre] !== actual) actualizarProducto(id, nombre, datos[nombre]);
    });
  };

  const formulario = montarFormulario(buscar('#formulario-producto', raiz), {
    plantillas: plantillasFormulario,
    clave: 'producto',
    titulo: 'Nuevo producto',
    tituloEditar: (producto) => `Editar ${producto.nombre}`,
    textoGuardar: 'Guardar producto',
    alError: contexto.alerta,
    campos: [
      // El ID siguiente se ve escrito; se puede cambiar por el código propio (solo números)
      { clave: 'id', etiqueta: 'Código', tipo: 'entero', maximo: 12, valor: siguienteIdProducto, obligatorio: true },
      { clave: 'referencia', etiqueta: 'Referencia', maximo: 40 },
      { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true },
      {
        clave: 'categoriaId', etiqueta: 'Categoría', tipo: 'seleccion', obligatorio: true,
        valor: () => primeroActivo('categorias'), opciones: (producto) => opcionesDe('categorias', producto?.categoriaId),
      },
      {
        clave: 'unidadId', etiqueta: 'Unidad de medida', tipo: 'seleccion', obligatorio: true,
        valor: () => primeroActivo('unidades'), opciones: (producto) => opcionesDe('unidades', producto?.unidadId),
      },
      { clave: 'costo', etiqueta: conMoneda('Costo'), tipo: 'entero', valor: 0 },
      {
        clave: 'iva', etiqueta: 'IVA', tipo: 'seleccion', obligatorio: true, ayuda: 'Los precios incluyen el IVA',
        valor: () => primeroActivo('tarifasIva'), opciones: (producto) => opcionesDe('tarifasIva', producto ? String(producto.iva) : ''),
      },
      // Los tres precios son obligatorios (el genérico los oculta: su valor se escribe en cada venta)
      ...LISTAS_PRECIO.map((lista) => ({ clave: lista.campo, etiqueta: conMoneda(nombreDePrecio(lista)), tipo: 'entero', obligatorio: true })),
      { clave: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'entero', valor: 0 },
      { clave: 'existencias', etiqueta: 'Stock inicial', tipo: 'entero-negativo', valor: 0 },
      {
        // "Genérico" se elige al crear el producto; después no cambia (su historia de stock depende de eso).
        // Un producto genérico no maneja stock ni precio fijo: se ocultan los precios, el stock y el mínimo
        clave: 'generico', tipo: 'casilla', ancho: 'completo',
        etiqueta: 'Producto genérico: no maneja stock y su nombre y valor se escriben en cada venta (servicios, reparaciones, artículos sin código)',
        alCambiar: (generico, formularioProducto) => [...LISTAS_PRECIO.map((lista) => lista.campo), 'stockMinimo', 'existencias']
          .forEach((clave) => formularioProducto.mostrar(clave, !generico)),
      },
    ],
    alGuardar: (datos, producto) => {
      datos.iva = Number(datos.iva);
      const aplicado = ejecutar(() => (producto ? guardarEdicion(producto.id, datos) : agregarProducto(datos)),
        producto ? 'Producto actualizado correctamente' : 'Producto agregado correctamente');
      if (!aplicado) return false;
      pintarProductos();
      ficha.refrescar();
      return true;
    },
  });

  const abrirFormulario = (producto) => {
    // El ID no cambia: lo usan las ventas y las facturas. Con "Todas las sucursales" el stock no se edita (no se sabe en qué bodega)
    formulario.habilitar('id', !producto);
    formulario.habilitar('generico', !producto);
    formulario.habilitar('existencias', !producto || Boolean(bodega));
    formulario.etiquetar('existencias', producto
      ? (bodega ? `Stock en ${bodega.nombre}` : 'Stock total (elige una sucursal para cambiarlo)')
      : `Stock inicial${bodega ? ` en ${bodega.nombre}` : ''}`);
    formulario.abrir(producto ? { ...producto, existencias: existenciasVisibles(producto) } : null);
  };

  buscar('#nuevo-producto', raiz).onclick = () => abrirFormulario(null);

  const abrirFicha = (id) => ficha.abrir(id, () => {
    const producto = buscarProductoPorId(id);
    if (!producto) return null;
    const visibles = existenciasVisibles(producto);
    return {
      etiqueta: 'Ficha del producto',
      titulo: `${producto.nombre} · ID ${producto.id}`,
      subtitulo: [producto.referencia && `Ref. ${producto.referencia}`, nombreDe('categorias', producto.categoriaId), estadoDe({ ...producto, existencias: visibles })].filter(Boolean).join(' · '),
      indicadores: producto.generico
        ? [{ etiqueta: 'Tipo', valor: 'Genérico' }, { etiqueta: 'Costo de referencia', valor: aPesos(producto.costo) }]
        : [
          { etiqueta: bodega ? `Stock en ${bodega.nombre}` : 'Stock total', valor: String(visibles), clase: visibles < 0 ? 'texto-negativo' : '' },
          { etiqueta: 'Costo', valor: aPesos(producto.costo) },
          { etiqueta: 'Valor del stock al costo', valor: aPesos(Math.max(0, producto.existencias) * producto.costo) },
        ],
      datos: [
        { etiqueta: 'Referencia', valor: producto.referencia ?? '' },
        { etiqueta: 'Categoría', valor: nombreDe('categorias', producto.categoriaId) },
        { etiqueta: 'Unidad de medida', valor: nombreDe('unidades', producto.unidadId) },
        { etiqueta: 'IVA', valor: `${producto.iva} %` },
        ...LISTAS_PRECIO.map((lista) => ({ etiqueta: nombreDePrecio(lista), valor: producto.generico ? 'Se escribe en cada venta' : aPesos(producto[lista.campo]) })),
        ...(producto.generico
          ? [{ etiqueta: 'Uso', valor: 'Servicios, reparaciones y artículos sin código: el nombre y el valor se escriben en cada venta y no mueve stock.', ancho: true }]
          : [{ etiqueta: 'Stock mínimo', valor: String(producto.stockMinimo ?? 0) }, { etiqueta: 'Stock total', valor: String(producto.existencias) }]),
      ],
      contenido: producto.generico ? '' : repetir(documento, 'contenido-ficha-producto', [{}]),
      acciones: producto.generico ? '' : repetir(documento, 'enlace-kardex', [{ id: producto.id }]),
      alEditar: puede('inventario', 'editar') ? () => abrirFormulario(buscarProductoPorId(id)) : null,
      alMontar: (seccionFicha) => seccionFicha.querySelector('[data-stock]') && montarCuadricula(seccionFicha.querySelector('[data-stock]'), {
        plantillas: plantillasCuadricula,
        titulo: 'Stock por bodega',
        vacio: 'No hay bodegas.',
        columnas: [
          { clave: 'id', titulo: 'Código', ancho: '70px' },
          { clave: 'nombre', titulo: 'Bodega', ancho: 'minmax(0, 2fr)' },
          { clave: 'cantidad', titulo: 'Cantidad', ancho: '100px', alinear: 'derecha' },
        ],
        filas: bodegasActivas().map((una) => ({ id: una.id, nombre: una.nombre, cantidad: String(producto.stock?.[una.id] ?? 0) })),
      }),
    };
  });

  let productoPorEliminar = null;
  const confirmar = buscar('#confirmar-eliminar-producto', raiz);
  buscar('#cuadricula-productos', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const producto = buscarProductoPorId(boton.dataset.ficha ?? boton.dataset.editar ?? boton.dataset.eliminar);
    if (!producto) return;
    if (boton.dataset.ficha) return abrirFicha(producto.id);
    if (boton.dataset.editar) return abrirFormulario(producto);
    productoPorEliminar = producto.id;
    buscar('#texto-eliminar-producto', raiz).textContent = `¿Eliminar ${producto.nombre}? Solo se puede si nunca se ha vendido, comprado ni trasladado y no tiene stock.`;
    confirmar.hidden = false;
    buscar('#eliminar-producto-no', raiz).focus();
  });
  buscar('#eliminar-producto-no', raiz).onclick = () => { confirmar.hidden = true; };
  buscar('#eliminar-producto-si', raiz).onclick = () => {
    confirmar.hidden = true;
    if (!ejecutar(() => eliminarProducto(productoPorEliminar), 'Producto eliminado correctamente')) return;
    if (ficha.idAbierto() === productoPorEliminar) ficha.cerrar();
    pintarProductos();
  };

  // --- Compras: facturas de compra con su ficha ------------------------------------------------------------
  const panelFactura = buscar('#panel-factura', raiz);
  panelFactura.hidden = true;
  if (!puede('inventario', 'crear')) buscar('#ingresar-compra', raiz).hidden = true;
  buscar('#ingresar-compra', raiz).onclick = () => {
    panelFactura.hidden = false;
    panelFactura.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    buscar('[data-filtro-selector]', panelFactura).focus();
  };

  const fichaFactura = crearFicha(buscar('#ficha-factura-compra', raiz), plantillasFicha);
  const abrirFichaFactura = (indice) => fichaFactura.abrir(indice, () => {
    const factura = estado.facturas[indice];
    if (!factura) return null;
    return {
      etiqueta: 'Ficha de la factura de compra',
      titulo: `Factura ${factura.numero} · ${factura.proveedor}`,
      subtitulo: `${aFecha(factura.fecha)} · ${buscarBodega(factura.bodegaId)?.nombre ?? '—'}`,
      indicadores: [
        { etiqueta: 'Total', valor: aPesos(factura.total) },
        { etiqueta: 'Unidades', valor: String(factura.items.reduce((suma, item) => suma + item.cantidad, 0)) },
      ],
      datos: [
        { etiqueta: 'Proveedor', valor: factura.proveedor },
        { etiqueta: 'Entró a la bodega', valor: buscarBodega(factura.bodegaId)?.nombre ?? '—' },
        { etiqueta: 'Orden de compra', valor: factura.ordenId ?? '' },
        { etiqueta: 'Registrada por', valor: factura.usuario ?? '' },
      ],
      contenido: repetir(documento, 'contenido-ficha-factura', [{}]),
      acciones: repetir(documento, 'comprobante-factura-compra', [{ indice }]),
      alMontar: (seccionFicha) => montarCuadricula(seccionFicha.querySelector('[data-items]'), {
        plantillas: plantillasCuadricula,
        titulo: 'Productos de la factura',
        columnas: [
          { clave: 'productoId', titulo: 'Código', ancho: '70px' },
          { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(0, 2fr)' },
          { clave: 'cantidad', titulo: 'Cantidad', ancho: '90px', alinear: 'derecha' },
          { clave: 'costo', titulo: 'Costo unitario', ancho: '120px', alinear: 'derecha' },
          { clave: 'subtotal', titulo: 'Total línea', ancho: '120px', alinear: 'derecha' },
        ],
        filas: factura.items.map((item) => ({ ...item, cantidad: String(item.cantidad), costo: aPesos(item.costoUnitario), subtotal: aPesos(item.cantidad * item.costoUnitario) })),
      }),
    };
  });
  buscar('#cuadricula-facturas-compra', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-ficha-factura]');
    if (boton) abrirFichaFactura(Number(boton.dataset.fichaFactura));
  });

  montarCuadricula(buscar('#cuadricula-facturas-compra', raiz), {
    exportar: { modulo: 'inventario', archivo: 'facturas-de-compra' },
    importar: { modulo: 'inventario', formato: 'compras', registros: () => [], importar: importarCompras, alImportar: contexto.redibujar },
    plantillas: plantillasCuadricula,
    titulo: 'Facturas de compra',
    vacio: 'Aún no hay facturas de compra.',
    columnas: [
      { clave: 'numero', titulo: 'N°', ancho: '110px' },
      { clave: 'proveedor', titulo: 'Proveedor', ancho: 'minmax(0, 1fr)' },
      { clave: 'fecha', titulo: 'Fecha', ancho: '120px' },
      { clave: 'bodega', titulo: 'Bodega', ancho: '140px' },
      { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 1.6fr)' },
      { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '210px', filtrable: false, html: (fila) => repetir(documento, 'accion-factura-compra', [{ indice: fila.indice }]) },
    ],
    filas: estado.facturas.map((factura, indice) => ({
      indice,
      factura,
      numero: factura.numero,
      proveedor: factura.proveedor,
      fecha: aFecha(factura.fecha),
      bodega: buscarBodega(factura.bodegaId)?.nombre ?? '—',
      productos: factura.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', '),
      total: aPesos(factura.total),
    })).filter((fila) => !bodega || fila.factura.bodegaId === bodega.id).reverse(),
  });

  // Factura de compra (sección Compras)
  const cargarOrden = montarFactura(raiz, contexto, documento, plantillasBuscador, plantillasFormulario);

  // Recibir una orden de compra: llega desde Proveedores con ?seccion=compras&orden=OC-0001
  const orden = buscarOrden(new URLSearchParams(location.search).get('orden') ?? '');
  if (orden?.estado === 'abierta' && contexto.seccion === 'compras') {
    panelFactura.hidden = false;
    cargarOrden(orden);
    buscar('#factura-numero', raiz).focus();
  }

  // Kardex de un producto, en una bodega o en todas (sección Kardex; ?producto=ID lo abre directo)
  // El producto viene elegido (el pedido o el primero con stock) y se cambia buscando por cualquier dato
  const bodegaKardex = buscar('#kardex-bodega', raiz);
  const pedido = new URLSearchParams(location.search).get('producto');
  const conKardex = (producto) => !producto.generico;
  const productoKardex = montarSelectorRegistro(buscar('#selector-kardex', raiz), {
    plantillas: plantillasFormulario,
    clave: 'kardex',
    etiqueta: 'productos',
    columnas: COLUMNAS_PRODUCTO,
    registros: () => productosParaElegir(conKardex),
    elegido: () => (pedido && buscarProductoPorId(pedido) ? pedido : estado.productos.find(conKardex)?.id),
    vacio: 'Elige el producto',
    alElegir: (producto) => abrirKardex(producto.id),
  });
  bodegaKardex.onchange = () => abrirKardex(productoKardex.elegido()?.id);
  if (contexto.seccion === 'kardex' && productoKardex.elegido()) abrirKardex(productoKardex.elegido().id);

  function abrirKardex(id) {
    const producto = buscarProductoPorId(id);
    if (!producto) return;
    const bodegaId = bodegaKardex.value || null;
    const lugar = bodegaId ? buscarBodega(bodegaId)?.nombre : 'todas las bodegas';
    buscar('#resumen-kardex', raiz).textContent = `${producto.nombre} · ID ${producto.id} · stock actual en ${lugar}: ${bodegaId ? (producto.stock?.[bodegaId] ?? 0) : producto.existencias}`;
    montarCuadricula(buscar('#cuadricula-kardex', raiz), {
      exportar: { modulo: 'inventario', archivo: 'kardex' },
      plantillas: plantillasCuadricula,
      titulo: 'Movimientos',
      vacio: 'Este producto aún no tiene movimientos.',
      columnas: [
        { clave: 'fecha', titulo: 'Fecha', ancho: '140px' },
        { clave: 'documento', titulo: 'Documento', ancho: '110px' },
        { clave: 'detalle', titulo: 'Detalle', ancho: 'minmax(0, 2fr)' },
        { clave: 'entrada', titulo: 'Entrada', ancho: '90px', alinear: 'derecha' },
        { clave: 'salida', titulo: 'Salida', ancho: '90px', alinear: 'derecha' },
        { clave: 'saldo', titulo: 'Saldo', ancho: '90px', alinear: 'derecha' },
        { clave: 'costo', titulo: 'Costo', ancho: '104px', alinear: 'derecha' },
      ],
      filas: kardexDeProducto(id, bodegaId).reverse().map((movimiento) => ({
        fecha: aFecha(movimiento.fecha),
        documento: movimiento.documento,
        detalle: movimiento.detalle,
        entrada: movimiento.cantidad > 0 ? movimiento.cantidad : '',
        salida: movimiento.cantidad < 0 ? -movimiento.cantidad : '',
        saldo: movimiento.saldo,
        costo: movimiento.costo === null ? '' : aPesos(movimiento.costo),
      })),
    });
  }

  // Plantilla e importación CSV (el stock del archivo es el de la bodega de la sucursal activa)
  conectarImportacion({
    plantilla: buscar('[data-plantilla-csv]', raiz),
    entrada: buscar('[data-importar-csv]', raiz),
    modulo: 'inventario',
    formato: 'productos',
    registros: () => estado.productos.map((producto) => ({ ...producto, existencias: existenciasVisibles(producto) })),
    importar: importarProductos,
    alImportar: contexto.redibujar,
  });
}
