# Puesta en marcha del nuevo acceso

Esta entrega prepara el cambio sin eliminar el acceso anterior de operarios.
La activación debe hacerse en este orden.

## 1. Aplicar la migración

Ejecutar `database/migrations/036_operarios_sincronizacion_e_invitaciones.sql`
en el SQL Editor del proyecto Supabase. Crea estas piezas sin borrar las tablas
anteriores:

- `operarios_corporativos`: copia diaria de la identidad de los operarios;
- `sincronizaciones_operarios`: historial de cada ejecución;
- `invitaciones_registro`: preautorizaciones de internos y externos;
- campos técnicos de transición en `usuarios`.

## 2. Variables de entorno

Configurar en el servidor Flask y en la máquina que ejecuta la sincronización:

```text
SUPABASE_URL=
SUPABASE_KEY=                 # clave privada, solo servidor
SUPABASE_ANON_KEY=            # clave pública, se usa al aceptar invitaciones
APP_URL=https://dominio-real-de-la-aplicacion
OPERARIOS_AUTH_SUPABASE_ONLY=0
```

`SUPABASE_KEY` no debe aparecer en JavaScript, HTML ni repositorios. La clave
anterior expuesta en un script de prueba debe revocarse desde Supabase.

## 3. Configuración de Supabase Auth

En Authentication > URL Configuration, incluir exactamente:

```text
https://dominio-real-de-la-aplicacion/registro
```

También debe estar la dirección local si se realizan pruebas locales:

```text
http://localhost:5000/registro
```

La invitación enviada por un administrador redirige a esa página. La página
recibe la sesión temporal de Supabase, permite establecer la contraseña y solo
crea el perfil si existe una invitación pendiente para el mismo email.

## 4. Invitaciones

Un administrador abre Usuarios, pulsa **Enviar invitación**, indica el email,
el tipo de usuario, el proveedor si corresponde y el rol. El rol se guarda en
la invitación en el servidor; el usuario invitado nunca lo elige durante el
registro.

No publicar ni enlazar libremente `/registro`: sin una sesión de invitación,
la página queda bloqueada.

## 5. Operarios

1. Ejecutar y validar la sincronización diaria.
2. En **Usuarios > Gestionar operarios**, crear las cuentas técnicas de los
   operarios activos.
3. Entregar al operario una contraseña temporal por un canal interno.
4. El operario deberá cambiar esa contraseña en la pantalla de acceso antes de
   poder entrar al panel.
5. Comprobar que puede iniciar sesión por número de operario.
6. Solo entonces establecer `OPERARIOS_AUTH_SUPABASE_ONLY=1` y reiniciar Flask.

El valor `0` mantiene el login anterior durante la transición. No eliminar
`operarios_login` ni sus consumidores hasta que todos los operarios hayan sido
migrados y validados.

## 6. Pendiente de la siguiente iteración

- Auditoría detallada de invitaciones y restablecimientos.
- Retirada definitiva de hashes y autenticación corporativa antigua.

## 7. Agente corporativo para la sincronización manual

La aplicación web no se conecta al DataLake. El botón de sincronización crea
una solicitud en Supabase y el agente de la carpeta `operarios_sync_agent` la
recoge desde un equipo dentro de la red EMESA.

Antes de activarlo hay que aplicar la migración
`037_solicitudes_sincronizacion_operarios.sql`. Después, instalar la carpeta
del agente en el equipo corporativo, completar su `.env` y dejar `main.py`
ejecutándose como servicio o tarea persistente de Windows.
