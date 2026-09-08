# Sincronización de operarios

Este proceso mantiene `operarios_corporativos` sincronizada con
`General.Usuarios` del DataLake corporativo. Solo mueve datos de identidad:
número de operario, nombre y correo. No lee, genera ni actualiza contraseñas.

## Preparación

1. Aplicar `database/migrations/036_operarios_sincronizacion_e_invitaciones.sql`
   en el proyecto de Supabase antes de la primera ejecución.
2. Definir `SUPABASE_URL` y `SUPABASE_KEY` en un entorno seguro. La clave debe
   ser privada y nunca se debe copiar al navegador.
3. Configurar las variables `DATALAKE_*` con el acceso corporativo necesario.

## Ejecución manual desde consola

Desde la raíz del proyecto:

```powershell
venv\Scripts\python.exe tools\python\sync_operarios.py
```

El comando muestra un resumen con altas, actualizaciones, inactivaciones y
errores. Cada ejecución también queda registrada en
`sincronizaciones_operarios`.

## Ejecución diaria

En un equipo conectado a la red corporativa, crear una tarea en el Programador
de tareas de Windows que ejecute el mismo comando una vez al día. La tarea debe
usar una cuenta con acceso al DataLake y con las variables de entorno definidas.

No programar una segunda lógica distinta para la ejecución manual: el botón de
administración llama al mismo servicio Python usado por este comando.

## Comportamiento de bajas

Si un número de operario ya no llega desde el origen, su registro se marca como
inactivo. No se borra ni se elimina su usuario de Supabase Auth. La desactivación
de una cuenta de acceso se gestionará en la siguiente fase desde administración.
