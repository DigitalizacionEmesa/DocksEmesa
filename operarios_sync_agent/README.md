# Agente corporativo de sincronización

Instalar esta carpeta en un equipo conectado al DataLake de EMESA. La web no
necesita ni debe tener acceso directo a ese SQL Server.

## Instalación

1. Instalar Python 3.12 y ODBC Driver 18 for SQL Server en el equipo corporativo.
2. Crear un entorno virtual e instalar `requirements.txt`.
3. Copiar `.env.example` como `.env` y completar las variables.
4. Para la ejecución diaria de las 06:00: `SincronizadorOperarios.exe --diario`
   (el archivo `ejecutar_diario.cmd` guarda el resultado en
   `sincronizador.log`).
   Para que el botón manual se atienda al momento: `python main.py` de forma
   continua como servicio de Windows.

El modo continuo consulta cada minuto la tabla `solicitudes_sincronizacion_operarios`.
Cuando un administrador pulsa **Sincronizar operarios** en la web, la solicitud
queda pendiente hasta que el agente la recoge, sincroniza y escribe el resumen.

No incluir la clave `SUPABASE_KEY` en el repositorio ni en la aplicación web.
El `.env` queda junto al ejecutable y no se empaqueta dentro de él.

## Instalación como ejecutable

La carpeta de distribución contiene el ejecutable, `.env.example` y
`ejecutar_diario.cmd`. Copiarla a un equipo que tenga acceso al DataLake,
renombrar `.env.example` a `.env` y completar las credenciales. La tarea de
Windows debe llamar a `ejecutar_diario.cmd` todos los días a las 06:00.

## Puerto de control opcional

El ejecutable puede levantar un control HTTP para comprobar que está activo o
solicitar una sincronización inmediata con:

`SincronizadorOperarios.exe --servidor`

Usa el puerto **8765** por defecto. Con `AGENT_BIND_HOST=127.0.0.1` no será
accesible desde otros equipos. Para uso en la red corporativa, configurar
`AGENT_BIND_HOST=0.0.0.0`, abrir TCP 8765 solo para IPs autorizadas y crear un
`AGENT_API_TOKEN` largo y secreto.

- `GET /health`: estado del servicio.
- `POST /sincronizar`: sincronización inmediata; requiere la cabecera
  `X-Agent-Token` con el valor de `AGENT_API_TOKEN`.
