import logging
import os
import hashlib
import re
import threading
from datetime import datetime, timedelta, timezone

from flask import Flask, render_template, request, jsonify, session

from supabase import create_client
from werkzeug.security import check_password_hash, generate_password_hash

from config import (
    APP_URL,
    DATALAKE_ENABLED,
    SUPABASE_ANON_KEY,
    SUPABASE_KEY,
    SUPABASE_URL,
)
from datalake import listar_operarios
from operarios_sync import ejecutar_sincronizacion


app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "clave-secreta-dockemesa-dev")
logger = logging.getLogger(__name__)
_bloqueo_sincronizacion_operarios = threading.Lock()


# Cliente Supabase (service role)
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_client():
    """Devuelve un cliente Supabase autenticado con el token del usuario
    (respeta las politicas RLS). Si no hay token en sesion, usa el cliente
    service role."""
    token = session.get("access_token")
    if token and SUPABASE_URL and SUPABASE_KEY:
        try:
            return create_client(
                SUPABASE_URL,
                SUPABASE_KEY,
                headers={"Authorization": f"Bearer {token}"}
            )
        except Exception:
            pass
    return supabase


# ==========================================================================
# SISTEMA DE PERMISOS POR ROL
# ==========================================================================
# Roles en la BD: admin, interno, proveedor (tabla roles, FK en usuarios.rol_id)

PERMISOS_BASE = frozenset({
    "menu:reservas",
})

PERMISOS_ADMIN = frozenset({
    "*",
})

PERMISOS_INTERNO = frozenset({
    "menu:reservas", "menu:muelles", "menu:proveedores", "menu:configuracion",
    "plantas:ver", "naves:ver", "muelles:ver", "muelles:gestionar",
    "proveedores:ver", "proveedores:gestionar",
    "reservas:ver", "reservas:aprobar", "reservas:actualizar_estado",
    "disponibilidad:ver", "disponibilidad:gestionar",
    "config:*",
})

PERMISOS_PROVEEDOR = frozenset({
    "menu:reservas",
    "reservas:crear", "reservas:ver_propias", "reservas:cancelar_propias",
})

PERMISOS_POR_ROL = {
    "admin": PERMISOS_ADMIN,
    "interno": PERMISOS_INTERNO,
    "proveedor": PERMISOS_PROVEEDOR,
    "externo": PERMISOS_PROVEEDOR,  # alias si el rol se llama 'externo'
}

ROLES_EXTERNOS = frozenset({"proveedor", "externo", "supplier", "supplier_user", "external"})


def _es_rol_externo(nombre_rol):
    """Reconoce los nombres históricos y actuales de los roles de proveedor."""
    return str(nombre_rol or "").strip().casefold() in ROLES_EXTERNOS


def permisos_de_roles(roles):
    """Une los permisos base con los de cada rol del usuario."""
    permisos = set(PERMISOS_BASE)
    for rol in roles:
        permisos |= set(PERMISOS_POR_ROL.get(rol, set()))
    return sorted(permisos)


def _obtener_nombre_rol(cliente, user_id):
    """Intenta obtener el nombre del rol con esquema nuevo (rol_id, roles.nombre)
    y si falla, con esquema antiguo (role_id, roles.name)."""
    for col_rol, col_nombre in [("rol_id", "nombre"), ("role_id", "name")]:
        try:
            datos = (
                cliente.table("usuarios")
                .select(f"{col_rol}, roles({col_nombre})")
                .eq("id", user_id)
                .single()
                .execute()
                .data
            )
            rol = datos.get("roles") if datos else None
            nombre = rol.get(col_nombre) if isinstance(rol, dict) else None
            if nombre:
                return nombre, datos.get(col_rol)
        except Exception:
            continue
    return None, None


def obtener_rol_usuario(cliente, user_id):
    """Nombre del rol del usuario (compatible esquema antiguo y nuevo)."""
    nombre, _ = _obtener_nombre_rol(cliente, user_id)
    return [nombre] if nombre else []


def obtener_plantas_usuario(cliente, user_id):
    """Plantas visibles para la sesión.

    El alcance interno se conserva en ``usuario_plantas``. Para proveedores,
    la planta no es una segunda autorización: se deduce de los muelles que el
    proveedor tiene asignados. Así no hay configuraciones contradictorias.
    """
    nombre_rol, _ = _obtener_nombre_rol(cliente, user_id)
    if not nombre_rol:
        return []
    if nombre_rol in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        try:
            todas = cliente.table("plantas").select("id").execute().data
            return [p["id"] for p in (todas or [])]
        except Exception:
            pass
    proveedor_id = obtener_proveedor_usuario(cliente, user_id)
    if nombre_rol in ("proveedor", "externo"):
        return list(_plantas_de_proveedor(proveedor_id, cliente)) if proveedor_id else []

    # Usuarios internos con alcance limitado.
    try:
        asignadas = (
            cliente.table("usuario_plantas")
            .select("planta_id")
            .eq("usuario_id", user_id)
            .execute()
            .data
        )
        return [a["planta_id"] for a in (asignadas or [])]
    except Exception:
        return []


def obtener_proveedor_usuario(cliente, user_id):
    """Proveedor vinculado al usuario (compatible esquema antiguo supplier_id y nuevo proveedor_id)."""
    for col in ["proveedor_id", "supplier_id"]:
        try:
            datos = (
                cliente.table("usuarios")
                .select(col)
                .eq("id", user_id)
                .single()
                .execute()
                .data
            )
            val = datos.get(col) if datos else None
            if val:
                return val
        except Exception:
            continue
    return None


def _validar_vinculo_proveedor(datos, usuario_id=None):
    """Evita perfiles externos sin proveedor.

    Un usuario proveedor obtiene su alcance de ``proveedor_muelles``; sin el
    vínculo al proveedor no existe una configuración operativa válida.
    """
    actuales = {}
    if usuario_id:
        try:
            actuales = (supabase.table("usuarios").select("rol_id,proveedor_id")
                        .eq("id", usuario_id).single().execute().data or {})
        except Exception:
            return "No se pudo comprobar la configuración actual del usuario."

    rol_id = datos.get("rol_id", actuales.get("rol_id"))
    proveedor_id = datos["proveedor_id"] if "proveedor_id" in datos else actuales.get("proveedor_id")
    if not rol_id:
        return None
    try:
        rol = supabase.table("roles").select("nombre").eq("id", rol_id).single().execute().data
        nombre = str((rol or {}).get("nombre") or "").lower()
    except Exception:
        return "No se pudo comprobar el rol del usuario."
    if _es_rol_externo(nombre) and not proveedor_id:
        return "Un usuario proveedor debe estar vinculado a un proveedor."
    return None


def enriquecer_usuario(cliente, user):
    """Anade roles, permisos y accesos al objeto de usuario."""
    user["roles"] = obtener_rol_usuario(cliente, user["id"])
    user["permisos"] = permisos_de_roles(user["roles"])
    user["plantas"] = obtener_plantas_usuario(cliente, user["id"])
    user["proveedor_id"] = obtener_proveedor_usuario(cliente, user["id"])
    return user


def usuario_actual_es_administrador():
    """Comprueba el rol guardado en la sesión de Flask.

    Los endpoints nuevos no aceptan un rol enviado por el navegador: únicamente
    se usa el perfil creado en el login de Supabase.
    """
    usuario = session.get("user") or {}
    roles = {str(rol).upper() for rol in (usuario.get("roles") or [])}
    if usuario.get("rol"):
        roles.add(str(usuario["rol"]).upper())
    return bool(roles & {"ADMIN", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"})


def usuario_actual_puede_configurar():
    """Indica si la sesión puede gestionar la configuración operativa.

    La configuración de plantas, naves, muelles, horarios, excepciones y
    asignaciones de proveedores es responsabilidad de personal interno. La
    administración de usuarios y roles sigue reservada a administradores.
    """
    usuario = session.get("user") or {}
    roles = {str(rol).upper() for rol in (usuario.get("roles") or [])}
    if usuario.get("rol"):
        roles.add(str(usuario["rol"]).upper())
    return bool(roles & {
        "ADMIN", "INTERNO", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"
    })


def _email_tecnico_operario(numero_operario):
    """Genera una identidad de Auth válida que no depende de un buzón real."""
    identificador = re.sub(r"[^a-z0-9._-]", "-", str(numero_operario).strip().lower())
    if not identificador:
        raise ValueError("El número de operario no es válido.")
    return f"operario.{identificador}@usuarios.docksemesa.invalid"


def _rol_operario_por_defecto():
    """Obtiene un rol operativo seguro, sin inferir privilegios de metadatos."""
    for nombre in ("PLANT_OPERATOR", "interno"):
        try:
            filas = supabase.table("roles").select("id,nombre").eq("nombre", nombre).limit(1).execute().data
            if filas:
                return filas[0]
        except Exception:
            continue
    return None


@app.route("/")
def login_page():
    return render_template("login.html")


@app.route("/registro")
def registro_page():
    return render_template("registro.html")


@app.route("/api/configuracion-publica/auth")
def api_configuracion_publica_auth():
    """Expone únicamente la clave pública necesaria para aceptar invitaciones."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return jsonify({"error": "La aceptación de invitaciones no está configurada."}), 503
    return jsonify({"url": SUPABASE_URL, "anon_key": SUPABASE_ANON_KEY})


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/login", methods=["POST"])
def login():
    datos = request.json or {}
    usuario = (datos.get("email") or datos.get("usuario") or "").strip()
    password = datos.get("password") or ""

    # Correo electrónico -> Supabase Auth. Los operarios siempre acceden por
    # su número y contraseña corporativa; nunca por una dirección de correo.
    if "@" in usuario:
        if not usuario or not password:
            return jsonify({"ok": False, "error": "Usuario y contrasena son obligatorios."}), 400
        return _login_supabase(usuario, password)
    if not usuario:
        return jsonify({"ok": False, "error": "Indica el número de operario."}), 400
    return _login_operario_supabase(usuario, password)


def _construir_nombre_perfil(perfil):
    """Nombre legible de un perfil, compatible esquema nuevo y antiguo.

    Descarta componentes vacíos o nulos (None) para no generar nombres
    con el literal "None" cuando el perfil solo rellena una de las partes.
    """
    if not perfil:
        return None

    def _juntar(campos):
        partes = []
        for campo in campos:
            valor = perfil.get(campo)
            if valor is not None:
                texto = str(valor).strip()
                if texto:
                    partes.append(texto)
        return " ".join(partes)

    if perfil.get("nombre") or perfil.get("apellidos"):
        return _juntar(("nombre", "apellidos"))
    return _juntar(("first_name", "last_name"))


def _login_supabase(email, password):
    try:
        # El acceso con email y contraseña se realiza como cliente público de
        # Supabase Auth. La clave secreta queda reservada para las acciones
        # administrativas del backend (invitaciones, perfiles y borrados).
        cliente_auth = create_client(SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_KEY)
        respuesta = cliente_auth.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        usuario = respuesta.user
        sesion = respuesta.session

        perfil = None
        try:
            perfil = supabase.table("usuarios").select("*").eq("id", usuario.id).single().execute().data
        except Exception:
            perfil = None

        nombre = _construir_nombre_perfil(perfil)

        # Obtener nombre del rol (compatible ambos esquemas)
        rol_nombre = _obtener_nombre_rol(supabase, usuario.id)[0] or "proveedor"

        user = {
            "id": usuario.id,
            "email": usuario.email,
            "nombre": nombre or usuario.email,
            "rol": rol_nombre,
        }

        user = enriquecer_usuario(supabase, user)

        session["access_token"] = sesion.access_token
        session["refresh_token"] = sesion.refresh_token
        session["user"] = user

        return jsonify({"ok": True, "user": user})

    except Exception as exc:
        # No exponer detalles internos al usuario, pero conservarlos en los
        # logs de Render para distinguir Auth de errores de esquema/perfil.
        logger.exception("Fallo durante login Supabase para %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Email o contrasena incorrectos."}), 401


def _buscar_usuario_datalake(operario):
    """Devuelve el id del usuario de la app vinculado al operario del datalake.

    Se intenta por dos vías:
      1. columna ``numero_operario`` de public.usuarios (migración 033);
      2. correo corporativo (``Correo`` en el datalake) -> email en Supabase Auth.
    """
    # 1) Vinculación directa por número de operario
    num_operario = operario.get("num_operario")
    if num_operario:
        try:
            fila = (
                supabase.table("usuarios")
                .select("id")
                .eq("numero_operario", num_operario)
                .execute()
                .data
            )
            if fila:
                return fila[0].get("id")
        except Exception:
            pass

    # 2) Vinculación por correo corporativo
    correo = (operario.get("correo") or "").strip().lower()
    if correo:
        try:
            usuarios_auth = supabase.auth.admin.list_users()
            for usuario_auth in usuarios_auth:
                email_auth = getattr(usuario_auth, "email", None)
                if email_auth and email_auth.lower() == correo:
                    return getattr(usuario_auth, "id", None)
        except Exception:
            pass

    return None


def _verificar_password_operario(almacenada, en_claro):
    """Valida los formatos de hash presentes en el export corporativo."""
    guardada = str(almacenada or "").strip()
    texto = str(en_claro or "").strip()
    if not guardada or not texto:
        return False
    if len(guardada) == 64 and all(c in "0123456789abcdefABCDEF" for c in guardada):
        return hashlib.sha256(texto.encode("utf-8")).hexdigest().lower() == guardada.lower()
    try:
        return check_password_hash(guardada, texto)
    except Exception:
        return False


def _login_operario_supabase(num_operario, password):
    """Autentica con la copia de hashes corporativos almacenada en Supabase."""
    if not supabase:
        return jsonify({"ok": False, "error": "Supabase no está configurado."}), 503

    try:
        datos = (
            supabase.table("operarios_login")
            .select("usuario_id,numero_operario,nombre,password_hash,activo")
            .eq("numero_operario", str(num_operario).strip())
            .single()
            .execute()
            .data
        )
    except Exception as exc:
        logger.exception("Fallo consultando el operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "No se pudo comprobar el acceso del operario."}), 503

    if not datos or not datos.get("activo"):
        return jsonify({"ok": False, "error": "Usuario o contrasena incorrectos."}), 401

    if not str(datos.get("password_hash") or "").strip():
        return jsonify({"ok": False, "password_pending": True,
                        "numero_operario": str(num_operario).strip(),
                        "error": "Este operario todavía no tiene una contraseña configurada."}), 409

    if not _verificar_password_operario(datos.get("password_hash"), password):
        return jsonify({"ok": False, "error": "Usuario o contrasena incorrectos."}), 401

    try:
        usuario_id = str(datos.get("usuario_id") or "").strip()
        perfil = None
        if usuario_id:
            perfiles_por_id = (supabase.table("usuarios").select("*")
                               .eq("id", usuario_id).limit(1).execute().data or [])
            perfil = perfiles_por_id[0] if perfiles_por_id else None
        # Algunas importaciones antiguas dejaron el usuario_id de la tabla de
        # credenciales desalineado. El número de operario es la clave de
        # negocio y permite recuperar el perfil correcto.
        if not perfil:
            perfil_por_numero = (supabase.table("usuarios").select("*")
                                 .eq("numero_operario", str(num_operario).strip())
                                 .limit(1).execute().data or [])
            perfil = perfil_por_numero[0] if perfil_por_numero else None
    except Exception as exc:
        logger.exception("Fallo buscando perfil del operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "No se pudo consultar el perfil del operario."}), 503

    # El estado de acceso del operario lo gobierna operarios_login.activo.
    # usuarios solo contiene el perfil necesario para la aplicación y no
    # debe bloquear el acceso por tener su propio activo desactualizado.
    if perfil:
        user = {
            "id": perfil.get("id") or datos.get("usuario_id"),
            "numero_operario": str(num_operario).strip(),
            "email": perfil.get("email"),
            "nombre": _construir_nombre_perfil(perfil) or datos.get("nombre") or str(num_operario),
            "rol": _obtener_nombre_rol(supabase, perfil.get("id") or datos.get("usuario_id"))[0] or "interno",
            "origen_login": "operarios_supabase",
        }
        user = enriquecer_usuario(supabase, user)
    else:
        # Los operarios pueden autenticarse únicamente contra operarios_login.
        # No se exige una fila equivalente en public.usuarios.
        user = {
            "id": f"operario:{str(num_operario).strip()}",
            "numero_operario": str(num_operario).strip(),
            "email": datos.get("correo"),
            "nombre": datos.get("nombre") or str(num_operario),
            "rol": "interno",
            "roles": ["interno"],
            "permisos": permisos_de_roles(["interno"]),
            "plantas": [],
            "proveedor_id": None,
            "origen_login": "operarios_login",
        }
    session.pop("access_token", None)
    session.pop("refresh_token", None)
    session["user"] = user
    return jsonify({"ok": True, "user": user})


def _login_operario_supabase_auth(num_operario, password):
    """Autentica un operario con Supabase Auth usando su identidad técnica."""
    if not supabase:
        return jsonify({"ok": False, "error": "Supabase no está configurado."}), 503
    try:
        perfil = (
            supabase.table("usuarios")
            .select("id,nombre,apellidos,email,email_tecnico,activo,requiere_cambio_password")
            .eq("numero_operario", str(num_operario).strip())
            .single()
            .execute()
            .data
        )
    except Exception as exc:
        logger.exception("Fallo buscando el operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "Usuario o contraseña incorrectos."}), 401

    if not perfil or perfil.get("activo") is False:
        return jsonify({"ok": False, "error": "Usuario o contraseña incorrectos."}), 401

    email_tecnico = perfil.get("email_tecnico") or perfil.get("email")
    if not email_tecnico:
        return jsonify({"ok": False, "error": "Tu cuenta todavía no está preparada. Contacta con un administrador."}), 403

    try:
        respuesta = create_client(SUPABASE_URL, SUPABASE_KEY).auth.sign_in_with_password({
            "email": email_tecnico,
            "password": password,
        })
        sesion = respuesta.session
        user = {
            "id": respuesta.user.id,
            "email": None,
            "nombre": _construir_nombre_perfil(perfil) or str(num_operario),
            "rol": _obtener_nombre_rol(supabase, respuesta.user.id)[0] or "interno",
            "origen_login": "operario_supabase_auth",
            "requiere_cambio_password": bool(perfil.get("requiere_cambio_password")),
        }
        user = enriquecer_usuario(supabase, user)
        session["access_token"] = sesion.access_token
        session["refresh_token"] = sesion.refresh_token
        session["user"] = user
        return jsonify({"ok": True, "user": user})
    except Exception as exc:
        logger.exception("Fallo de Auth para operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "Usuario o contraseña incorrectos."}), 401


@app.route("/operarios/configurar-contrasena", methods=["POST"])
def configurar_contrasena_operario():
    """Guarda la primera contraseña de un operario pendiente."""
    datos = request.json or {}
    num_operario = str(datos.get("numero_operario") or "").strip()
    password = str(datos.get("password") or "")
    confirmacion = str(datos.get("confirmacion") or "")

    if not num_operario or not password or not confirmacion:
        return jsonify({"ok": False, "error": "Completa y confirma la nueva contraseña."}), 400
    if password != confirmacion:
        return jsonify({"ok": False, "error": "Las contraseñas no coinciden."}), 400
    if not supabase:
        return jsonify({"ok": False, "error": "Supabase no está configurado."}), 503

    try:
        operario = (supabase.table("operarios_login").select("numero_operario,password_hash,activo")
                    .eq("numero_operario", num_operario).single().execute().data)
    except Exception as exc:
        logger.exception("Fallo consultando el operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "No se pudo configurar la contraseña."}), 503

    if not operario or not operario.get("activo"):
        return jsonify({"ok": False, "error": "Operario no disponible."}), 404
    hash_existente = str(operario.get("password_hash") or "").strip()
    if hash_existente:
        # El primer intento puede haber guardado el hash y fallar después al
        # devolver la respuesta. Hacemos la operación idempotente para que el
        # usuario pueda reintentar con la misma contraseña sin recibir un 409.
        if _verificar_password_operario(hash_existente, password):
            return jsonify({"ok": True, "already_configured": True})
        return jsonify({"ok": False, "error": "Este operario ya tiene una contraseña configurada."}), 409

    try:
        resultado = (supabase.table("operarios_login")
                     .update({"password_hash": generate_password_hash(password),
                              "actualizado_en": datetime.now(timezone.utc).isoformat()})
                     # El valor vacío puede llegar como NULL, cadena vacía o
                     # espacios según cómo se importó la fila. Ya hemos
                     # comprobado arriba que no existe un hash usable, por lo
                     # que filtramos por el identificador y verificamos luego
                     # el resultado para no depender de un formato concreto.
                     .eq("numero_operario", num_operario)
                     .select("numero_operario")
                     .execute())
        if not resultado.data:
            comprobacion = (supabase.table("operarios_login")
                            .select("password_hash")
                            .eq("numero_operario", num_operario)
                            .single()
                            .execute()
                            .data)
            if not _verificar_password_operario(comprobacion.get("password_hash"), password):
                return jsonify({"ok": False, "error": "No se pudo guardar la contraseña."}), 503
    except Exception as exc:
        logger.exception("Fallo guardando la contraseña inicial del operario %s: %s", num_operario, exc)
        return jsonify({"ok": False, "error": "No se pudo guardar la contraseña."}), 503

    return jsonify({"ok": True})


def _login_datalake(num_operario, password):
    """Autentica un operario contra el datalake y lo vincula a su perfil de la app."""
    if not DATALAKE_ENABLED:
        return jsonify({"ok": False, "error": "El acceso por operario no está disponible."}), 501

    try:
        import datalake
    except Exception:
        return jsonify({"ok": False, "error": "El acceso por operario no está disponible (falta el conector ODBC)."}), 501

    try:
        operario = datalake.buscar_operario(num_operario, password)
    except Exception:
        return jsonify({"ok": False, "error": "No se pudo conectar con el datalake. Contacta con un administrador."}), 502

    if not operario:
        return jsonify({"ok": False, "error": "Usuario o contrasena incorrectos."}), 401

    user_id = _buscar_usuario_datalake(operario)
    perfil = None
    if user_id:
        try:
            perfil = supabase.table("usuarios").select("*").eq("id", user_id).single().execute().data
        except Exception:
            perfil = None

    if not user_id or not perfil:
        return jsonify({"ok": False, "error": "Tu operario no tiene un perfil en la aplicación. Contacta con un administrador."}), 401

    nombre = _construir_nombre_perfil(perfil) or operario.get("nombre") or num_operario
    rol_nombre = _obtener_nombre_rol(supabase, user_id)[0] or "interno"

    user = {
        "id": user_id,
        "email": perfil.get("email") or None,
        "nombre": nombre,
        "rol": rol_nombre,
        "origen_login": "datalake",
    }
    user = enriquecer_usuario(supabase, user)

    # Sin token de Supabase Auth: el cliente usa service role (respeta la lógica
    # de permisos calculada desde el perfil vinculado).
    session.pop("access_token", None)
    session.pop("refresh_token", None)
    session["user"] = user

    return jsonify({"ok": True, "user": user})


@app.route("/logout", methods=["POST"])
def logout():
    try:
        supabase.auth.sign_out()
    except Exception:
        pass
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    user = session.get("user")
    if not user:
        return jsonify({"ok": False}), 401

    user = enriquecer_usuario(supabase, user)
    session["user"] = user

    return jsonify({"ok": True, "user": user})


@app.route("/api/stats")
def api_stats():
    """Estadisticas del dashboard (usa service role para evitar RLS).

    - admin / interno -> global
    - resto (externo/proveedor) -> solo SUS reservas: "Reservas hoy" y
      "Pendientes" se filtran por usuario_id (0 si no tiene ninguna).
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500

    try:
        user = session.get("user")
        rol = _obtener_nombre_rol(supabase, user["id"])[0] if user else None
        es_admin = rol in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN")

        hoy_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        def contar(tabla, **filtros):
            query = supabase.table(tabla).select("*", count="exact")
            for k, v in filtros.items():
                query = query.eq(k, v)
            return query.execute().count

        # Pendientes / completadas se calculan por fecha+hora (sin aceptacion manual)
        pendientes = 0
        completadas = 0
        reservas_hoy = 0
        try:
            q = supabase.table("reservas").select("id,fecha,hora_inicio,hora_fin,estado")
            if not es_admin and user:
                q = q.eq("usuario_id", user["id"])
            todas = q.neq("estado", "cancelada").execute().data
            for r in (todas or []):
                if _estado_reserva(r) == "completado":
                    completadas += 1
                else:
                    pendientes += 1
        except Exception:
            pass

        try:
            qh = supabase.table("reservas").select("*", count="exact").eq("fecha", hoy_str)
            if not es_admin and user:
                qh = qh.eq("usuario_id", user["id"]).neq("estado", "cancelada")
            reservas_hoy = qh.execute().count
        except Exception:
            reservas_hoy = 0

        stats = {
            "muelles_activos": contar("muelles", activo=True),
            "plantas_activas": contar("plantas", activo=True),
            "proveedores_activos": contar("proveedores", activo=True),
            "reservas_hoy": reservas_hoy,
            "reservas_pendientes": pendientes,
            "reservas_completadas": completadas,
        }
        return jsonify(stats)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/muelles")
def api_muelles():
    """Muelles con sus reservas de hoy (usa service role para evitar RLS)."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500

    try:
        hoy_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        muelles = (supabase.table("v_muelles")
                   .select("*")
                   .order("planta,nave,muelle")
                   .execute().data)

        reservas = (supabase.table("reservas")
                    .select("id,muelle_id,hora_inicio,hora_fin,estado,tipo")
                    .eq("fecha", hoy_str)
                    .order("hora_inicio")
                    .execute().data)

        por_muelle = {}
        for r in (reservas or []):
            r["fecha"] = hoy_str
            r["estado"] = _estado_reserva(r)
            por_muelle.setdefault(r["muelle_id"], []).append(r)

        for m in (muelles or []):
            m["reservas"] = por_muelle.get(m["muelle_id"], [])

        return jsonify({"muelles": muelles})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================================
# RESERVAS - Pagina de reserva de muelles (calendario semanal)
# ==========================================================================

@app.route("/reservas")
def reservas_page():
    return render_template("reservas.html")


@app.route("/calendario")
def calendario_page():
    return render_template("calendario.html")


@app.route("/disponibilidad")
def disponibilidad_page():
    return render_template("disponibilidad.html")


@app.route("/mis-reservas")
def mis_reservas_page():
    return render_template("mis_reservas.html")


@app.route("/excepciones")
def excepciones_page():
    return render_template("excepciones.html")


@app.route("/vista-muelles")
def vista_muelles_page():
    """Plano visual de muelles (Planta > Nave > Muelle)."""
    return render_template("vista_muelles.html")


@app.route("/api/reservas/estructura")
def api_reservas_estructura():
    """Plantas visibles para el usuario autenticado, con sus naves y muelles.

    - admin / interno -> todas las plantas
    - proveedor / externo -> plantas deducidas de sus muelles asignados
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401

    try:
        ids_visibles = set(obtener_plantas_usuario(supabase, user["id"]) or [])
        ids_muelles = _ids_muelles_proveedor(user["id"])
        plantas = supabase.table("plantas").select("id,nombre").order("nombre").execute().data

        resultado = []
        for p in (plantas or []):
            if p["id"] not in ids_visibles:
                continue
            naves = supabase.table("naves").select("id,nombre").eq("planta_id", p["id"]).order("nombre").execute().data
            naves_con_muelles = []
            for n in (naves or []):
                muelles = supabase.table("muelles").select("id,nombre").eq("nave_id", n["id"]).order("nombre").execute().data
                if ids_muelles is not None:
                    muelles = [m for m in (muelles or []) if m["id"] in ids_muelles]
                naves_con_muelles.append({"id": n["id"], "nombre": n["nombre"], "muelles": muelles or []})
            resultado.append({"id": p["id"], "nombre": p["nombre"], "naves": naves_con_muelles})
        return jsonify({"plantas": resultado})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _nombre_usuario_reserva(uid, cache):
    """Devuelve el nombre de un usuario (con cache) soportando ambos esquemas:
    primero el esquema nuevo (nombre, apellidos); si falla o está vacío, el
    esquema antiguo (first_name, last_name)."""
    if uid not in cache:
        nom = ape = None
        try:
            u = supabase.table("usuarios").select("nombre,apellidos").eq("id", uid).single().execute().data
            nom = (u or {}).get("nombre")
            ape = (u or {}).get("apellidos")
        except Exception:
            pass
        if not nom and not ape:
            try:
                u = supabase.table("usuarios").select("first_name,last_name").eq("id", uid).single().execute().data
                nom = (u or {}).get("first_name")
                ape = (u or {}).get("last_name")
            except Exception:
                pass
        cache[uid] = f"{nom or ''} {ape or ''}".strip() or "Usuario"
    return cache[uid]


def _estado_reserva(fila):
    """Estado calculado de una reserva (no hay aceptacion manual):
      - 'cancelada' siempre se mantiene.
      - Si la reserva ya ha terminado (fecha + hora_fin < ahora) -> 'completado'.
      - En cualquier otro caso -> 'pendiente'.
    """
    estado = (fila.get("estado") or "pendiente")
    if estado == "cancelada":
        return "cancelada"
    try:
        fecha = fila.get("fecha") or ""
        hora_fin = (fila.get("hora_fin") or "")[:5]
        if fecha and hora_fin:
            fin = datetime.strptime(f"{fecha} {hora_fin}", "%Y-%m-%d %H:%M")
            if fin < datetime.now():
                return "completado"
    except Exception:
        pass
    return "pendiente"


def _es_conflicto_reserva(exc):
    """Detecta la exclusión PostgreSQL que evita solapes concurrentes.

    La validación previa mejora la experiencia de usuario, pero la restricción
    de base de datos es la que protege cuando dos peticiones llegan a la vez.
    PostgreSQL utiliza SQLSTATE 23P01 para una exclusión incumplida.
    """
    texto = str(exc).lower()
    return "23p01" in texto or "reservas_no_solape" in texto or "exclusion constraint" in texto


def _excepciones_de(muelle_id, fecha):
    """Excepciones activas de un muelle en una fecha. Devuelve [] si la tabla
    aun no existe (migracion 031 pendiente) o ante cualquier error, para no
    romper los calendarios."""
    try:
        data = (supabase.table("excepciones_muelles")
                .select("hora_inicio,hora_fin,motivo")
                .eq("muelle_id", muelle_id)
                .eq("fecha", fecha)
                .eq("activo", True)
                .order("hora_inicio")
                .execute().data)
        return data or []
    except Exception:
        return []


def _restar_excepciones(franjas, excs):
    """Resta los rangos de excepciones (mantenimiento/cierre) de las franjas de
    disponibilidad. Devuelve las franjas efectivas (donde el muelle esta abierto)."""
    if not excs:
        return list(franjas)
    resultado = []
    for f in franjas:
        a, b = f["hora_inicio"], f["hora_fin"]
        # Puntos de corte: inicio, fin y todos los limites de excepciones internos
        puntos = [a, b]
        for e in excs:
            ei, ef = e["hora_inicio"], e["hora_fin"]
            if a < ei < b:
                puntos.append(ei)
            if a < ef < b:
                puntos.append(ef)
        puntos = sorted(set(puntos))
        for i in range(len(puntos) - 1):
            x, y = puntos[i], puntos[i + 1]
            if x >= y:
                continue
            # Si el subintervalo [x,y) esta cubierto por alguna excepcion, se salta
            cubierto = any(e["hora_inicio"] <= x and y <= e["hora_fin"] for e in excs)
            if not cubierto:
                resultado.append({"hora_inicio": x, "hora_fin": y})
    return resultado


def _dia_muelle(muelle_id, fecha, cache):
    """Devuelve la disponibilidad y reservas de un muelle para UN dia."""
    dia_semana = fecha.weekday()  # 0=Lunes
    disp = (supabase.table("disponibilidad_muelles")
            .select("hora_inicio,hora_fin")
            .eq("muelle_id", muelle_id)
            .eq("dia_semana", dia_semana)
            .eq("activo", True)
            .execute().data)
    # Excepciones (mantenimiento/cierre) del muelle ese dia: restan disponibilidad
    excs = _excepciones_de(muelle_id, fecha.isoformat())
    reservas = (supabase.table("reservas")
                .select("id,hora_inicio,hora_fin,estado,tipo,observaciones,usuario_id")
                .eq("muelle_id", muelle_id)
                .eq("fecha", fecha.isoformat())
                .neq("estado", "cancelada")
                .order("hora_inicio")
                .execute().data)
    # Inyectar la fecha para calcular el estado (la consulta no la devuelve)
    for r in (reservas or []):
        r["fecha"] = fecha.isoformat()
    disp_fmt = [{"hora_inicio": d["hora_inicio"][:5], "hora_fin": d["hora_fin"][:5]} for d in (disp or [])]
    excs_fmt = [{"hora_inicio": e["hora_inicio"][:5], "hora_fin": e["hora_fin"][:5], "motivo": e.get("motivo")} for e in (excs or [])]
    return {
        "fecha": fecha.isoformat(),
        "dia_semana": dia_semana,
        "disponibilidad": _restar_excepciones(disp_fmt, excs_fmt),
        "excepciones": excs_fmt,
        "reservas": [{
            "id": r["id"],
            "usuario_id": r["usuario_id"],
            "hora_inicio": r["hora_inicio"][:5],
            "hora_fin": r["hora_fin"][:5],
            "estado": _estado_reserva(r),
            "tipo": r["tipo"],
            "observaciones": r.get("observaciones"),
            "usuario_nombre": _nombre_usuario_reserva(r["usuario_id"], cache),
        } for r in (reservas or [])],
    }


def _semana_muelle(muelle_id, inicio, cache):
    """Devuelve la semana (7 dias) de disponibilidad y reservas de un muelle."""
    return [_dia_muelle(muelle_id, inicio + timedelta(days=i), cache) for i in range(7)]


def _muelles_de_planta(planta_id, nave_id=None, muelle_id=None, ids_permitidos=None):
    """Lista de muelles (con nave) de una planta, de una nave o de un muelle concreto.
    Si `ids_permitidos` no es None, solo se incluyen los muelles de ese conjunto."""
    try:
        p = supabase.table("plantas").select("nombre").eq("id", planta_id).single().execute().data
        planta_nombre = p.get("nombre") if p else None
    except Exception:
        planta_nombre = None
    naves_query = supabase.table("naves").select("id,nombre").eq("planta_id", planta_id).order("nombre")
    if nave_id:
        naves_query = naves_query.eq("id", nave_id)
    naves = naves_query.execute().data or []
    muelles = []
    for n in naves:
        ms_query = supabase.table("muelles").select("id,nombre").eq("nave_id", n["id"]).order("nombre")
        if muelle_id:
            ms_query = ms_query.eq("id", muelle_id)
        ms = ms_query.execute().data or []
        for m in ms:
            if ids_permitidos is not None and m["id"] not in ids_permitidos:
                continue
            muelles.append({"id": m["id"], "nombre": m["nombre"], "nave_id": n["id"], "nave": n["nombre"], "planta": planta_nombre})
    return muelles


def _verificar_acceso_planta(user_id, planta_id):
    """Devuelve True si el usuario (no admin) tiene acceso a la planta."""
    rol = _obtener_nombre_rol(supabase, user_id)[0]
    if rol in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        return True
    ids_visibles = set(obtener_plantas_usuario(supabase, user_id) or [])
    return bool(ids_visibles) and planta_id in ids_visibles


def _ids_muelles_proveedor(user_id, cliente=None):
    """Conjunto de muelles asignados al proveedor del usuario (proveedor_muelles).

    Devuelve ``None`` únicamente cuando el rol no está restringido
    (administración/personal interno). Para un proveedor la ausencia de
    asignaciones es un conjunto vacío: sin una configuración explícita no puede
    consultar ni reservar ningún muelle.
    """
    cli = cliente or supabase
    rol = _obtener_nombre_rol(cli, user_id)[0]
    if rol in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        return None
    prov = obtener_proveedor_usuario(cli, user_id)
    if not prov:
        return set()
    try:
        rows = cli.table("proveedor_muelles").select("muelle_id").eq("proveedor_id", prov).execute().data
    except Exception:
        # Error de configuración/consulta: nunca ampliar el acceso de un
        # proveedor por no poder comprobar sus asignaciones.
        return set()
    return {r["muelle_id"] for r in rows}


def _plantas_de_proveedor(proveedor_id, cliente=None):
    """Plantas que se derivan de los muelles asignados a un proveedor.

    ``proveedor_muelles`` es la única fuente de autorización externa; una
    planta aparece porque contiene al menos uno de esos muelles.
    """
    cli = cliente or supabase
    try:
        asignaciones = (cli.table("proveedor_muelles").select("muelle_id")
                        .eq("proveedor_id", proveedor_id).execute().data or [])
        muelle_ids = [a["muelle_id"] for a in asignaciones if a.get("muelle_id")]
        if not muelle_ids:
            return set()
        muelles = (cli.table("muelles").select("nave_id").in_("id", muelle_ids)
                   .execute().data or [])
        nave_ids = [m["nave_id"] for m in muelles if m.get("nave_id")]
        if not nave_ids:
            return set()
        naves = (cli.table("naves").select("planta_id").in_("id", nave_ids)
                 .execute().data or [])
        return {n["planta_id"] for n in naves if n.get("planta_id")}
    except Exception:
        return set()


def _validar_proveedor_muelle(body):
    """Valida que la asignación referencia un proveedor y un muelle reales.

    La relación no depende de ``usuario_plantas``: asignar el muelle ya otorga
    acceso a su planta al proveedor.
    """
    proveedor_id = body.get("proveedor_id")
    muelle_id = body.get("muelle_id")
    if not proveedor_id or not muelle_id:
        return None, None
    planta_muelle = _planta_de_muelle(muelle_id)
    if not planta_muelle:
        return ("El muelle indicado no existe o no tiene una planta válida.", 400)
    return None, None


def _planta_de_muelle(muelle_id):
    """Planta a la que pertenece un muelle (via nave)."""
    try:
        m = supabase.table("muelles").select("nave_id").eq("id", muelle_id).single().execute().data
        if not m:
            return None
        n = supabase.table("naves").select("planta_id").eq("id", m["nave_id"]).single().execute().data
        return n["planta_id"] if n else None
    except Exception:
        return None


def _validar_muelle_permitido(user_id, muelle_id):
    """None si el usuario puede usar el muelle; si no, mensaje de error."""
    ids = _ids_muelles_proveedor(user_id)
    if ids is not None and muelle_id not in ids:
        return "No puedes reservar en ese muelle."
    return None


def _validar_reserva(user_id, muelle_id, fecha, hora_inicio, hora_fin, excluir_id=None):
    """Valida que el hueco sea reservable para el usuario.

    Devuelve (None, None) si es valido; si no (codigo, mensaje).
    Codigos: 'no_permitido'/'no_planta' -> 403, 'cerrado'/'ocupado' -> 409.
    """
    # Muelle permitido para el proveedor
    err = _validar_muelle_permitido(user_id, muelle_id)
    if err:
        return ("no_permitido", err)
    # Acceso a la planta del muelle
    planta = _planta_de_muelle(muelle_id)
    if planta and not _verificar_acceso_planta(user_id, planta):
        return ("no_planta", "No puedes reservar en esa planta.")
    # Excepcion de horario (mantenimiento/cierre)
    excs = _excepciones_de(muelle_id, fecha)
    for e in excs:
        ei, ef = e["hora_inicio"][:5], e["hora_fin"][:5]
        if not (hora_fin <= ei or hora_inicio >= ef):
            motivo = e.get("motivo") or "mantenimiento"
            return ("cerrado", f"El muelle esta cerrado en ese horario ({motivo}).")

    # Disponibilidad: el hueco debe estar dentro del horario abierto del muelle
    try:
        fecha_dt = datetime.strptime(fecha, "%Y-%m-%d").date()
        dia_semana = fecha_dt.weekday()
        disp = (supabase.table("disponibilidad_muelles")
                .select("hora_inicio,hora_fin")
                .eq("muelle_id", muelle_id)
                .eq("dia_semana", dia_semana)
                .eq("activo", True)
                .execute().data)
        franjas_efectivas = _restar_excepciones(
            [{"hora_inicio": d["hora_inicio"][:5], "hora_fin": d["hora_fin"][:5]} for d in (disp or [])],
            excs)
        cubierto = any(hora_inicio >= f["hora_inicio"] and hora_fin <= f["hora_fin"] for f in franjas_efectivas)
        if not cubierto:
            return ("cerrado", "El muelle no esta abierto en ese horario.")
    except Exception:
        pass

    # Solapamiento con otras reservas (no canceladas)
    existentes = (supabase.table("reservas")
                  .select("id,hora_inicio,hora_fin")
                  .eq("muelle_id", muelle_id)
                  .eq("fecha", fecha)
                  .neq("estado", "cancelada")
                  .execute().data)
    for e in (existentes or []):
        if excluir_id and e["id"] == excluir_id:
            continue
        # Normalizar a HH:MM (la BD devuelve HH:MM:SS) para comparar bien
        ei = e["hora_inicio"][:5]
        ef = e["hora_fin"][:5]
        if not (hora_fin <= ei or hora_inicio >= ef):
            return ("ocupado", "Ese horario ya esta reservado en el muelle.")
    return (None, None)


def _info_muelle(muelle_id):
    """Info de un muelle con su nave y planta (para listados)."""
    try:
        m = supabase.table("muelles").select("id,nombre,nave_id").eq("id", muelle_id).single().execute().data
        if not m:
            return None
        n = supabase.table("naves").select("nombre,planta_id").eq("id", m["nave_id"]).single().execute().data
        planta = None
        if n:
            p = supabase.table("plantas").select("nombre").eq("id", n["planta_id"]).single().execute().data
            planta = p["nombre"] if p else None
        return {
            "id": m["id"],
            "nombre": m["nombre"],
            "nave": n["nombre"] if n else None,
            "planta": planta,
        }
    except Exception:
        return None


@app.route("/api/reservas/semana")
def api_reservas_semana():
    """Disponibilidad y reservas de un muelle para una semana.

    Parametros: muelle_id, inicio (YYYY-MM-DD, lunes de la semana)
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    muelle_id = request.args.get("muelle_id")
    inicio_str = request.args.get("inicio")
    if not muelle_id or not inicio_str:
        return jsonify({"error": "Faltan parametros"}), 400
    try:
        inicio = datetime.strptime(inicio_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({"error": "Fecha invalida"}), 400

    try:
        muelle = supabase.table("muelles").select("id,nombre").eq("id", muelle_id).single().execute().data
        cache = {}
        dias = _semana_muelle(muelle_id, inicio, cache)
        return jsonify({"muelle": muelle or {"id": muelle_id}, "dias": dias})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/semana-plantas")
def api_reservas_semana_plantas():
    """Disponibilidad y reservas de TODOS los muelles de una planta (o nave)
    para una semana. Permite ver la misma hora ocupada/libre en varios muelles.

    Parametros: planta_id, inicio, opcional nave_id
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    planta_id = request.args.get("planta_id")
    inicio_str = request.args.get("inicio")
    nave_id = request.args.get("nave_id") or None
    if not planta_id or not inicio_str:
        return jsonify({"error": "Faltan parametros"}), 400
    try:
        inicio = datetime.strptime(inicio_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({"error": "Fecha invalida"}), 400

    try:
        # Restriccion por planta asignada
        if not _verificar_acceso_planta(user["id"], planta_id):
            return jsonify({"error": "No tienes acceso a esa planta."}), 403

        # Restriccion por proveedor (solo los muelles que tiene asignados)
        ids_permitidos = _ids_muelles_proveedor(user["id"])

        # Muelles de cada nave
        cache = {}
        muelles = []
        for m in _muelles_de_planta(planta_id, nave_id, ids_permitidos=ids_permitidos):
            muelles.append({**m, "dias": _semana_muelle(m["id"], inicio, cache)})

        return jsonify({"muelles": muelles})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/dia-plantas")
def api_reservas_dia_plantas():
    """Disponibilidad y reservas de los muelles de una planta (o nave/muelle
    concreto) para UN dia. Vista diaria del calendario.

    Parametros: planta_id, fecha (YYYY-MM-DD), opcional nave_id, muelle_id
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    planta_id = request.args.get("planta_id")
    fecha_str = request.args.get("fecha")
    nave_id = request.args.get("nave_id") or None
    muelle_id = request.args.get("muelle_id") or None
    if not planta_id or not fecha_str:
        return jsonify({"error": "Faltan parametros"}), 400
    try:
        fecha = datetime.strptime(fecha_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({"error": "Fecha invalida"}), 400

    try:
        # Restriccion por planta asignada
        if not _verificar_acceso_planta(user["id"], planta_id):
            return jsonify({"error": "No tienes acceso a esa planta."}), 403

        # Restriccion por proveedor (solo los muelles que tiene asignados)
        ids_permitidos = _ids_muelles_proveedor(user["id"])

        cache = {}
        muelles = []
        for m in _muelles_de_planta(planta_id, nave_id, muelle_id, ids_permitidos=ids_permitidos):
            muelles.append({**m, "dia": _dia_muelle(m["id"], fecha, cache)})

        return jsonify({"muelles": muelles})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/usuario-info/<uid>")
def api_reservas_usuario_info(uid):
    """Informacion completa de un usuario (para el informe de la reserva).

    Solo admin. Devuelve datos del perfil + email de auth + proveedor,
    departamento y plantas asignadas.
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    try:
        rol = _obtener_nombre_rol(supabase, user["id"])[0]
        if rol != "admin":
            return jsonify({"error": "No autorizado"}), 403

        perfil = None
        try:
            perfil = supabase.table("usuarios").select("*").eq("id", uid).single().execute().data
        except Exception:
            perfil = None

        email = None
        try:
            res = supabase.auth.admin.list_users()
            for u in (res or []):
                if u.id == uid:
                    email = u.email
                    break
        except Exception:
            pass

        rol_nombre = _obtener_nombre_rol(supabase, uid)[0] or None

        proveedor_nombre = None
        if perfil and perfil.get("proveedor_id"):
            try:
                prov = supabase.table("proveedores").select("nombre,email_contacto").eq("id", perfil["proveedor_id"]).single().execute().data
                proveedor_nombre = prov.get("nombre") if prov else None
            except Exception:
                pass

        departamento_nombre = None
        if perfil and perfil.get("departamento_id"):
            try:
                dep = supabase.table("departamentos").select("nombre").eq("id", perfil["departamento_id"]).single().execute().data
                departamento_nombre = dep.get("nombre") if dep else None
            except Exception:
                pass

        plantas = []
        try:
            ups = supabase.table("usuario_plantas").select("planta_id, plantas(nombre)").eq("usuario_id", uid).execute().data
            for up in (ups or []):
                pl = up.get("plantas")
                nombre = pl.get("nombre") if isinstance(pl, dict) else None
                if nombre:
                    plantas.append(nombre)
        except Exception:
            pass

        return jsonify({
            "id": uid,
            "email": email,
            "nombre": (perfil or {}).get("nombre"),
            "apellidos": (perfil or {}).get("apellidos"),
            "rol": rol_nombre,
            "proveedor": proveedor_nombre,
            "departamento": departamento_nombre,
            "activo": (perfil or {}).get("activo", True),
            "plantas": plantas,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas", methods=["POST"])
def api_reservas_crear():
    """Crea una reserva para el usuario autenticado (estado 'pendiente')."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401

    body = request.json or {}
    muelle_id = body.get("muelle_id")
    fecha = body.get("fecha")
    hora_inicio = body.get("hora_inicio")
    hora_fin = body.get("hora_fin")
    if not muelle_id or not fecha or not hora_inicio or not hora_fin:
        return jsonify({"error": "Faltan datos: muelle, fecha, hora inicio y hora fin."}), 400

    try:
        cod, msg = _validar_reserva(user["id"], muelle_id, fecha, hora_inicio, hora_fin)
        if cod:
            status = 409 if cod in ("cerrado", "ocupado") else 403
            return jsonify({"error": msg}), status

        data = supabase.table("reservas").insert({
            "muelle_id": muelle_id,
            "usuario_id": user["id"],
            "fecha": fecha,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            "tipo": body.get("tipo") or "descarga",
            "estado": "pendiente",
            "observaciones": body.get("observaciones"),
        }).execute()
        return jsonify({"ok": True, "reserva": (data.data or [{}])[0]}), 201
    except Exception as e:
        if _es_conflicto_reserva(e):
            return jsonify({"error": "Ese muelle acaba de ocuparse en la franja seleccionada. Elige otro horario."}), 409
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/<rid>/cancelar", methods=["POST"])
def api_reservas_cancelar(rid):
    """Cancela una reserva propia (o de cualquier usuario si eres admin).

    Solo se pueden cancelar reservas futuras/no completadas.
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401

    try:
        res = supabase.table("reservas").select("*").eq("id", rid).single().execute().data
        if not res:
            return jsonify({"error": "Reserva no encontrada."}), 404

        rol = _obtener_nombre_rol(supabase, user["id"])[0]
        if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN") and res["usuario_id"] != user["id"]:
            return jsonify({"error": "No puedes cancelar una reserva de otro usuario."}), 403

        if _estado_reserva(res) == "completado":
            return jsonify({"error": "No puedes cancelar una reserva que ya ha finalizado."}), 400

        supabase.table("reservas").update({"estado": "cancelada"}).eq("id", rid).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/<rid>", methods=["PUT"])
def api_reservas_modificar(rid):
    """Modifica una reserva propia (o cualquiera si eres admin).

    Permite cambiar muelle, fecha, hora y tipo/observaciones. El nuevo hueco
    debe estar libre (y dentro de los muelles permitidos del proveedor).
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401

    body = request.json or {}
    muelle_id = body.get("muelle_id")
    fecha = body.get("fecha")
    hora_inicio = body.get("hora_inicio")
    hora_fin = body.get("hora_fin")
    if not muelle_id or not fecha or not hora_inicio or not hora_fin:
        return jsonify({"error": "Faltan datos: muelle, fecha, hora inicio y hora fin."}), 400

    try:
        res = supabase.table("reservas").select("*").eq("id", rid).single().execute().data
        if not res:
            return jsonify({"error": "Reserva no encontrada."}), 404

        rol = _obtener_nombre_rol(supabase, user["id"])[0]
        if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN") and res["usuario_id"] != user["id"]:
            return jsonify({"error": "No puedes modificar una reserva de otro usuario."}), 403

        if _estado_reserva(res) == "completado":
            return jsonify({"error": "No puedes modificar una reserva que ya ha finalizado."}), 400

        # No se puede mover a un horario ya pasado
        try:
            nuevo_fin = datetime.strptime(f"{fecha} {hora_fin}", "%Y-%m-%d %H:%M")
            if nuevo_fin < datetime.now():
                return jsonify({"error": "No puedes mover la reserva a un horario ya pasado."}), 400
        except Exception:
            pass

        # El nuevo hueco debe ser valido (excluyendo esta misma reserva)
        cod, msg = _validar_reserva(user["id"], muelle_id, fecha, hora_inicio, hora_fin, excluir_id=rid)
        if cod:
            status = 409 if cod in ("cerrado", "ocupado") else 403
            return jsonify({"error": msg}), status

        supabase.table("reservas").update({
            "muelle_id": muelle_id,
            "fecha": fecha,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            "tipo": body.get("tipo") or res.get("tipo") or "descarga",
            "observaciones": body.get("observaciones"),
        }).eq("id", rid).execute()
        return jsonify({"ok": True})
    except Exception as e:
        if _es_conflicto_reserva(e):
            return jsonify({"error": "Ese muelle acaba de ocuparse en la franja seleccionada. Elige otro horario."}), 409
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/mias")
def api_reservas_mias():
    """Reservas del usuario autenticado (no canceladas), ordenadas por fecha
    y hora, con muelle/nave/planta resueltos. Acepta '?fecha=YYYY-MM-DD' para
    filtrar las reservas de un dia concreto (vista listado de Mis Reservas)."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    try:
        fecha = request.args.get("fecha")
        q = (supabase.table("reservas")
             .select("id,muelle_id,fecha,hora_inicio,hora_fin,tipo,estado,observaciones,usuario_id")
             .eq("usuario_id", user["id"])
             .neq("estado", "cancelada"))
        if fecha:
            q = q.eq("fecha", fecha)
        reservas = q.order("fecha").order("hora_inicio").execute().data
        resultado = []
        for r in (reservas or []):
            info = _info_muelle(r["muelle_id"]) or {}
            resultado.append({
                "id": r["id"],
                "muelle_id": r["muelle_id"],
                "muelle": info.get("nombre") or r["muelle_id"],
                "nave": info.get("nave"),
                "planta": info.get("planta"),
                "fecha": r["fecha"],
                "hora_inicio": r["hora_inicio"][:5],
                "hora_fin": r["hora_fin"][:5],
                "tipo": r["tipo"],
                "estado": _estado_reserva(r),
                "observaciones": r.get("observaciones"),
            })
        return jsonify({"reservas": resultado})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reservas/todas")
def api_reservas_todas():
    """Todas las reservas (no canceladas) con muelle/nave/planta y usuario
    resueltos, ordenadas por fecha y hora. Solo admin/interno (listado del
    calendario)."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    try:
        rol = _obtener_nombre_rol(supabase, user["id"])[0]
        if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
            return jsonify({"error": "No autorizado"}), 403

        reservas = (supabase.table("reservas")
                    .select("id,muelle_id,fecha,hora_inicio,hora_fin,tipo,estado,observaciones,usuario_id")
                    .neq("estado", "cancelada")
                    .order("fecha")
                    .order("hora_inicio")
                    .execute().data)

        # Proveedor de cada usuario (para mostrar el proveedor de usuarios externos)
        proveedor_por_usuario = {}
        try:
            usuarios = (supabase.table("usuarios")
                        .select("id, proveedor_id, proveedores(nombre)")
                        .execute().data)
            for u in (usuarios or []):
                if u.get("proveedor_id"):
                    p = u.get("proveedores")
                    if isinstance(p, dict) and p.get("nombre"):
                        proveedor_por_usuario[u["id"]] = p["nombre"]
        except Exception:
            proveedor_por_usuario = {}

        cache = {}
        resultado = []
        for r in (reservas or []):
            info = _info_muelle(r["muelle_id"]) or {}
            resultado.append({
                "id": r["id"],
                "muelle_id": r["muelle_id"],
                "muelle": info.get("nombre") or r["muelle_id"],
                "nave": info.get("nave"),
                "planta": info.get("planta"),
                "fecha": r["fecha"],
                "hora_inicio": r["hora_inicio"][:5],
                "hora_fin": r["hora_fin"][:5],
                "tipo": r["tipo"],
                "estado": _estado_reserva(r),
                "observaciones": r.get("observaciones"),
                "usuario_id": r["usuario_id"],
                "usuario_nombre": _nombre_usuario_reserva(r["usuario_id"], cache),
                "usuario_proveedor": proveedor_por_usuario.get(r["usuario_id"]),
            })
        return jsonify({"reservas": resultado})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/proveedor-muelles/plantas")
def api_proveedor_muelles_plantas():
    """Plantas derivadas de los muelles configurados para un proveedor."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    if not usuario_actual_puede_configurar():
        return jsonify({"error": "No autorizado"}), 403
    proveedor_id = request.args.get("proveedor_id")
    if not proveedor_id:
        return jsonify({"error": "Falta proveedor_id"}), 400
    resultado = []
    for pid in _plantas_de_proveedor(proveedor_id):
        try:
            p = supabase.table("plantas").select("id,nombre").eq("id", pid).single().execute().data
        except Exception:
            p = None
        if p:
            resultado.append(p)
    return jsonify({"plantas": resultado})


@app.route("/api/disponibilidad-muelles/configurar", methods=["POST"])
def api_disponibilidad_muelles_configurar():
    """Configura disponibilidad periódica en lote, evitando solapes.

    ``agregar`` permite varias franjas en un mismo muelle/día; ``reemplazar``
    sustituye todas las franjas de los muelles y días indicados; ``limpiar``
    deja esos días sin disponibilidad periódica. Las excepciones por fecha se
    gestionan por separado y no se modifican aquí.
    """
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_puede_configurar():
        return jsonify({"error": "No tienes permisos para gestionar la configuración."}), 403

    body = request.json or {}
    muelle_ids = list(dict.fromkeys(body.get("muelle_ids") or []))
    try:
        dias = sorted({int(dia) for dia in (body.get("dias") or [])})
    except (TypeError, ValueError):
        return jsonify({"error": "Los días indicados no son válidos."}), 400
    modo = body.get("modo") or "agregar"
    if not muelle_ids or not dias:
        return jsonify({"error": "Selecciona al menos un muelle y un día."}), 400
    if any(dia < 0 or dia > 6 for dia in dias):
        return jsonify({"error": "Los días deben estar entre lunes (0) y domingo (6)."}), 400
    if modo not in {"agregar", "reemplazar", "limpiar", "editar"}:
        return jsonify({"error": "El modo de configuración no es válido."}), 400

    hora_inicio = str(body.get("hora_inicio") or "")[:5]
    hora_fin = str(body.get("hora_fin") or "")[:5]
    if modo != "limpiar":
        try:
            inicio = datetime.strptime(hora_inicio, "%H:%M").time()
            fin = datetime.strptime(hora_fin, "%H:%M").time()
        except ValueError:
            return jsonify({"error": "Indica una hora de inicio y fin válidas."}), 400
        if inicio >= fin:
            return jsonify({"error": "La hora de fin debe ser posterior a la hora de inicio."}), 400

    try:
        muelles = (supabase.table("muelles").select("id,activo").in_("id", muelle_ids)
                   .execute().data or [])
        if len({m["id"] for m in muelles}) != len(muelle_ids):
            return jsonify({"error": "Uno o más muelles no existen."}), 400
        if any(m.get("activo") is False for m in muelles):
            return jsonify({"error": "No se puede configurar disponibilidad en un muelle inactivo."}), 400

        eliminar_ids = {str(valor) for valor in (body.get("eliminar_ids") or [])}
        # Antes de borrar, comprobar que una nueva franja no solapa otra que
        # vaya a permanecer activa. Permite editar una franja existente.
        if modo in {"agregar", "editar"}:
            for muelle_id in muelle_ids:
                for dia in dias:
                    existentes = (supabase.table("disponibilidad_muelles")
                                  .select("id,hora_inicio,hora_fin")
                                  .eq("muelle_id", muelle_id).eq("dia_semana", dia)
                                  .eq("activo", True).execute().data or [])
                    for existente in existentes:
                        if str(existente["id"]) in eliminar_ids:
                            continue
                        desde = str(existente["hora_inicio"])[:5]
                        hasta = str(existente["hora_fin"])[:5]
                        if not (hora_fin <= desde or hora_inicio >= hasta):
                            return jsonify({
                                "error": "La franja se solapa con una disponibilidad existente. Añade una franja que no se cruce o usa Reemplazar horario."
                            }), 409

        if modo == "editar":
            for registro_id in eliminar_ids:
                supabase.table("disponibilidad_muelles").delete().eq("id", registro_id).execute()
        elif modo in {"reemplazar", "limpiar"}:
            for muelle_id in muelle_ids:
                for dia in dias:
                    supabase.table("disponibilidad_muelles").delete().eq("muelle_id", muelle_id).eq("dia_semana", dia).execute()

        if modo == "limpiar":
            return jsonify({"ok": True, "creados": 0, "limpiados": len(muelle_ids) * len(dias)})

        activo = bool(body.get("activo", True))
        nuevos = [
            {
                "muelle_id": muelle_id,
                "dia_semana": dia,
                "hora_inicio": hora_inicio,
                "hora_fin": hora_fin,
                "activo": activo,
            }
            for muelle_id in muelle_ids for dia in dias
        ]
        creados = supabase.table("disponibilidad_muelles").insert(nuevos).execute().data or []
        return jsonify({"ok": True, "creados": len(creados), "limpiados": 0})
    except Exception as exc:
        logger.exception("No se pudo configurar disponibilidad: %s", exc)
        return jsonify({"error": "No se pudo guardar la disponibilidad."}), 500


# ==========================================================================
# EXCEPCIONES DE HORARIO (mantenimiento / cierre de muelles)
# ==========================================================================

@app.route("/api/excepciones", methods=["GET", "POST"])
def api_excepciones_lista():
    """Lista y crea excepciones de horario. Solo admin/interno."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    rol = _obtener_nombre_rol(supabase, user["id"])[0]
    if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        return jsonify({"error": "No autorizado"}), 403

    if request.method == "GET":
        try:
            data = (supabase.table("excepciones_muelles")
                    .select("*")
                    .order("fecha")
                    .order("hora_inicio")
                    .execute().data)
            resultado = []
            for e in (data or []):
                info = _info_muelle(e["muelle_id"]) or {"id": e["muelle_id"], "nombre": e["muelle_id"]}
                resultado.append({**e, "muelle_nombre": info["nombre"], "nave": info.get("nave"), "planta": info.get("planta")})
            return jsonify({"excepciones": resultado})
        except Exception as ex:
            return jsonify({"error": str(ex)}), 500

    # POST
    body = request.json or {}
    muelle_id = body.get("muelle_id")
    fecha = body.get("fecha")
    hora_inicio = body.get("hora_inicio")
    hora_fin = body.get("hora_fin")
    if not muelle_id or not fecha or not hora_inicio or not hora_fin:
        return jsonify({"error": "Faltan datos: muelle, fecha, hora inicio y hora fin."}), 400
    try:
        data = supabase.table("excepciones_muelles").insert({
            "muelle_id": muelle_id,
            "fecha": fecha,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            "motivo": body.get("motivo") or "mantenimiento",
            "activo": True,
        }).execute()
        return jsonify({"ok": True, "excepcion": (data.data or [{}])[0]}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/excepciones/<eid>", methods=["PUT", "DELETE"])
def api_excepciones_item(eid):
    """Modifica o elimina una excepcion de horario. Solo admin/interno."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    rol = _obtener_nombre_rol(supabase, user["id"])[0]
    if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        return jsonify({"error": "No autorizado"}), 403

    try:
        if request.method == "DELETE":
            supabase.table("excepciones_muelles").delete().eq("id", eid).execute()
            return jsonify({"ok": True})

        body = request.json or {}
        campos = {}
        for k in ("muelle_id", "fecha", "hora_inicio", "hora_fin", "motivo", "activo"):
            if k in body:
                campos[k] = body[k]
        if not campos:
            return jsonify({"error": "Sin datos para actualizar."}), 400
        supabase.table("excepciones_muelles").update(campos).eq("id", eid).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================================
# CONFIGURACION - CRUD generico
# ==========================================================================

CRUD_TABLAS = {
    # Jerarquia: plantas -> naves -> muelles
    "plantas", "naves", "muelles",
    # Disponibilidad, proveedores, departamentos
    "disponibilidad_muelles", "proveedores", "proveedor_muelles", "departamentos",
    # Roles y usuarios
    "roles", "usuarios", "usuario_plantas",
    # Reservas
    "reservas",
    # Excepciones de horario (mantenimiento / cierres)
    "excepciones_muelles",
    # Vista de solo lectura
    "v_muelles",
}

CRUD_CLAVES = {}

CRUD_SOLO_LECTURA = {
    "v_muelles",
}


@app.route("/configuracion")
def configuracion():
    return render_template("configuracion.html")


@app.route("/modulo")
def modulo():
    return render_template("modulo.html")


@app.route("/api/proveedor-muelles/asignar", methods=["POST"])
def api_proveedor_muelles_asignar():
    """Asigna varios muelles a un proveedor sin duplicar relaciones existentes."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_puede_configurar():
        return jsonify({"error": "No tienes permisos para gestionar la configuración."}), 403

    body = request.json or {}
    proveedor_id = body.get("proveedor_id")
    muelle_ids = list(dict.fromkeys(body.get("muelle_ids") or []))
    if not proveedor_id:
        return jsonify({"error": "Debes indicar un proveedor."}), 400
    if not muelle_ids:
        return jsonify({"error": "Selecciona al menos un muelle."}), 400

    try:
        proveedor = (supabase.table("proveedores").select("id").eq("id", proveedor_id)
                     .single().execute().data)
        if not proveedor:
            return jsonify({"error": "El proveedor indicado no existe."}), 400

        existentes = (supabase.table("proveedor_muelles").select("muelle_id")
                      .eq("proveedor_id", proveedor_id).execute().data or [])
        ids_existentes = {fila["muelle_id"] for fila in existentes}
        nuevos = []
        for muelle_id in muelle_ids:
            err, status = _validar_proveedor_muelle({
                "proveedor_id": proveedor_id,
                "muelle_id": muelle_id,
            })
            if err:
                return jsonify({"error": err}), status
            if muelle_id not in ids_existentes:
                nuevos.append({"proveedor_id": proveedor_id, "muelle_id": muelle_id})

        creados = supabase.table("proveedor_muelles").insert(nuevos).execute().data if nuevos else []
        return jsonify({
            "ok": True,
            "asignados": len(creados or []),
            "ya_asignados": len(muelle_ids) - len(nuevos),
        }), 201
    except Exception as exc:
        logger.exception("No se pudieron asignar muelles al proveedor %s: %s", proveedor_id, exc)
        return jsonify({"error": "No se pudieron asignar los muelles seleccionados."}), 500


@app.route("/api/crud/<tabla>", methods=["GET", "POST", "PUT", "DELETE"])
def api_crud_lista(tabla):
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if tabla not in CRUD_TABLAS:
        return jsonify({"error": "Tabla no permitida"}), 403
    if not usuario_actual_puede_configurar():
        return jsonify({"error": "No tienes permisos para gestionar la configuración."}), 403
    if tabla in {"roles", "usuarios", "usuario_plantas"} and not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para gestionar usuarios o roles."}), 403

    try:
        if request.method == "GET":
            query = supabase.table(tabla).select("*")
            orden = request.args.get("order")
            limite = request.args.get("limit")
            if orden:
                query = query.order(orden)
            if limite:
                query = query.limit(int(limite))
            data = query.execute().data
            return jsonify({"datos": data})

        if request.method in ("PUT", "DELETE"):
            claves = CRUD_CLAVES.get(tabla)
            if not claves:
                return jsonify({"error": "Usa /api/crud/<tabla>/<id>"}), 400
            if tabla in CRUD_SOLO_LECTURA:
                return jsonify({"error": "Modulo de solo lectura"}), 403

            filtros = {}
            for col in claves:
                valor = request.args.get(col)
                if not valor:
                    return jsonify({"error": f"Falta la clave {col}"}), 400
                filtros[col] = valor

            if request.method == "PUT":
                query = supabase.table(tabla).update(request.json or {})
            else:
                query = supabase.table(tabla).delete()

            for col, valor in filtros.items():
                query = query.eq(col, valor)

            if request.method == "PUT":
                data = query.execute().data
                return jsonify({"ok": True, "registro": (data or [{}])[0]})

            query.execute()
            return jsonify({"ok": True})

        if tabla in CRUD_SOLO_LECTURA:
            return jsonify({"error": "Modulo de solo lectura"}), 403
        body = request.json or {}
        # Consistencia: el muelle de un proveedor debe estar en una planta de sus usuarios
        if tabla == "proveedor_muelles":
            err, status = _validar_proveedor_muelle(body)
            if err:
                return jsonify({"error": err}), status
        data = supabase.table(tabla).insert(body).execute().data
        return jsonify({"ok": True, "registro": (data or [{}])[0]}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/crud/<tabla>/<id>", methods=["PUT", "DELETE"])
def api_crud_registro(tabla, id):
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if tabla not in CRUD_TABLAS:
        return jsonify({"error": "Tabla no permitida"}), 403
    if tabla in CRUD_SOLO_LECTURA:
        return jsonify({"error": "Modulo de solo lectura"}), 403
    if not usuario_actual_puede_configurar():
        return jsonify({"error": "No tienes permisos para gestionar la configuración."}), 403
    if tabla in {"roles", "usuarios", "usuario_plantas"} and not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para gestionar usuarios o roles."}), 403

    try:
        if request.method == "PUT":
            body = request.json or {}
            # Consistencia: validar tambien si se edita el muelle/proveedor
            if tabla == "proveedor_muelles":
                cuerpo = dict(body)
                if not cuerpo.get("proveedor_id") or not cuerpo.get("muelle_id"):
                    try:
                        existente = supabase.table(tabla).select("proveedor_id,muelle_id").eq("id", id).single().execute().data
                        if existente:
                            cuerpo.setdefault("proveedor_id", existente.get("proveedor_id"))
                            cuerpo.setdefault("muelle_id", existente.get("muelle_id"))
                    except Exception:
                        pass
                err, status = _validar_proveedor_muelle(cuerpo)
                if err:
                    return jsonify({"error": err}), status
            data = supabase.table(tabla).update(body).eq("id", id).execute().data
            return jsonify({"ok": True, "registro": (data or [{}])[0]})

        supabase.table(tabla).delete().eq("id", id).execute()
        return jsonify({"ok": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/usuarios")
def usuarios_page():
    return render_template("usuarios.html")


@app.route("/api/usuarios", methods=["GET", "POST"])
def api_usuarios():
    """Gestion de usuarios (simplificada: rol es TEXT)."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para gestionar usuarios."}), 403

    if request.method == "GET":
        try:
            emails = {}
            try:
                res = supabase.auth.admin.list_users()
                for u in (res or []):
                    emails[u.id] = u.email
            except Exception:
                pass

            # Lectura compatible con ambos esquemas: si la tabla esta vacia o la
            # columna no existe, no debe romper el endpoint (500).
            usuarios_rows = []
            try:
                usuarios_rows = supabase.table("usuarios").select("*").order("nombre").execute().data
            except Exception:
                usuarios_rows = []
            # Si no hay resultados con 'nombre', intentar con 'first_name' (esquema antiguo)
            if not usuarios_rows:
                try:
                    usuarios_rows = supabase.table("usuarios").select("*").order("first_name").execute().data
                except Exception:
                    usuarios_rows = []

            usuarios = []
            for u in (usuarios_rows or []):
                # Nombre: compatible ambos esquemas
                nom = u.get("nombre") or u.get("first_name")
                ape = u.get("apellidos") or u.get("last_name")
                # Rol: intentar leer desde roles via FK (ambos nombres de columna)
                role_name = None
                rol_id = u.get("rol_id") or u.get("role_id")
                if rol_id:
                    try:
                        r = supabase.table("roles").select("*").eq("id", rol_id).single().execute().data
                        role_name = (r or {}).get("nombre") or (r or {}).get("name")
                    except Exception:
                        pass
                # Supplier / proveedor
                prov_id = u.get("proveedor_id") or u.get("supplier_id")
                depto_id = u.get("departamento_id")  # solo esquema nuevo

                usuarios.append({
                    "id": u["id"],
                    "email": emails.get(u["id"]) or u.get("email", ""),
                    "nombre": nom,
                    "apellidos": ape,
                    "rol_id": rol_id,
                    "role_name": role_name,
                    "proveedor_id": prov_id,
                    "departamento_id": depto_id,
                    "numero_operario": u.get("numero_operario") or "",
                    "origen_operario": u.get("origen_operario") or "",
                    "tipo_usuario_forzado": u.get("tipo_usuario_forzado") or "",
                    "activo": u.get("activo") if "activo" in u else u.get("active", True),
                })

            # Las cuentas de operario no son cuentas de correo ni de Auth: se
            # identifican por número y contraseña en operarios_login. Se
            # incluyen en el listado como internos operativos aunque todavía
            # no tengan una fila de perfil convencional en usuarios.
            ids_con_perfil = {str(u.get("numero_operario") or "") for u in usuarios}
            try:
                cuentas_operario = (
                    supabase.table("operarios_login")
                    .select("numero_operario,nombre,password_hash,activo")
                    .execute()
                    .data
                    or []
                )
                censo_operarios = (
                    supabase.table("operarios_corporativos")
                    .select("numero_operario,nombre,activo")
                    .execute()
                    .data
                    or []
                )
                nombres_censo = {str(f["numero_operario"]): f for f in censo_operarios}
                for cuenta in cuentas_operario:
                    numero = str(cuenta.get("numero_operario") or "").strip()
                    if not numero or numero in ids_con_perfil or not str(cuenta.get("password_hash") or "").strip():
                        continue
                    operario = nombres_censo.get(numero) or {}
                    partes = str(operario.get("nombre") or cuenta.get("nombre") or numero).split(None, 1)
                    usuarios.append({
                        "id": f"operario:{numero}",
                        "email": "",
                        "nombre": partes[0],
                        "apellidos": partes[1] if len(partes) > 1 else "",
                        "rol_id": None,
                        "role_name": "interno",
                        "proveedor_id": None,
                        "departamento_id": None,
                        "numero_operario": numero,
                        "tipo_registro": "OPERARIO",
                        "es_operario": True,
                        "activo": cuenta.get("activo") is not False and operario.get("activo") is not False,
                    })
            except Exception as exc:
                logger.warning("No se pudieron añadir operarios al listado de usuarios: %s", exc)
            return jsonify({"usuarios": usuarios})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # POST: crear usuario
    body = request.json or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email y contrasena son obligatorios."}), 400
    error_vinculo = _validar_vinculo_proveedor(body)
    if error_vinculo:
        return jsonify({"error": error_vinculo}), 400

    try:
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        uid = res.user.id
    except Exception as e:
        return jsonify({"error": f"No se pudo crear el usuario: {e}"}), 400

    try:
        supabase.table("usuarios").insert({
            "id": uid,
            "nombre": body.get("nombre") or "",
            "apellidos": body.get("apellidos") or "",
            "rol_id": body.get("rol_id") or None,
            "proveedor_id": body.get("proveedor_id") or None,
            "departamento_id": body.get("departamento_id") or None,
            "numero_operario": body.get("numero_operario") or None,
            "origen_operario": body.get("origen_operario") or None,
            "tipo_usuario_forzado": body.get("tipo_usuario_forzado") or None,
            "activo": body.get("activo", True),
        }).execute()

        return jsonify({"ok": True, "id": uid}), 201
    except Exception as e:
        try:
            supabase.auth.admin.delete_user(uid)
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


@app.route("/api/usuarios/<id>", methods=["PUT", "DELETE"])
def api_usuario(id):
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para gestionar usuarios."}), 403

    if request.method == "DELETE":
        if id == (session.get("user") or {}).get("id"):
            return jsonify({"error": "No puedes eliminar tu propio usuario."}), 400
        try:
            supabase.auth.admin.delete_user(id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    # PUT
    body = request.json or {}
    error_vinculo = _validar_vinculo_proveedor(body, id)
    if error_vinculo:
        return jsonify({"error": error_vinculo}), 400
    try:
        datos = {}
        for campo in ["nombre", "apellidos", "rol_id", "proveedor_id", "departamento_id", "numero_operario", "origen_operario", "tipo_usuario_forzado"]:
            if campo in body:
                datos[campo] = body[campo]
        if "activo" in body:
            datos["activo"] = body["activo"]
        if datos:
            supabase.table("usuarios").update(datos).eq("id", id).execute()

        if body.get("password"):
            supabase.auth.admin.update_user_by_id(id, {"password": body["password"]})

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/invitaciones", methods=["GET", "POST"])
def api_invitaciones():
    """Preautoriza y envía invitaciones de Supabase a internos o externos."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para enviar invitaciones."}), 403

    if request.method == "GET":
        try:
            datos = (
                supabase.table("invitaciones_registro")
                .select("*")
                .order("creado_at", desc=True)
                .limit(100)
                .execute()
                .data
            )
            return jsonify({"invitaciones": datos or []})
        except Exception as exc:
            logger.exception("No se pudieron leer las invitaciones: %s", exc)
            return jsonify({"error": "No se pudieron consultar las invitaciones."}), 500

    datos = request.json or {}
    email = str(datos.get("email") or "").strip().lower()
    tipo_usuario = str(datos.get("tipo_usuario") or "").strip().upper()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Indica un email válido."}), 400
    if tipo_usuario not in {"INTERNO", "EXTERNO"}:
        return jsonify({"error": "El tipo de usuario debe ser INTERNO o EXTERNO."}), 400
    if tipo_usuario == "EXTERNO" and not datos.get("proveedor_id"):
        return jsonify({"error": "Debes indicar el proveedor del usuario externo."}), 400

    # La pantalla no decide el alcance de la invitación. Los internos solo
    # pueden ser admin o interno; los externos siempre reciben el rol externo
    # configurado en la aplicación y deben estar vinculados a un proveedor.
    try:
        if tipo_usuario == "INTERNO":
            rol_id = datos.get("rol_id")
            if not rol_id:
                return jsonify({"error": "Debes indicar si el usuario interno será admin o interno."}), 400
            rol = supabase.table("roles").select("id,nombre").eq("id", rol_id).single().execute().data or {}
            nombre_rol = str(rol.get("nombre") or "").strip().casefold()
            if nombre_rol not in {"admin", "interno"}:
                return jsonify({"error": "Un usuario interno solo puede tener el rol admin o interno."}), 400
        else:
            roles_externos = supabase.table("roles").select("id,nombre").execute().data or []
            # Se conserva la compatibilidad con instalaciones antiguas que
            # llamaban al rol "proveedor" en vez de "externo".
            rol = next((fila for fila in roles_externos
                        if str(fila.get("nombre") or "").strip().casefold() == "externo"), None)
            if not rol:
                rol = next((fila for fila in roles_externos if _es_rol_externo(fila.get("nombre"))), None)
            if not rol:
                return jsonify({"error": "No existe un rol externo configurado para la invitación."}), 400
            rol_id = rol["id"]
    except Exception:
        return jsonify({"error": "El rol seleccionado no existe o no está disponible."}), 400
    if tipo_usuario == "INTERNO" and datos.get("proveedor_id"):
        return jsonify({"error": "Un usuario interno no debe estar vinculado a un proveedor."}), 400

    # Una invitación que no se aceptó deja una cuenta temporal en Supabase Auth.
    # Al reenviar, se retira esa cuenta sin perfil y se cancela su registro para
    # que el índice único por email no bloquee la nueva invitación. Nunca se
    # elimina una cuenta que ya tenga perfil en ``usuarios``.
    try:
        invitaciones_pendientes = (
            supabase.table("invitaciones_registro")
            .select("id,supabase_user_id")
            .ilike("email", email)
            .in_("estado", ["PENDIENTE", "ENVIADA"])
            .order("creado_at", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.exception("No se pudo comprobar una invitación previa de %s: %s", email, exc)
        return jsonify({"error": "No se pudo comprobar si existe una invitación previa."}), 500

    for anterior in invitaciones_pendientes:
        usuario_temporal_id = anterior.get("supabase_user_id")
        if usuario_temporal_id:
            try:
                perfiles = (
                    supabase.table("usuarios")
                    .select("id")
                    .eq("id", usuario_temporal_id)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
            except Exception as exc:
                logger.exception("No se pudo comprobar el perfil de la invitación previa: %s", exc)
                return jsonify({"error": "No se pudo comprobar la cuenta asociada a la invitación previa."}), 500
            if perfiles:
                return jsonify({"error": "El email ya corresponde a una cuenta activa; no se puede reenviar la invitación."}), 409
            try:
                supabase.auth.admin.delete_user(usuario_temporal_id)
            except Exception as exc:
                logger.exception("No se pudo retirar la cuenta temporal de %s: %s", email, exc)
                return jsonify({"error": "No se pudo renovar la cuenta temporal de la invitación anterior."}), 502
        try:
            supabase.table("invitaciones_registro").update({"estado": "CANCELADA"}).eq("id", anterior["id"]).execute()
        except Exception as exc:
            logger.exception("No se pudo cancelar la invitación previa de %s: %s", email, exc)
            return jsonify({"error": "No se pudo cancelar la invitación anterior."}), 500

    invitacion = {
        "email": email,
        "tipo_usuario": tipo_usuario,
        "proveedor_id": datos.get("proveedor_id") or None,
        "rol_id": rol_id,
        "creado_por": (session.get("user") or {}).get("id"),
        "estado": "PENDIENTE",
    }
    try:
        creada = supabase.table("invitaciones_registro").insert(invitacion).execute().data[0]
    except Exception as exc:
        logger.exception("No se pudo crear invitación para %s: %s", email, exc)
        return jsonify({"error": "Ya existe una invitación pendiente para este email o no se pudo crear."}), 409

    try:
        respuesta = supabase.auth.admin.invite_user_by_email(
            email,
            {"redirect_to": f"{APP_URL}/registro"},
        )
        supabase.table("invitaciones_registro").update({
            "estado": "ENVIADA",
            "supabase_user_id": respuesta.user.id if respuesta.user else None,
        }).eq("id", creada["id"]).execute()
        return jsonify({"ok": True, "invitacion": creada, "reenviada": bool(invitaciones_pendientes)}), 201
    except Exception as exc:
        logger.exception("No se pudo enviar invitación a %s: %s", email, exc)
        # La preautorización se conserva para que un administrador pueda
        # reenviarla; no se marca como aceptada ni se crea ningún perfil.
        return jsonify({"error": "La invitación se ha guardado, pero no se pudo enviar el email."}), 502


@app.route("/api/registro/aceptar", methods=["POST"])
def api_aceptar_registro():
    """Completa el perfil tras aceptar una invitación de Supabase Auth."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return jsonify({"error": "La invitación no contiene una sesión válida."}), 401
    try:
        respuesta = create_client(SUPABASE_URL, SUPABASE_KEY).auth.get_user(token)
        usuario_auth = respuesta.user
        email = (usuario_auth.email or "").strip().lower()
    except Exception:
        return jsonify({"error": "La invitación ha caducado o no es válida."}), 401

    try:
        invitaciones = (
            supabase.table("invitaciones_registro")
            .select("*")
            .ilike("email", email)
            .in_("estado", ["PENDIENTE", "ENVIADA"])
            .gte("caduca_at", datetime.now(timezone.utc).isoformat())
            .order("creado_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        invitacion = invitaciones[0] if invitaciones else None
    except Exception as exc:
        logger.exception("No se pudo validar invitación de %s: %s", email, exc)
        return jsonify({"error": "No se ha podido validar la invitación."}), 500

    if not invitacion:
        return jsonify({"error": "No existe una invitación válida para este email."}), 403

    datos = request.json or {}
    try:
        supabase.table("usuarios").upsert({
            "id": usuario_auth.id,
            "nombre": str(datos.get("nombre") or "").strip(),
            "apellidos": str(datos.get("apellidos") or "").strip(),
            "rol_id": invitacion.get("rol_id"),
            "proveedor_id": invitacion.get("proveedor_id"),
            "activo": True,
            "tipo_usuario_forzado": invitacion["tipo_usuario"],
            "tipo_registro": "INVITACION",
        }).execute()
        supabase.table("invitaciones_registro").update({
            "estado": "ACEPTADA",
            "usado_at": datetime.now(timezone.utc).isoformat(),
            "supabase_user_id": usuario_auth.id,
        }).eq("id", invitacion["id"]).execute()
        return jsonify({"ok": True})
    except Exception as exc:
        logger.exception("No se pudo crear perfil desde invitación de %s: %s", email, exc)
        return jsonify({"error": "No se pudo completar el registro."}), 500


@app.route("/api/admin/operarios/<numero_operario>/cuenta", methods=["POST"])
def api_crear_cuenta_operario(numero_operario):
    """Asigna una contraseña al número de un operario sincronizado."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para crear cuentas de operario."}), 403
    datos = request.json or {}
    password = str(datos.get("password") or "")
    if not password:
        return jsonify({"error": "Debes indicar una contraseña."}), 400
    try:
        operario = (
            supabase.table("operarios_corporativos")
            .select("numero_operario,nombre,activo")
            .eq("numero_operario", str(numero_operario).strip())
            .single()
            .execute()
            .data
        )
        existente = (
            supabase.table("operarios_login")
            .select("numero_operario,password_hash")
            .eq("numero_operario", str(numero_operario).strip())
            .limit(1)
            .execute()
            .data
        )
    except Exception as exc:
        logger.exception("No se pudo preparar la cuenta del operario %s: %s", numero_operario, exc)
        return jsonify({"error": "No se ha podido consultar el operario."}), 500
    if not operario or not operario.get("activo"):
        return jsonify({"error": "El operario no existe o está inactivo."}), 404
    if existente and str(existente[0].get("password_hash") or "").strip():
        return jsonify({"error": "Este operario ya tiene una contraseña asignada."}), 409
    try:
        datos_login = {
            "password_hash": generate_password_hash(password),
            "activo": True,
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }
        if existente:
            supabase.table("operarios_login").update(datos_login).eq(
                "numero_operario", str(numero_operario).strip()
            ).execute()
        else:
            supabase.table("operarios_login").insert({
                "numero_operario": operario["numero_operario"],
                "nombre": operario["nombre"],
                **datos_login,
            }).execute()
        return jsonify({"ok": True}), 201
    except Exception as exc:
        logger.exception("No se pudo crear cuenta para el operario %s: %s", numero_operario, exc)
        return jsonify({"error": "No se pudo crear la cuenta del operario."}), 500


@app.route("/api/admin/operarios", methods=["GET"])
def api_operarios_administracion():
    """Lista el estado de las identidades corporativas y sus cuentas."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para consultar operarios."}), 403
    try:
        operarios = (
            supabase.table("operarios_corporativos")
            .select("numero_operario,nombre,correo,activo,origen,fecha_ultima_sincronizacion")
            .order("nombre")
            .limit(1000)
            .execute()
            .data
        ) or []
        cuentas = (
            supabase.table("operarios_login")
            .select("numero_operario,password_hash,activo")
            .execute()
            .data
        ) or []
        por_numero = {str(cuenta["numero_operario"]): cuenta for cuenta in cuentas}
        resultado = []
        for operario in operarios:
            cuenta = por_numero.get(str(operario["numero_operario"]))
            resultado.append({
                **operario,
                "tiene_cuenta": bool(cuenta and str(cuenta.get("password_hash") or "").strip()),
                "cuenta_activa": cuenta.get("activo") if cuenta else False,
            })
        return jsonify({"operarios": resultado})
    except Exception as exc:
        logger.exception("No se pudieron listar operarios: %s", exc)
        return jsonify({"error": "No se pudieron consultar los operarios sincronizados."}), 500


@app.route("/api/admin/operarios/<numero_operario>/restablecer-contrasena", methods=["POST"])
def api_restaurar_contrasena_operario(numero_operario):
    """Establece una contraseña temporal entregada por el administrador."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para restablecer contraseñas."}), 403
    password = str((request.json or {}).get("password") or "")
    if not password:
        return jsonify({"error": "Debes indicar una contraseña."}), 400
    try:
        filas = (
            supabase.table("operarios_login")
            .select("numero_operario,password_hash")
            .eq("numero_operario", str(numero_operario).strip())
            .limit(1)
            .execute()
            .data
        )
        if not filas:
            return jsonify({"error": "El operario no tiene una cuenta asociada."}), 404
        supabase.table("operarios_login").update({
            "password_hash": generate_password_hash(password),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }).eq("numero_operario", str(numero_operario).strip()).execute()
        return jsonify({"ok": True})
    except Exception as exc:
        logger.exception("No se pudo restablecer contraseña del operario %s: %s", numero_operario, exc)
        return jsonify({"error": "No se pudo restablecer la contraseña."}), 500


@app.route("/api/mi-cuenta/cambiar-contrasena", methods=["POST"])
def api_cambiar_contrasena_propia():
    """Permite a un operario cerrar el ciclo de contraseña temporal."""
    usuario = session.get("user") or {}
    if not usuario.get("id"):
        return jsonify({"error": "Debes iniciar sesión."}), 401
    password = str((request.json or {}).get("password") or "")
    if not password:
        return jsonify({"error": "Debes indicar una contraseña."}), 400
    try:
        numero_operario = str(usuario.get("numero_operario") or "").strip()
        if not numero_operario:
            return jsonify({"error": "Esta cuenta no es un operario."}), 400
        supabase.table("operarios_login").update({
            "password_hash": generate_password_hash(password),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }).eq("numero_operario", numero_operario).execute()
        usuario["requiere_cambio_password"] = False
        session["user"] = usuario
        return jsonify({"ok": True})
    except Exception as exc:
        logger.exception("No se pudo cambiar la contraseña propia: %s", exc)
        return jsonify({"error": "No se pudo cambiar la contraseña."}), 500


@app.route("/api/admin/sincronizar-operarios", methods=["GET", "POST"])
def api_sincronizar_operarios():
    """Encola una sincronización para el agente de la red corporativa."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if not usuario_actual_es_administrador():
        return jsonify({"error": "No tienes permisos para sincronizar operarios."}), 403

    if request.method == "GET":
        try:
            ultima_solicitud = (
                supabase.table("solicitudes_sincronizacion_operarios")
                .select("*")
                .order("solicitado_en", desc=True)
                .limit(1)
                .execute()
                .data
            )
            return jsonify({"solicitud": ultima_solicitud[0] if ultima_solicitud else None})
        except Exception as exc:
            logger.exception("No se pudo obtener la última solicitud de sincronización: %s", exc)
            return jsonify({"error": "No se pudo consultar la sincronización."}), 500

    try:
        pendientes = (
            supabase.table("solicitudes_sincronizacion_operarios")
            .select("id")
            .in_("estado", ["PENDIENTE", "EN_CURSO"])
            .limit(1)
            .execute()
            .data
        )
        if pendientes:
            return jsonify({"error": "Ya hay una sincronización pendiente o en curso."}), 409
        solicitud = supabase.table("solicitudes_sincronizacion_operarios").insert({
            "solicitado_por": (session.get("user") or {}).get("id"),
        }).execute().data[0]
        return jsonify({"ok": True, "solicitud": solicitud}), 202
    except Exception as exc:
        logger.exception("No se pudo crear la solicitud de sincronización: %s", exc)
        return jsonify({"error": "No se pudo solicitar la sincronización."}), 500


if __name__ == "__main__":
    # use_reloader=False: en Windows el reloader de Flask a veces crashea
    # al detectar cambios (_enter_buffered_busy). Al desactivarlo, hay que
    # reiniciar el servidor manualmente tras editar el codigo.
    app.run(debug=True, use_reloader=False)
