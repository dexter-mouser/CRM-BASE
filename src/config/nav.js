// Navegación. Cada módulo es una página propia (paginas/<id>.html) con su permiso; los módulos se agrupan en 6 grupos
// que se ven siempre en el menú. El grupo abierto muestra sus secciones debajo y como pestañas en la página.
// Para agregar un módulo: una entrada en MENU, su sección en GRUPOS, una ruta en routes.js y una página paginas/<id>.html.
// "Cerrar sesión" va siempre al final y la agrega el menú lateral.

// Módulos (uno por página y por permiso). Roles y permisos se arma con esta lista.
export const MENU = [
  { id: 'panel', etiqueta: 'Panel' },
  { id: 'reportes', etiqueta: 'Reportes' },
  { id: 'nueva-venta', etiqueta: 'Registrar venta' },
  { id: 'ventas', etiqueta: 'Ventas' },
  { id: 'caja', etiqueta: 'Caja' },
  { id: 'clientes', etiqueta: 'Clientes' },
  { id: 'seguimiento', etiqueta: 'Seguimiento' },
  { id: 'embudo', etiqueta: 'Embudo' },
  { id: 'inventario', etiqueta: 'Inventario' },
  { id: 'bodegas', etiqueta: 'Bodegas' },
  { id: 'proveedores', etiqueta: 'Proveedores' },
  { id: 'contabilidad', etiqueta: 'Contabilidad' },
  { id: 'pagos', etiqueta: 'Pagos' },
  { id: 'tiendas', etiqueta: 'Sucursales' },
  { id: 'empleados', etiqueta: 'Empleados' },
  { id: 'roles', etiqueta: 'Roles y permisos' },
  { id: 'auditoria', etiqueta: 'Auditoría' },
  { id: 'ajustes', etiqueta: 'Ajustes' },
];

// Grupos del menú. Cada sección abre un módulo; "seccion" muestra solo esa parte de la página (?seccion=...).
// "descripcion" es el texto de la cabecera destacada de la sección.
export const GRUPOS = [
  {
    id: 'inicio',
    etiqueta: 'Inicio',
    icono: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    secciones: [
      { etiqueta: 'Panel', modulo: 'panel',
        descripcion: 'Resumen del día, accesos principales y pendientes. Arrastra las tarjetas para reordenarlas.' },
      { etiqueta: 'Reportes', modulo: 'reportes',
        descripcion: 'Ventas, clientes, embudo y vendedores por rango de fechas; cartera por antigüedad, clientes inactivos y stock bajo.' },
    ],
  },
  {
    id: 'ventas',
    etiqueta: 'Ventas',
    icono: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    secciones: [
      { etiqueta: 'Registrar venta', modulo: 'nueva-venta',
        descripcion: 'Factura, remisión o cotización en un solo bloque: cliente, documento, lista de precio, productos (busca escribiendo debajo de cada columna) y pago.' },
      { etiqueta: 'Facturas', modulo: 'ventas', seccion: 'facturas',
        descripcion: 'Facturas de venta con su ficha. Las devoluciones y anulaciones generan una nota anclada a la factura, devuelven el stock y ajustan la caja o la deuda.' },
      { etiqueta: 'Remisiones y cotizaciones', modulo: 'ventas', seccion: 'documentos',
        descripcion: 'Una remisión descuenta el stock sin cobrar y se pasa a factura; una cotización es solo una oferta. Al pasarse conservan su número (C5 → R5 → F5).' },
      { etiqueta: 'Notas', modulo: 'ventas', seccion: 'notas',
        descripcion: 'Notas de devolución (ND) y de anulación (NA), cada una con su consecutivo y anclada a su factura original.' },
      { etiqueta: 'Caja', modulo: 'caja',
        descripcion: 'Cada sucursal tiene su caja: ábrela con una base, registra ingresos y egresos y ciérrala contando el efectivo.' },
    ],
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    icono: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    secciones: [
      { etiqueta: 'Clientes', modulo: 'clientes',
        descripcion: 'Ficha de cada cliente con su documento, contacto, etiquetas, cupo de crédito e historial. La deuda sale de las ventas a Crédito menos devoluciones y abonos.' },
      { etiqueta: 'Seguimiento', modulo: 'seguimiento',
        descripcion: 'Llamadas, WhatsApp, visitas, correos y notas con cada cliente, y tareas con fecha y responsable.' },
      { etiqueta: 'Embudo', modulo: 'embudo',
        descripcion: 'Cada cotización es una oportunidad: enviada, en negociación, ganada (al pasarla a remisión o factura) o perdida (con motivo).' },
    ],
  },
  {
    id: 'inventario',
    etiqueta: 'Inventario',
    icono: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    secciones: [
      { etiqueta: 'Productos', modulo: 'inventario', seccion: 'productos',
        descripcion: 'Catálogo con costo, tres precios de venta (1 surtido, 2 por mayor, 3 al detal), stock mínimo y existencias por bodega. El producto genérico sirve para servicios y reparaciones.' },
      { etiqueta: 'Kardex', modulo: 'inventario', seccion: 'kardex',
        descripcion: 'Entradas (+) y salidas (−) de cada producto con el saldo después de cada movimiento: ventas, compras, devoluciones, ajustes y traslados.' },
      { etiqueta: 'Compras', modulo: 'inventario', seccion: 'compras',
        descripcion: 'Facturas de compra de los proveedores: suman al stock de la bodega elegida y actualizan el costo de cada producto.' },
      { etiqueta: 'Bodegas', modulo: 'bodegas',
        descripcion: 'Stock de cada bodega y traslados entre ellas. Un traslado sale del origen al enviarlo y entra al destino cuando se recibe.' },
      { etiqueta: 'Proveedores', modulo: 'proveedores',
        descripcion: 'Datos de cada proveedor, lo que se le debe y sus órdenes de compra. Una orden se recibe ingresando su factura en Compras.' },
    ],
  },
  {
    id: 'finanzas',
    etiqueta: 'Finanzas',
    icono: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2M16 12v4"/>',
    secciones: [
      { etiqueta: 'Contabilidad', modulo: 'contabilidad',
        descripcion: 'Cierra la contabilidad de cada día para guardar su resumen. Los días se cierran en orden y el de hoy se cierra mañana.' },
      { etiqueta: 'Abonos de clientes', modulo: 'pagos', seccion: 'abonos',
        descripcion: 'Abonos de los clientes que deben. Se aplican primero a la factura a crédito más antigua.' },
      { etiqueta: 'Pagos a proveedores', modulo: 'pagos', seccion: 'proveedores',
        descripcion: 'Pagos a proveedores con facturas de compra pendientes.' },
    ],
  },
  {
    id: 'administracion',
    etiqueta: 'Administración',
    corta: 'Admin',
    abajo: true,
    icono: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    secciones: [
      { etiqueta: 'Sucursales', modulo: 'tiendas',
        descripcion: 'Cada sucursal vende desde su bodega y tiene su propia caja. La sucursal activa se elige en el menú superior.' },
      { etiqueta: 'Empleados', modulo: 'empleados',
        descripcion: 'Ficha, sucursal, turno, meta y comisión de cada persona. Si tiene usuario, aquí se eligen las sucursales a las que puede entrar.' },
      { etiqueta: 'Roles y permisos', modulo: 'roles',
        descripcion: 'Roles con sus permisos por módulo y las personas que entran al sistema. Cada cambio queda registrado en Auditoría.' },
      { etiqueta: 'Auditoría', modulo: 'auditoria',
        descripcion: 'Registro de lo que hace cada persona: ventas, devoluciones, cierres, cambios de roles y más. Solo se puede consultar.' },
      { etiqueta: 'Ajustes', modulo: 'ajustes',
        descripcion: 'Datos del negocio, apariencia, ventas, recibo y copias de seguridad.' },
    ],
  },
];

// Accesos principales del Inicio: lo que más se usa, a un clic
export const ACCESOS_PRINCIPALES = [
  { etiqueta: 'Registrar venta', detalle: 'Factura, remisión o cotización', modulo: 'nueva-venta', permiso: 'crear', enlace: 'nueva-venta.html',
    icono: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
  { etiqueta: 'Nueva cotización', detalle: 'Entra al embudo', modulo: 'nueva-venta', permiso: 'crear', enlace: 'nueva-venta.html?tipo=cotizacion',
    icono: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>' },
  { etiqueta: 'Nuevo cliente', detalle: 'Ficha con documento y cupo', modulo: 'clientes', permiso: 'crear', enlace: 'clientes.html?nuevo=1',
    icono: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-6 7-6M17 14v6M14 17h6"/>' },
  { etiqueta: 'Caja', detalle: 'Abrir, movimientos y cierre', modulo: 'caja', permiso: 'ver', enlace: 'caja.html',
    icono: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>' },
  { etiqueta: 'Ingresar compra', detalle: 'Factura del proveedor', modulo: 'inventario', permiso: 'crear', enlace: 'inventario.html?seccion=compras',
    icono: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M12 8v6M9 11h6"/>' },
  { etiqueta: 'Registrar abono', detalle: 'Cliente con deuda', modulo: 'pagos', permiso: 'crear', enlace: 'pagos.html?seccion=abonos',
    icono: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>' },
];

export const enlaceDeSeccion = (seccion) => `${seccion.modulo}.html${seccion.seccion ? `?seccion=${seccion.seccion}` : ''}`;

// Sección del menú que corresponde a un módulo y, si la página se divide, a una de sus partes
export const seccionDeMenu = (modulo, parte = '') => GRUPOS.flatMap((grupo) => grupo.secciones)
  .find((seccion) => seccion.modulo === modulo && (!parte || !seccion.seccion || seccion.seccion === parte));

// Grupo al que pertenece un módulo
export const grupoDeModulo = (modulo) => GRUPOS.find((grupo) => grupo.secciones.some((seccion) => seccion.modulo === modulo));
