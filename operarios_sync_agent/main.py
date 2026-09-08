"""Agente ejecutable dentro de la red corporativa de EMESA.

Ejecuta la sincronización diaria y recoge solicitudes manuales de Supabase.
No expone una API HTTP ni contiene lógica de autenticación de usuarios.
"""

from __future__ import annotations

import os
import sys
import time
import argparse
import hmac
import json
import threading
from collections import Counter
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pyodbc
from dotenv import load_dotenv
from supabase import create_client


# PyInstaller descomprime los recursos en _MEIPASS. El fichero .env permanece
# junto al .exe para que las credenciales nunca queden embebidas en él.
ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
SINCRONIZACION_EN_CURSO = threading.Lock()


def ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def cliente_supabase():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_KEY en .env")
    return create_client(url, key)


def cargar_operarios() -> list[dict]:
    driver = os.getenv("DATALAKE_DRIVER", "ODBC Driver 18 for SQL Server")
    encrypt = os.getenv("DATALAKE_ENCRYPT", "yes").strip().lower()
    seguridad = f"Encrypt={'no' if encrypt in ('no', 'false', '0') else 'yes'};TrustServerCertificate=yes;"
    cadena = (
        f"DRIVER={{{driver}}};SERVER={os.getenv('DATALAKE_SERVER')};"
        f"DATABASE={os.getenv('DATALAKE_DATABASE')};UID={os.getenv('DATALAKE_USER')};"
        f"PWD={os.getenv('DATALAKE_PASSWORD')};{seguridad}Connection Timeout=15;"
    )
    with pyodbc.connect(cadena, timeout=15, autocommit=True) as conexion:
        cursor = conexion.cursor()
        cursor.execute(
            "SELECT Num_Operario, Nombre, Correo FROM General.Usuarios "
            "WHERE Num_Operario IS NOT NULL"
        )
        return [
            {
                "numero_operario": str(fila[0]).strip(),
                "nombre": " ".join(str(fila[1]).split()),
                "correo": str(fila[2]).strip().lower() if fila[2] else None,
                "activo": True,
                "origen": "EMESA",
            }
            for fila in cursor.fetchall()
            if fila[0] is not None and fila[1]
        ]


def sincronizar(cliente, filas: list[dict], ejecutado_por: str | None = None) -> dict:
    resumen = {"registros_leidos": 0, "registros_nuevos": 0, "registros_actualizados": 0,
               "registros_inactivados": 0, "registros_sin_cambios": 0, "errores": 0}
    auditoria = cliente.table("sincronizaciones_operarios").insert({
        "estado": "EN_CURSO", "ejecutado_por": ejecutado_por
    }).execute().data[0]
    try:
        actuales = cliente.table("operarios_corporativos").select(
            "id,numero_operario,nombre,correo,activo,origen"
        ).execute().data or []
        por_numero = {str(fila["numero_operario"]): fila for fila in actuales}
        normalizadas = []
        numeros_vistos = set()
        for fila in filas:
            numero = str(fila["numero_operario"]).strip()
            if not numero or numero in numeros_vistos:
                resumen["errores"] += 1
                continue
            numeros_vistos.add(numero)
            resumen["registros_leidos"] += 1
            normalizadas.append({**fila, "numero_operario": numero})

        conteo_correos = Counter(str(fila.get("correo") or "").strip().lower() for fila in normalizadas if fila.get("correo"))
        propietario_correo = {
            str(fila.get("correo") or "").strip().lower(): str(fila["numero_operario"])
            for fila in actuales if fila.get("correo")
        }
        correos_omitidos = 0
        vistos = set()
        for fila in normalizadas:
            numero = fila["numero_operario"]
            correo = str(fila.get("correo") or "").strip().lower() or None
            if correo and (conteo_correos[correo] > 1 or propietario_correo.get(correo, numero) != numero):
                correo = None
                correos_omitidos += 1
            vistos.add(numero)
            nuevo = {**fila, "correo": correo, "fecha_ultima_sincronizacion": ahora(), "updated_at": ahora()}
            previo = por_numero.get(numero)
            if not previo:
                cliente.table("operarios_corporativos").insert(nuevo).execute()
                resumen["registros_nuevos"] += 1
            elif any(previo.get(campo) != nuevo[campo] for campo in ("nombre", "correo", "activo", "origen")):
                cliente.table("operarios_corporativos").update(nuevo).eq("id", previo["id"]).execute()
                resumen["registros_actualizados"] += 1
            else:
                resumen["registros_sin_cambios"] += 1
        if correos_omitidos:
            resumen["detalle"] = f"{correos_omitidos} correo(s) compartido(s) o ya asociado(s) se han omitido."
        for numero, previo in por_numero.items():
            if numero not in vistos and previo.get("activo"):
                cliente.table("operarios_corporativos").update({"activo": False, "updated_at": ahora()}).eq("id", previo["id"]).execute()
                resumen["registros_inactivados"] += 1
        cliente.table("sincronizaciones_operarios").update({**resumen, "estado": "COMPLETADA", "fin": ahora()}).eq("id", auditoria["id"]).execute()
        return resumen
    except Exception as exc:
        resumen["errores"] += 1
        cliente.table("sincronizaciones_operarios").update({**resumen, "estado": "ERROR", "detalle": str(exc), "fin": ahora()}).eq("id", auditoria["id"]).execute()
        raise


def siguiente_solicitud(cliente):
    pendientes = cliente.table("solicitudes_sincronizacion_operarios").select("*").eq(
        "estado", "PENDIENTE"
    ).order("solicitado_en").limit(1).execute().data or []
    if not pendientes:
        return None
    solicitud = pendientes[0]
    tomada = cliente.table("solicitudes_sincronizacion_operarios").update({
        "estado": "EN_CURSO", "iniciado_en": ahora()
    }).eq("id", solicitud["id"]).eq("estado", "PENDIENTE").execute().data or []
    return tomada[0] if tomada else None


def procesar_una_solicitud(cliente) -> bool:
    solicitud = siguiente_solicitud(cliente)
    if not solicitud:
        return False
    try:
        resultado = sincronizar(cliente, cargar_operarios(), solicitud.get("solicitado_por"))
        cliente.table("solicitudes_sincronizacion_operarios").update({
            "estado": "COMPLETADA", "finalizado_en": ahora(), "resultado": resultado
        }).eq("id", solicitud["id"]).execute()
    except Exception as exc:
        cliente.table("solicitudes_sincronizacion_operarios").update({
            "estado": "ERROR", "finalizado_en": ahora(), "error": str(exc)
        }).eq("id", solicitud["id"]).execute()
    return True


def ejecutar_diario(cliente) -> dict:
    """Actualiza el censo y cierra las solicitudes manuales pendientes."""
    filas = cargar_operarios()
    resultado = sincronizar(cliente, filas)
    pendientes = cliente.table("solicitudes_sincronizacion_operarios").select(
        "id,solicitado_por"
    ).eq("estado", "PENDIENTE").execute().data or []
    for solicitud in pendientes:
        cliente.table("solicitudes_sincronizacion_operarios").update({
            "estado": "COMPLETADA", "iniciado_en": ahora(), "finalizado_en": ahora(),
            "resultado": resultado,
        }).eq("id", solicitud["id"]).eq("estado", "PENDIENTE").execute()
    return resultado


def iniciar_servidor() -> None:
    """Expone un control mínimo del agente para la red corporativa."""
    token = os.getenv("AGENT_API_TOKEN", "")
    if not token:
        raise RuntimeError("Falta AGENT_API_TOKEN en .env; no se inicia el puerto de control.")
    host = os.getenv("AGENT_BIND_HOST", "127.0.0.1")
    puerto = int(os.getenv("AGENT_PORT", "8765"))

    class Controlador(BaseHTTPRequestHandler):
        def responder(self, estado: int, cuerpo: dict) -> None:
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(estado)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def autorizado(self) -> bool:
            recibido = self.headers.get("X-Agent-Token", "")
            return bool(recibido) and hmac.compare_digest(recibido, token)

        def do_GET(self) -> None:
            if self.path != "/health":
                self.responder(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})
                return
            self.responder(HTTPStatus.OK, {"estado": "activo", "servicio": "sincronizador-operarios"})

        def do_POST(self) -> None:
            if self.path != "/sincronizar":
                self.responder(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})
                return
            if not self.autorizado():
                self.responder(HTTPStatus.UNAUTHORIZED, {"error": "No autorizado"})
                return
            if not SINCRONIZACION_EN_CURSO.acquire(blocking=False):
                self.responder(HTTPStatus.CONFLICT, {"error": "Ya hay una sincronización en curso"})
                return
            try:
                resultado = ejecutar_diario(cliente_supabase())
                self.responder(HTTPStatus.OK, {"estado": "completada", "resultado": resultado})
            except Exception as exc:
                print(f"Error de sincronización por API: {exc}", file=sys.stderr)
                self.responder(HTTPStatus.INTERNAL_SERVER_ERROR, {"estado": "error"})
            finally:
                SINCRONIZACION_EN_CURSO.release()

        def log_message(self, formato: str, *argumentos) -> None:
            print(f"API control: {formato % argumentos}")

    servidor = ThreadingHTTPServer((host, puerto), Controlador)
    print(f"Control del agente disponible en http://{host}:{puerto}")
    servidor.serve_forever()


def main() -> int:
    parser = argparse.ArgumentParser(description="Sincroniza los operarios de DataLake con Supabase.")
    parser.add_argument(
        "--diario", action="store_true",
        help="Ejecuta una sincronización completa y finaliza. Pensado para la tarea de las 06:00.",
    )
    parser.add_argument(
        "--servidor", action="store_true",
        help="Inicia el control HTTP del agente en el puerto configurado (8765 por defecto).",
    )
    argumentos = parser.parse_args()
    if argumentos.servidor:
        iniciar_servidor()
        return 0
    cliente = cliente_supabase()
    if argumentos.diario:
        resultado = ejecutar_diario(cliente)
        print(f"Sincronización diaria completada: {resultado}")
        return 0
    intervalo = max(10, int(os.getenv("POLL_SECONDS", "60")))
    print(f"Agente de operarios activo; comprobando solicitudes cada {intervalo}s.")
    while True:
        try:
            procesar_una_solicitud(cliente)
        except Exception as exc:
            print(f"Error del agente: {exc}", file=sys.stderr)
        time.sleep(intervalo)


if __name__ == "__main__":
    raise SystemExit(main())
