import os
from datetime import datetime, timedelta, timezone

from flask import Flask, render_template, request, jsonify, session

from supabase import create_client

from config import SUPABASE_URL, SUPABASE_KEY


app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "clave-secreta-dockmesa-dev")


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
    """Plantas visibles (compatible esquema antiguo y nuevo).

    - admin / interno -> todas
    - externo / proveedor -> sus plantas de usuario_plantas (el muelle que use
      debe estar dentro de esas plantas; se valida en configuracion).
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
    # usuario_plantas
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


def enriquecer_usuario(cliente, user):
    """Anade roles, permisos y accesos al objeto de usuario."""
    user["roles"] = obtener_rol_usuario(cliente, user["id"])
    user["permisos"] = permisos_de_roles(user["roles"])
    user["plantas"] = obtener_plantas_usuario(cliente, user["id"])
    user["proveedor_id"] = obtener_proveedor_usuario(cliente, user["id"])
    return user


@app.route("/")
def login_page():
    return render_template("login.html")


@app.route("/registro")
def registro_page():
    return render_template("registro.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/login", methods=["POST"])
def login():
    datos = request.json or {}
    email = (datos.get("email") or "").strip()
    password = datos.get("password") or ""

    if not email or not password:
        return jsonify({"ok": False, "error": "Email y contrasena son obligatorios."}), 400

    try:
        cliente_auth = create_client(SUPABASE_URL, SUPABASE_KEY)
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

        # Nombre: compatible esquema nuevo (nombre/apellidos) y antiguo (first_name/last_name)
        if perfil:
            if perfil.get("nombre") or perfil.get("apellidos"):
                nombre = f"{perfil.get('nombre', '')} {perfil.get('apellidos', '')}".strip()
            else:
                nombre = f"{perfil.get('first_name', '')} {perfil.get('last_name', '')}".strip()
        else:
            nombre = None

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

    except Exception:
        return jsonify({"ok": False, "error": "Email o contrasena incorrectos."}), 401


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
    - proveedor / externo -> solo las plantas asignadas (usuario_plantas)
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
            if ids_visibles and p["id"] not in ids_visibles:
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

    Devuelve None si NO aplica restriccion: rol admin/interno, o un proveedor que
    aun no tiene muelles asignados (fallback: ve todos los de su planta).
    """
    cli = cliente or supabase
    rol = _obtener_nombre_rol(cli, user_id)[0]
    if rol in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
        return None
    prov = obtener_proveedor_usuario(cli, user_id)
    if not prov:
        return None
    try:
        rows = cli.table("proveedor_muelles").select("muelle_id").eq("proveedor_id", prov).execute().data
    except Exception:
        return None
    if not rows:
        return None  # fallback: sin asignaciones -> todos
    return {r["muelle_id"] for r in rows}


def _plantas_de_proveedor(proveedor_id):
    """Plantas asignadas a los usuarios de un proveedor (via usuario_plantas)."""
    try:
        usuarios = supabase.table("usuarios").select("id").eq("proveedor_id", proveedor_id).execute().data
        ids = [u["id"] for u in (usuarios or [])]
        if not ids:
            return set()
        ups = supabase.table("usuario_plantas").select("planta_id").in_("usuario_id", ids).execute().data
        return {u["planta_id"] for u in (ups or [])}
    except Exception:
        return set()


def _validar_proveedor_muelle(body):
    """Valida que el muelle asignado a un proveedor este en una planta asignada a
    los usuarios de ese proveedor (evita inconsistencias desde configuracion).
    Devuelve (None, None) si ok; si no (mensaje, status).
    """
    proveedor_id = body.get("proveedor_id")
    muelle_id = body.get("muelle_id")
    if not proveedor_id or not muelle_id:
        return None, None
    plantas = _plantas_de_proveedor(proveedor_id)
    if not plantas:
        return ("Este proveedor no tiene usuarios con plantas asignadas. Asigna primero una planta a sus usuarios.", 400)
    planta_muelle = _planta_de_muelle(muelle_id)
    if planta_muelle and planta_muelle not in plantas:
        return ("El muelle pertenece a una planta no asignada a los usuarios de este proveedor.", 400)
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
    """Plantas asignadas a los usuarios de un proveedor (para restringir la
    asignacion de muelles a ese proveedor en configuracion). Solo admin/interno."""
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    user = session.get("user")
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    rol = _obtener_nombre_rol(supabase, user["id"])[0]
    if rol not in ("admin", "interno", "DEVELOPER", "SYSTEM_ADMIN", "PLANT_ADMIN"):
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


@app.route("/api/crud/<tabla>", methods=["GET", "POST", "PUT", "DELETE"])
def api_crud_lista(tabla):
    if not supabase:
        return jsonify({"error": "Supabase no configurado"}), 500
    if tabla not in CRUD_TABLAS:
        return jsonify({"error": "Tabla no permitida"}), 403

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

    if request.method == "GET":
        try:
            emails = {}
            try:
                res = supabase.auth.admin.list_users()
                for u in (res or []):
                    emails[u.id] = u.email
            except Exception:
                pass

            usuarios_rows = supabase.table("usuarios").select("*").order("nombre").execute().data
            # Si no hay resultados con 'nombre', intentar con 'first_name' (esquema antiguo)
            if not usuarios_rows:
                usuarios_rows = supabase.table("usuarios").select("*").order("first_name").execute().data

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
                    "activo": u.get("activo") if "activo" in u else u.get("active", True),
                })
            return jsonify({"usuarios": usuarios})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # POST: crear usuario
    body = request.json or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email y contrasena son obligatorios."}), 400

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
    try:
        datos = {}
        for campo in ["nombre", "apellidos", "rol_id", "proveedor_id", "departamento_id"]:
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


if __name__ == "__main__":
    # use_reloader=False: en Windows el reloader de Flask a veces crashea
    # al detectar cambios (_enter_buffered_busy). Al desactivarlo, hay que
    # reiniciar el servidor manualmente tras editar el codigo.
    app.run(debug=True, use_reloader=False)
