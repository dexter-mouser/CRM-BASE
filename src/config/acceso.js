// ACCESO DE PRUEBA (la clave se compara en el navegador, por eso es solo para recorrer la interfaz). Solo sirve para recorrer la interfaz: la verificación ocurre en el navegador.
// Para uso real, el servidor valida el ingreso con Google y emite una sesión en cookie HttpOnly.
export const USUARIOS = [
  { usuario: 'admin', clave: 'admin123', nombre: 'Administrador', correo: 'demo@generico.com' },
];

// Cuentas de prueba que se muestran en el ingreso (el rol debe existir en Roles y permisos)
export const CUENTAS_PRUEBA = [
  { id: 'U-001', nombre: 'Administrador', correo: 'demo@generico.com', rolId: 'propietario' },
  { id: 'U-002', nombre: 'Camila Duarte', correo: 'camila@generico.com', rolId: 'cajero' },
  { id: 'U-003', nombre: 'Felipe Mora', correo: 'felipe@generico.com', rolId: 'bodega' },
];
