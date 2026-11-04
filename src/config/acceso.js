// ACCESO DE PRUEBA (la clave se compara en el navegador, por eso es solo para recorrer la interfaz). Solo sirve para recorrer la interfaz: la verificación ocurre en el navegador.
// Para uso real, el servidor valida el ingreso con Google y emite una sesión en cookie HttpOnly.
export const USUARIOS = [
  { usuario: 'admin', clave: 'admin123', nombre: 'Administrador', correo: 'demo@generico.com' },
];

// Cuenta de prueba que se muestra en el ingreso: solo el administrador (U-001 de la semilla)
export const CUENTAS_PRUEBA = [
  { id: 'U-001', nombre: 'Administrador', correo: 'demo@generico.com', rolId: 'propietario' },
];
