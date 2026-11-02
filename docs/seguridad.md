# Seguridad

Qué hace la interfaz. Solo oculta y avisa: cuando exista un servidor, **toda regla debe repetirse allí**.

## Ya implementado en el navegador

| Medida | Dónde |
|---|---|
| Política de contenido (CSP) en cada página: solo scripts, estilos e imágenes propios; sin `object`, `base` ni formularios externos | `<meta http-equiv="Content-Security-Policy">` de cada `.html` |
| Textos siempre escapados al dibujar (`{{x}}`); el HTML sin escapar (`{{{x}}}`) solo se usa con plantillas propias | `src/core/template.js` |
| Permisos por rol aplicados en el menú, en cada pantalla y dentro de cada servicio (`exigirPermiso`) | `src/core/autorizacion.js`, `src/services/*` |
| Permiso especial «Reabrir» para reabrir la contabilidad | `src/config/permisos.js` |
| Bloqueo de 5 minutos tras 5 intentos fallidos de ingreso | `src/modules/acceso/acceso.js` |
| Cierre de sesión por 30 minutos de inactividad y si la persona es desactivada | `src/core/sesion.js`, `src/main.js` |
| Auditoría de acciones (quién, cuándo, qué); solo se agregan registros | `src/services/auditoria.service.js` |
| Día cerrado inmutable: no se anulan sus ventas ni se registran facturas con esa fecha | `ventas.service.js`, `inventario.service.js` |
| Validación única de datos, incluida la copia de seguridad | `src/core/validacion.js` |
