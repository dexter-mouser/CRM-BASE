import { buscar, buscarTodos } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { leerTema, aplicarTema, aplicarMarca } from '../../core/tema.js';
import { leerMenuRecogido, establecerMenuRecogido } from '../../components/sidebar/sidebar.js';
import { mostrarReciboDeVenta as mostrarRecibo } from '../../components/recibo/comprobantes.js';
import { refrescarMarca } from '../../components/header/header.js';
import { logoCompleto } from '../../components/logo/logo.js';
import { aFecha } from '../../core/format.js';
import { descargarCsv } from '../../services/csv.service.js';
import * as servicioAjustes from '../../services/ajustes.service.js';
import * as servicioCopia from '../../services/copia.service.js';
import * as servicioCatalogos from '../../services/catalogos.service.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';
import { cargarPlantillasEditor, montarEditorCatalogo } from '../../components/editor-catalogo/editor-catalogo.js';

// Tablas que se pueden exportar a CSV desde Ajustes
const EXPORTACIONES = {
  ventas: { archivo: 'ventas.csv', columnas: ['N°', 'Fecha', 'Cliente', 'Pago', 'Total', 'Atendió'],
    filas: () => estado.ventas.map((v) => [v.id, aFecha(v.fecha), v.cliente, v.metodo, v.total, v.usuario ?? '']) },
  devoluciones: { archivo: 'devoluciones.csv', columnas: ['N°', 'Fecha', 'Venta', 'Tipo', 'Motivo', 'Total', 'Registró'],
    filas: () => estado.devoluciones.map((d) => [d.id, aFecha(d.fecha), d.ventaId, d.tipo, d.motivo, d.total, d.usuario]) },
  clientes: { archivo: 'clientes.csv', columnas: ['ID', 'Nombre', 'Teléfono', 'Correo', 'Dirección'],
    filas: () => estado.clientes.map((c) => [c.id, c.nombre, c.telefono, c.correo, c.direccion]) },
  pagos: { archivo: 'pagos.csv', columnas: ['N°', 'Fecha', 'Tipo', 'Cliente o proveedor', 'Concepto', 'Medio de pago', 'Valor'],
    filas: () => estado.pagos.map((p) => [p.id, aFecha(p.fecha), p.tipo, p.tercero, p.concepto, p.metodo, p.valor]) },
  contabilidad: { archivo: 'dias-cerrados.csv', columnas: ['Día', 'Ventas', 'Total vendido', 'Devoluciones', 'Utilidad', 'Crédito', 'Abonos', 'Pagos a proveedores', 'Compras', 'Diferencia de caja'],
    filas: () => estado.contabilidad.map((c) => [c.dia, c.cantidadVentas, c.totalVentas, c.devoluciones ?? 0, c.utilidad, c.ventasCredito ?? 0, c.abonosClientes, c.pagosProveedores, c.comprasFacturadas, c.diferenciaCaja]) },
  auditoria: { archivo: 'auditoria.csv', columnas: ['N°', 'Fecha', 'Usuario', 'Módulo', 'Acción', 'Detalle'],
    filas: () => estado.auditoria.map((a) => [a.id, aFecha(a.fecha), a.usuario, a.modulo, a.accion, a.detalle]) },
};

let documento;
let plantillasFormulario;
let plantillasEditor;

export async function dibujar() {
  documento = await cargarHtml(new URL('./ajustes.html', import.meta.url));
  [plantillasFormulario, plantillasEditor] = await Promise.all([cargarPlantillasFormulario(), cargarPlantillasEditor()]);
  return seccion(documento, 'principal');
}

// Recibo de ejemplo: usa los ajustes guardados con una venta inventada, pagada con el primer medio de pago activo
const ventaDeEjemplo = () => {
  const metodoId = servicioCatalogos.primeroActivo('metodosPago');
  return {
    tipo: 'factura',
    fecha: new Date().toISOString(),
    cliente: 'Cliente de ejemplo',
    metodoId,
    metodo: servicioCatalogos.nombreDe('metodosPago', metodoId),
    total: 37000,
    items: [
      { nombre: 'Producto de ejemplo A', cantidad: 2, valorUnitario: 12500, iva: 19 },
      { nombre: 'Producto de ejemplo B', cantidad: 1, valorUnitario: 12000, iva: 19 },
    ],
  };
};

// Un formulario incrustado de Ajustes (siempre visible, muestra lo guardado)
const formularioDeAjustes = (raiz, contexto, selector, opciones) => montarFormulario(buscar(selector, raiz), {
  plantillas: plantillasFormulario, incrustado: true, columnas: 2, alError: contexto.alerta, ...opciones,
});

// Marca: nombre y color en un formulario; el logo se guarda al elegir el archivo
function montarMarca(raiz, contexto, ejecutar) {
  const marca = () => estado.ajustes.marca;
  const aplicar = () => {
    aplicarMarca(marca().acento);
    refrescarMarca();
    buscar('#vista-logo', raiz).innerHTML = logoCompleto(40);
  };
  const guardar = (cambios, mensaje) => {
    const aplicado = ejecutar(() => servicioAjustes.guardarMarca({ ...marca(), ...cambios }), mensaje);
    if (aplicado) aplicar();
    return aplicado;
  };
  formularioDeAjustes(raiz, contexto, '#formulario-marca', {
    clave: 'marca',
    textoGuardar: 'Guardar marca',
    valores: marca,
    campos: [
      { clave: 'nombreComercial', etiqueta: 'Nombre comercial', obligatorio: true, maximo: 40 },
      { clave: 'acento', etiqueta: 'Color de la marca', tipo: 'color', obligatorio: true, ayuda: 'Botones principales, selección y logo' },
    ],
    alGuardar: (datos) => guardar(datos, 'Marca guardada correctamente'),
  });
  buscar('#cargar-logo', raiz).onchange = (evento) => {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => guardar({ logo: lector.result }, 'Logo guardado correctamente');
    lector.onerror = () => contexto.alerta('No se pudo leer la imagen');
    lector.readAsDataURL(archivo);
  };
  buscar('#quitar-logo', raiz).onclick = () => guardar({ logo: '' }, 'Logo de Genérico aplicado correctamente');
  aplicar();
}

// Parámetros de cada sección: cada formulario guarda solo los suyos
function montarParametros(raiz, contexto, ejecutar) {
  const parametros = () => estado.ajustes.parametros;
  const prefijos = Object.entries(servicioCatalogos.DOCUMENTOS_CON_PREFIJO);
  const guardar = (datos) => ejecutar(() => servicioCatalogos.guardarParametros(datos), 'Parámetros guardados correctamente');
  formularioDeAjustes(raiz, contexto, '#formulario-moneda', {
    clave: 'moneda',
    textoGuardar: 'Guardar moneda',
    valores: parametros,
    campos: [
      { clave: 'moneda', etiqueta: 'Moneda', obligatorio: true, maximo: 3, ayuda: 'Código de 3 letras: COP, USD, MXN…' },
      { clave: 'formato', etiqueta: 'Formato regional', obligatorio: true, maximo: 12, ayuda: 'Cifras y fechas: es-CO, es-MX…' },
    ],
    // Las cifras y fechas de toda la pantalla cambian: se vuelve a dibujar
    alGuardar: (datos) => {
      const aplicado = guardar(datos);
      if (aplicado) contexto.redibujar();
      return aplicado;
    },
  });
  formularioDeAjustes(raiz, contexto, '#formulario-ventas', {
    clave: 'parametros-ventas',
    textoGuardar: 'Guardar prefijos y plazos',
    columnas: 4,
    valores: () => ({ ...parametros(), ...Object.fromEntries(prefijos.map(([clave]) => [`prefijo-${clave}`, parametros().prefijos[clave]])) }),
    campos: [
      { clave: 'vigenciaCotizacion', etiqueta: 'Vigencia de la cotización (días)', tipo: 'entero', obligatorio: true, ancho: 2 },
      { clave: 'plazoCredito', etiqueta: 'Plazo de pago por defecto (días)', tipo: 'entero', obligatorio: true, ancho: 2, ayuda: 'Se ve escrito al crear clientes y proveedores' },
      ...prefijos.map(([clave, etiqueta]) => ({ clave: `prefijo-${clave}`, etiqueta: `Prefijo ${etiqueta.toLowerCase()}`, obligatorio: true, maximo: 4 })),
    ],
    despues: '<p class="texto-suave">Un prefijo nuevo solo aplica a los documentos que se registren desde ahora; los anteriores conservan su número.</p>',
    alGuardar: guardar,
  });
  formularioDeAjustes(raiz, contexto, '#formulario-crm', {
    clave: 'parametros-crm',
    textoGuardar: 'Guardar cartera e inactividad',
    valores: () => ({ ...parametros(), cortesCartera: parametros().cortesCartera.join(', ') }),
    campos: [
      { clave: 'diasInactividad', etiqueta: 'Cliente inactivo después de (días sin comprar)', tipo: 'entero', obligatorio: true },
      { clave: 'cortesCartera', etiqueta: 'Cortes de la cartera por edades (días)', obligatorio: true, maximo: 40, ayuda: 'Separados por coma, de menor a mayor' },
    ],
    alGuardar: guardar,
  });
}

// Una tabla por catálogo dentro de su sección (Ventas y documentos, CRM, Inventario)
function montarCatalogos(raiz, ejecutar) {
  const { CATALOGOS } = servicioCatalogos;
  buscarTodos('[data-catalogos]', raiz).forEach((seccionCatalogos) => {
    const claves = Object.keys(CATALOGOS).filter((clave) => CATALOGOS[clave].seccion === seccionCatalogos.dataset.catalogos);
    seccionCatalogos.innerHTML = repetir(documento, 'contenedor-catalogo', claves.map((clave) => ({ clave })));
    claves.forEach((clave) => montarEditorDe(buscar(`[data-catalogo="${clave}"]`, seccionCatalogos), clave, ejecutar));
  });
}

function montarEditorDe(contenedor, clave, ejecutar) {
  const definicion = servicioCatalogos.CATALOGOS[clave];
  const aviso = (texto) => `${definicion.titulo}: ${texto} correctamente`;
  const ayudas = {
    metodosPago: 'Tipo: el efectivo entra a la caja, el crédito queda como deuda del cliente y otro va al banco o la billetera.',
    etapasEmbudo: 'Enviada, Ganada y Perdida son fijas; las intermedias se agregan y ordenan.',
    listasPrecio: 'Se muestran con su número; el nombre acompaña al precio en cada producto.',
    tiposActividad: 'Tarea es fija: tiene fecha y responsable.',
  };
  montarEditorCatalogo(contenedor, {
    plantillas: plantillasEditor,
    clave,
    titulo: definicion.titulo,
    ayuda: ayudas[clave] ?? '',
    singular: definicion.singular,
    codigo: definicion.codigo ?? null,
    extras: definicion.extras ?? [],
    sinAgregar: Boolean(definicion.sinAgregar),
    elementos: () => servicioCatalogos.elementos(clave),
    usos: definicion.usos,
    esFijo: (id) => servicioCatalogos.esFijo(clave, id),
    alAgregar: (datos) => ejecutar(() => servicioCatalogos.agregarElemento(clave, datos), aviso('elemento agregado')),
    alCambiar: (id, cambios) => ejecutar(() => servicioCatalogos.actualizarElemento(clave, id, cambios), aviso('cambio aplicado')),
    alMover: (id, direccion) => ejecutar(() => servicioCatalogos.moverElemento(clave, id, direccion), aviso('orden actualizado')),
    alActivar: (id, activo) => ejecutar(() => servicioCatalogos.cambiarActivo(clave, id, activo), aviso(activo ? 'elemento activado' : 'elemento desactivado')),
    alEliminar: (id) => ejecutar(() => servicioCatalogos.eliminarElemento(clave, id), aviso('elemento eliminado')),
  });
}

export function montar(raiz, contexto) {
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

  // Apariencia
  const pintarSegmentos = () => {
    const menu = leerMenuRecogido() ? 'recogido' : 'abierto';
    buscarTodos('[data-opcion-tema]', raiz).forEach((boton) =>
      boton.setAttribute('aria-pressed', String(boton.dataset.opcionTema === leerTema())));
    buscarTodos('[data-opcion-menu]', raiz).forEach((boton) =>
      boton.setAttribute('aria-pressed', String(boton.dataset.opcionMenu === menu)));
  };

  buscarTodos('[data-opcion-tema]', raiz).forEach((boton) => {
    boton.onclick = () => {
      aplicarTema(boton.dataset.opcionTema);
      pintarSegmentos();
      contexto.aviso(`Tema ${boton.textContent.trim().toLowerCase()} aplicado correctamente`);
    };
  });

  buscarTodos('[data-opcion-menu]', raiz).forEach((boton) => {
    boton.onclick = () => {
      establecerMenuRecogido(boton.dataset.opcionMenu === 'recogido');
      pintarSegmentos();
      contexto.aviso(`Menú lateral ${boton.textContent.trim().toLowerCase()} aplicado correctamente`);
    };
  });
  pintarSegmentos();

  // Tienda y mensaje del recibo: formularios incrustados que muestran lo guardado
  const formulario = (selector, opciones) => formularioDeAjustes(raiz, contexto, selector, opciones);
  formulario('#formulario-tienda', {
    clave: 'tienda',
    textoGuardar: 'Guardar datos del negocio',
    valores: () => estado.ajustes.tienda,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true },
      { clave: 'nit', etiqueta: 'NIT', maximo: 30 },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      { clave: 'ciudad', etiqueta: 'Ciudad' },
      { clave: 'direccion', etiqueta: 'Dirección', ancho: 'completo' },
    ],
    alGuardar: (datos) => ejecutar(() => servicioAjustes.guardarDatosTienda(datos), 'Datos del negocio guardados correctamente'),
  });
  formulario('#formulario-recibo', {
    clave: 'recibo',
    textoGuardar: 'Guardar recibo',
    columnas: 2,
    valores: () => estado.ajustes.recibo,
    campos: [
      { clave: 'pie', etiqueta: 'Mensaje al final del recibo', maximo: 300 },
      {
        clave: 'anchoTirilla', etiqueta: 'Ancho de la tirilla', tipo: 'seleccion', obligatorio: true, ayuda: 'El de la impresora de punto de venta',
        opciones: servicioAjustes.ANCHOS_TIRILLA.map((ancho) => [ancho, `${ancho} mm`]),
      },
    ],
    alGuardar: (datos) => ejecutar(() => servicioAjustes.guardarRecibo(datos), 'Recibo guardado correctamente'),
  });

  montarMarca(raiz, contexto, ejecutar);
  montarParametros(raiz, contexto, ejecutar);
  montarCatalogos(raiz, ejecutar);

  const permitirSinExistencias = buscar('#permitir-sin-existencias', raiz);
  permitirSinExistencias.checked = estado.ajustes.ventas.permitirSinExistencias;
  permitirSinExistencias.onchange = () => ejecutar(
    () => servicioAjustes.establecerPermitirSinExistencias(permitirSinExistencias.checked),
    permitirSinExistencias.checked
      ? 'Ahora se puede vender sin existencias, aplicado correctamente'
      : 'Ya no se puede vender sin existencias, aplicado correctamente',
  );

  // Recibo
  const mostrarDatos = buscar('#mostrar-datos-tienda', raiz);
  mostrarDatos.checked = estado.ajustes.recibo.mostrarDatosTienda;
  mostrarDatos.onchange = () => ejecutar(
    () => servicioAjustes.establecerMostrarDatosTienda(mostrarDatos.checked),
    'Datos del negocio en el recibo actualizados correctamente',
  );

  buscar('#ver-recibo-ejemplo', raiz).onclick = () => mostrarRecibo(ventaDeEjemplo());

  // Datos de prueba: pide confirmación antes de borrar
  const confirmacion = buscar('#confirmar-restablecer', raiz);
  buscar('#restablecer', raiz).onclick = () => {
    confirmacion.hidden = false;
    buscar('#confirmar-restablecer-no', raiz).focus();
  };
  buscar('#confirmar-restablecer-no', raiz).onclick = () => {
    confirmacion.hidden = true;
    buscar('#restablecer', raiz).focus();
  };
  buscar('#confirmar-restablecer-si', raiz).onclick = () => {
    confirmacion.hidden = true;
    if (ejecutar(servicioAjustes.restablecerDatosIniciales, 'Datos iniciales restablecidos correctamente')) contexto.redibujar();
  };

  // Copia de seguridad: descarga, restauración validada y exportación de tablas a CSV
  buscar('#descargar-copia', raiz).onclick = async () => {
    try {
      await servicioCopia.descargarCopia();
      contexto.aviso('Copia de seguridad descargada correctamente');
    } catch (error) {
      contexto.alerta(error.message);
    }
  };

  const confirmacionCopia = buscar('#confirmar-copia', raiz);
  let copiaLeida = null;
  buscar('#cargar-copia', raiz).onchange = async (evento) => {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;
    try {
      copiaLeida = await servicioCopia.leerCopia(archivo);
      const { conteo, fecha } = copiaLeida;
      buscar('#texto-copia', raiz).textContent = `Copia del ${aFecha(fecha)} válida: ${conteo.productos} productos, ${conteo.ventas} ventas, ${conteo.clientes} clientes. Reemplaza todos los datos actuales. ¿Restaurar?`;
      confirmacionCopia.hidden = false;
      buscar('#confirmar-copia-no', raiz).focus();
    } catch (error) {
      contexto.alerta(error.message);
    }
  };
  buscar('#confirmar-copia-no', raiz).onclick = () => { confirmacionCopia.hidden = true; copiaLeida = null; };
  buscar('#confirmar-copia-si', raiz).onclick = () => {
    confirmacionCopia.hidden = true;
    if (!copiaLeida) return;
    if (ejecutar(() => servicioCopia.restaurarCopia(copiaLeida.datos), 'Copia de seguridad restaurada correctamente')) contexto.redibujar();
    copiaLeida = null;
  };

  buscar('#descargar-tabla', raiz).onclick = () => {
    const tabla = EXPORTACIONES[buscar('#tabla-csv', raiz).value];
    descargarCsv(tabla.archivo, tabla.columnas, tabla.filas());
    contexto.aviso('Documento CSV descargado correctamente');
  };
}
