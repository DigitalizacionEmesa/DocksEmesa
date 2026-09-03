# Desplegar EMESA DOCK: Netlify + Flask + Supabase

## Diagnóstico del proyecto actual

Este repositorio contiene una aplicación **Flask** completa:

- `app.py` genera las páginas HTML, gestiona la sesión y expone la API.
- `templates/` y `static/` son recursos que Flask sirve directamente.
- La aplicación necesita `SUPABASE_URL`, `SUPABASE_KEY` y `SECRET_KEY` en el servidor.
- `netlify/functions/api.py` intenta adaptar Flask mediante `serverless-wsgi`.

El despliegue completo no funciona en Netlify porque sus Serverless Functions admiten JavaScript, TypeScript y Go, pero **no Python**. Por tanto Netlify no detecta ni publica `netlify/functions/api.py`; después, la regla actual que redirige `/*` a esa función conduce a una ruta inexistente y devuelve 404.

No es un error de Flask ni de Supabase y añadir paquetes a `requirements.txt` no lo resolverá.

Fuentes: [Netlify Functions](https://www.netlify.com/platform/core/functions/) y [confirmación del soporte de Netlify](https://answers.netlify.com/t/site-deploys-successfully-but-shows-404-python-flask-function-not-being-detected/155352).

## Solución recomendada

Mantener el backend Flask tal como está y dividir el despliegue:

```text
Navegador
    |
    +--> Netlify: frontend estático (HTML, CSS, JS, imágenes)
    |
    +--> Render / Railway / Fly.io: API Flask
                                   |
                                   +--> Supabase
```

Esta opción conserva la lógica actual de permisos, sesiones y API. Netlify queda para lo que mejor hace: publicar el frontend y dar HTTPS/CDN. El backend debe alojarse en un proveedor que ejecute Python; Render es una opción sencilla para este caso.

> Si se necesita que todo esté en Netlify, habrá que reescribir `app.py` y las rutas API en JavaScript/TypeScript (o mover la lógica al cliente con Supabase y políticas RLS). No es un cambio de configuración: es una migración de backend.

---

## Parte 1: preparar el backend Flask para Render

### 1. Crear `Procfile`

En la raíz del proyecto crea un archivo llamado `Procfile`, sin extensión, con esta única línea:

```text
web: gunicorn app:app
```

### 2. Añadir Gunicorn a las dependencias

Añade esta línea a `requirements.txt`:

```text
gunicorn==23.0.0
```

No elimines Flask, Supabase ni las demás dependencias actuales.

### 3. Confirmar que las claves no se suben al repositorio

El `.gitignore` ya incluye `.env`, que es correcto. Comprueba antes de hacer `git add`:

```powershell
git status --short
git ls-files .env
```

El segundo comando no debe devolver ninguna ruta. Nunca copies una `SUPABASE_KEY` de servicio en JavaScript, HTML, `netlify.toml` ni en un repositorio.

### 4. Usar una clave de sesión segura

Tu código permite una clave de desarrollo por defecto. En producción debes definir `SECRET_KEY` como variable de entorno con un valor aleatorio largo. Puedes generar uno localmente con:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 5. Subir el código a GitHub

Render y Netlify pueden desplegar desde Git. Confirma que el repositorio contiene como mínimo:

```text
app.py
config.py
requirements.txt
Procfile
templates/
static/
```

La carpeta `netlify/` no es necesaria para el backend de Render y se puede conservar sin problema, aunque no se utilizará.

### 6. Crear el servicio en Render

1. Entra en [Render](https://render.com/) y crea **New + > Web Service**.
2. Conecta el repositorio de GitHub y selecciona este proyecto.
3. Usa estos valores:

| Campo de Render | Valor |
|---|---|
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app` |
| Branch | La rama que publicarás, normalmente `main` |

4. En **Environment** crea estas variables (no las pongas en el código):

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La URL de tu proyecto Supabase |
| `SUPABASE_KEY` | La clave de servicio usada por el backend |
| `SECRET_KEY` | La clave aleatoria generada en el paso anterior |

5. Guarda y despliega. Anota la URL resultante, por ejemplo `https://emesa-dock-api.onrender.com`.

### 7. Verificar el backend antes de continuar

Abre `https://TU-BACKEND/`. Debe aparecer la pantalla de inicio de sesión. Si falla:

- Revisa los **Logs** del servicio Render.
- Si aparece `ModuleNotFoundError`, verifica `requirements.txt`.
- Si aparece un error de Supabase o devuelve 500 al iniciar sesión, revisa las tres variables de entorno en Render.
- Si aparece `502`, confirma que el comando de arranque es exactamente `gunicorn app:app`.

---

## Parte 2: hacer un frontend estático para Netlify

El `frontend/` del repositorio parece ser una base independiente y no sustituye automáticamente las vistas de Flask: las páginas de producción están en `templates/` y usan las rutas y sesión del backend. Antes de publicar en Netlify hay que crear una copia estática explícita o migrar las plantillas.

### Opción A — usar Netlify solo cuando el frontend ya sea estático

Esta es la opción adecuada si se preparan páginas HTML estáticas que llamen a la API Flask remota.

1. Crea una carpeta, por ejemplo `site/`, para el frontend final.
2. Copia dentro sus HTML, CSS, JavaScript, imágenes y traducciones necesarios.
3. En el JavaScript central define una única URL de API:

```js
const API_BASE_URL = "https://TU-BACKEND.onrender.com";
```

4. Cambia las llamadas que ahora usan rutas relativas, por ejemplo:

```js
fetch('/api/me')
```

por:

```js
fetch(`${API_BASE_URL}/api/me`, { credentials: 'include' })
```

5. Para que la sesión por cookie funcione entre dominios distintos, el backend debe habilitar CORS con credenciales y configurar cookies `Secure`, `SameSite=None`. Esto requiere un pequeño cambio controlado en Flask y no debe improvisarse: hay que limitar explícitamente los orígenes al dominio final de Netlify.

### Opción B — evitar cookies cruzadas

Es la arquitectura más limpia a medio plazo. El navegador usa Supabase Auth directamente con una **anon key pública** y envía el token `Bearer` al backend para operaciones que precisen lógica propia. La service role key permanece solo en Flask. Requiere adaptar la autenticación actual, pero evita la complejidad de CORS/sesiones entre `netlify.app` y Render.

> La clave `anon` de Supabase se puede exponer en el navegador; la `service_role` o una clave secreta nunca.

---

## Parte 3: publicar el frontend estático en Netlify

### 1. Crear o ajustar `netlify.toml`

Para un frontend que se publica desde `site/`, usa este contenido mínimo:

```toml
[build]
  publish = "site"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Este redirect solo sirve para navegación de una SPA. Si cada pantalla tiene un archivo HTML propio, puede omitirse. **No uses** el redirect actual hacia `/.netlify/functions/api`: esa función Python no será desplegada.

No declares secretos en este archivo. Las variables puestas en `netlify.toml` no están disponibles durante la ejecución de Functions y, además, quedarían en el repositorio. Consulta la [documentación de variables de entorno](https://docs.netlify.com/build/functions/environment-variables/).

### 2. Desplegar desde la interfaz web

1. En Netlify selecciona **Add new project > Import an existing project**.
2. Conecta GitHub y elige el repositorio.
3. Establece:

| Ajuste | Valor |
|---|---|
| Base directory | vacío (raíz del repositorio) |
| Build command | vacío, si `site/` ya contiene archivos listos |
| Publish directory | `site` |
| Functions directory | vacío/no usar |

4. Pulsa **Deploy**.
5. Abre la URL temporal `*.netlify.app` y prueba carga, login, navegación y llamadas API.

### 3. Alternativa por terminal

Instala la CLI y autentícate:

```powershell
npm install -g netlify-cli
netlify login
netlify init
```

Primero crea una vista previa:

```powershell
netlify deploy --dir=site
```

Cuando todo funcione, publica producción:

```powershell
netlify deploy --dir=site --prod
```

Netlify también permite `netlify build --dry` para revisar la configuración y `netlify dev` para probar las redirecciones y variables locales. Referencia: [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).

---

## Comprobación final

Antes de considerar terminado el despliegue, verifica:

- [ ] `https://TU-BACKEND/` responde y muestra la aplicación Flask.
- [ ] Las variables `SUPABASE_URL`, `SUPABASE_KEY` y `SECRET_KEY` están configuradas solo en el proveedor del backend.
- [ ] `.env` no está rastreado por Git.
- [ ] Netlify publica archivos estáticos, no intenta ejecutar `api.py`.
- [ ] El frontend usa la URL correcta del backend.
- [ ] Si existen llamadas entre Netlify y Render, CORS permite solo el dominio real de Netlify y los métodos necesarios.
- [ ] Se prueba el login y una operación de lectura/escritura real contra Supabase.
- [ ] Las herramientas de desarrollo del navegador no muestran 404, CORS, 401 ni 500.

## Si insistes en usar únicamente Netlify

Las únicas vías son:

1. Reescribir las rutas de `app.py` como Netlify Functions en JavaScript/TypeScript y conservar Supabase como base de datos/autenticación.
2. Convertir la aplicación en frontend estático con Supabase JS y aplicar toda la autorización con RLS, funciones SQL y Edge Functions de Supabase.

Ambas opciones exigen rediseñar la autenticación, las sesiones y los endpoints de administración. No conviene mezclar el adaptador `serverless-wsgi` con Netlify porque nunca llegará a ejecutarse allí.

## Qué hacer con el `netlify.toml` y `netlify/functions/api.py` actuales

Mientras el backend siga siendo Flask:

- No los utilices para desplegar el backend en Netlify.
- Puedes eliminarlos cuando se haya validado el nuevo flujo, o reemplazar `netlify.toml` por la configuración estática de este documento.
- No borres `app.py`, `templates/` ni `static/`: son necesarios para el backend Flask en Render.

