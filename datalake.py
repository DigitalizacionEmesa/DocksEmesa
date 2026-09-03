# =============================================================================
# datalake.py - Autenticación de operarios contra el datalake corporativo.
#
# Conecta por ODBC a la base SQL Server "DataLakeSCCZ" y valida usuarios de la
# tabla de operarios (General.Usuarios, con respaldo en OB.Usuarios_CZ_hash)
# usando el número de operario y su contraseña corporativa.
#
# La contraseña puede estar en texto plano (legacy), en SHA-256 hex o en hash
# de Werkzeug (scrypt/pbkdf2).
# =============================================================================

import hashlib

import pyodbc
from werkzeug.security import check_password_hash

import config


def _sin_duplicados(secuencia):
    vistos = set()
    return [x for x in secuencia if x and not (x in vistos or vistos.add(x))]


def _conexion():
    """Abre una conexión ODBC probando servidores y drivers disponibles."""
    servers = _sin_duplicados(
        [config.DATALAKE_SERVER] + config.DATALAKE_SERVERS + ["EMEBIDWH", "172.16.10.10"]
    )
    drivers = _sin_duplicados(
        [config.DATALAKE_DRIVER]
        + config.DATALAKE_DRIVERS
        + ["ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server", "SQL Server"]
    )

    ultimo_error = None
    for driver in drivers:
        for server in servers:
            conn_str = (
                f"DRIVER={{{driver}}};"
                f"SERVER={server};"
                f"DATABASE={config.DATALAKE_DATABASE};"
                f"UID={config.DATALAKE_USER};PWD={config.DATALAKE_PASSWORD};"
                "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=10;"
            )
            try:
                return pyodbc.connect(conn_str, timeout=10, autocommit=True)
            except Exception as exc:  # noqa: BLE001
                ultimo_error = exc

    if ultimo_error:
        raise ultimo_error
    raise ConnectionError("No se pudo conectar con el datalake (DataLakeSCCZ)")


def _verificar_contrasena(almacenada, en_claro):
    """Compara la contraseña introducida contra el valor almacenado."""
    if almacenada is None or en_claro is None:
        return False

    if isinstance(almacenada, bytes):
        almacenada = almacenada.decode("utf-8", errors="ignore")

    guardada = str(almacenada).strip()
    texto = str(en_claro).strip()

    if not guardada or not texto:
        return False

    # 1) Texto plano (legacy)
    if guardada == texto:
        return True

    # 2) SHA-256 hexadecimal
    if len(guardada) == 64 and all(c in "0123456789abcdefABCDEF" for c in guardada):
        return hashlib.sha256(texto.encode("utf-8")).hexdigest().lower() == guardada.lower()

    # 3) Hash de Werkzeug (scrypt / pbkdf2)
    try:
        return check_password_hash(guardada, texto)
    except Exception:  # noqa: BLE001
        return False


def buscar_operario(num_operario, password):
    """Busca un operario por número y valida su contraseña.

    Devuelve un dict con la identidad corporativa o ``None`` si las
    credenciales no son válidas o el operario no existe.
    """
    numero = str(num_operario or "").strip()
    if not numero or not password:
        return None

    parametro = int(numero) if numero.isdigit() else numero

    # General.Usuarios incluye el correo corporativo; OB.Usuarios_CZ_hash no.
    tablas = (
        ("General.Usuarios", "Id_Usuario, Num_Operario, Nombre, Nivel_Permisos, Roles, Contrasena, Correo"),
        ("OB.Usuarios_CZ_hash", "Id_Usuario, Num_Operario, Nombre, Nivel_Permisos, Roles, Contrasena"),
    )

    conn = _conexion()
    try:
        cursor = conn.cursor()
        for tabla, columnas in tablas:
            try:
                cursor.execute(
                    f"SELECT TOP 1 {columnas} FROM {tabla} WHERE Num_Operario = ?",
                    (parametro,),
                )
                fila = cursor.fetchone()
            except Exception:  # noqa: BLE001
                # La tabla puede no existir o no tener esas columnas; probar la siguiente.
                continue

            if not fila:
                continue

            if not _verificar_contrasena(fila[5], password):
                return None  # operario encontrado pero contraseña incorrecta

            return {
                "id_usuario": fila[0],
                "num_operario": str(fila[1]) if fila[1] is not None else numero,
                "nombre": fila[2],
                "nivel_permisos": fila[3],
                "roles": fila[4],
                "correo": (fila[6] if len(fila) > 6 else None),
            }

        return None
    finally:
        conn.close()
