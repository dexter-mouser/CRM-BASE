import { buscar, buscarTodos } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { leerTema, aplicarTema } from '../../core/tema.js';
import { leerMenuRecogido, establecerMenuRecogido } from '../../components/sidebar/sidebar.js';
import { mostrarReciboDeVenta as mostrarRecibo } from '../../components/recibo/comprobantes.js';
import { aFecha } from '../../core/format.js';
import { descargarCsv } from '../../services/csv.service.js';
import * as servicioAjustes from '../../services/ajustes.service.js';
import * as servicioCopia from '../../services/copia.service.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';

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

let plantillasFormulario;

export async function dibujar() {
  const documento = await cargarHtml(new URL('./ajustes.html', import.meta.url));
  plantillasFormulario = await cargarPlantillasFormulario();
  return seccion(documento, 'principal', {
    metodos: repetir(documento, 'casilla-metodo', servicioAjustes.METODOS_DISPONIBLES.map((metodo) => ({ metodo }))),
  });
}

// Recibo de ejemplo: usa los ajustes guardados con una venta inventada
const ventaDeEjemplo = () => ({
  fecha: new Date().toISOString(),
  cliente: 'Cliente de ejemplo',
  metodo: estado.ajustes.ventas.metodosPago[0],
  total: 37000,
  items: [
    { nombre: 'Producto de ejemplo A', cantidad: 2, valorUnitario: 12500 },
    { nombre: 'Producto de ejemplo B', cantidad: 1, valorUnitario: 12000 },
  ],
});

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
  const formulario = (selector, opciones) => montarFormulario(buscar(selector, raiz), {
    plantillas: plantillasFormulario, incrustado: true, columnas: 2, alError: contexto.alerta, ...opciones,
  });
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
    textoGuardar: 'Guardar mensaje',
    columnas: 1,
    valores: () => estado.ajustes.recibo,
    campos: [{ clave: 'pie', etiqueta: 'Mensaje al final del recibo', maximo: 300 }],
    alGuardar: ({ pie }) => ejecutar(() => servicioAjustes.guardarMensajeRecibo(pie), 'Mensaje del recibo guardado correctamente'),
  });

  // Ventas: los cambios se aplican al marcar o desmarcar
  buscarTodos('[data-metodo]', raiz).forEach((casilla) => {
    casilla.checked = estado.ajustes.ventas.metodosPago.includes(casilla.dataset.metodo);
    casilla.onchange = () => {
      const aplicado = ejecutar(
        () => servicioAjustes.establecerMetodoPago(casilla.dataset.metodo, casilla.checked),
        'Medios de pago actualizados correctamente',
      );
      if (!aplicado) casilla.checked = !casilla.checked;
    };
  });

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
    ejecutar(servicioAjustes.restablecerDatosDePrueba, 'Datos de prueba restablecidos correctamente');
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
