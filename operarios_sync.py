"""Sincronización idempotente de operarios corporativos hacia Supabase.

Este módulo no autentica usuarios ni maneja contraseñas. Puede invocarlo la
tarea diaria y, más adelante, el endpoint administrativo manual.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from collections import Counter
from typing import Any, Callable, Iterable


@dataclass(frozen=True)
class OperarioOrigen:
    numero_operario: str
    nombre: str
    correo: str | None = None
    activo: bool = True
    origen: str = "EMESA"


@dataclass
class ResultadoSincronizacion:
    registros_leidos: int = 0
    registros_nuevos: int = 0
    registros_actualizados: int = 0
    registros_inactivados: int = 0
    registros_sin_cambios: int = 0
    errores: int = 0
    detalle: str | None = None

    def como_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalizar_operario(fila: dict[str, Any] | OperarioOrigen) -> OperarioOrigen | None:
    """Normaliza una fila del origen; devuelve None si no es utilizable."""
    datos = asdict(fila) if isinstance(fila, OperarioOrigen) else fila
    numero = str(datos.get("numero_operario") or datos.get("num_operario") or "").strip()
    nombre = " ".join(str(datos.get("nombre") or "").split())
    correo = str(datos.get("correo") or "").strip().lower() or None
    if not numero or not nombre:
        return None
    return OperarioOrigen(
        numero_operario=numero,
        nombre=nombre,
        correo=correo,
        activo=bool(datos.get("activo", True)),
        origen=str(datos.get("origen") or "EMESA").strip().upper(),
    )


def sincronizar_operarios(
    cliente: Any,
    filas_origen: Iterable[dict[str, Any] | OperarioOrigen],
    ejecutado_por: str | None = None,
) -> ResultadoSincronizacion:
    """Sincroniza el origen completo y marca como inactivos los ausentes.

    ``cliente`` es el cliente de Supabase autenticado con una clave de servidor.
    La función es deliberadamente independiente de Flask para poder reutilizarla.
    """
    resultado = ResultadoSincronizacion()
    ahora = datetime.now(timezone.utc).isoformat()
    auditoria = cliente.table("sincronizaciones_operarios").insert({
        "estado": "EN_CURSO",
        "ejecutado_por": ejecutado_por,
    }).execute()
    auditoria_id = auditoria.data[0]["id"]

    try:
        existentes = cliente.table("operarios_corporativos").select(
            "id,numero_operario,nombre,correo,activo,origen"
        ).execute().data or []
        por_numero = {str(fila["numero_operario"]): fila for fila in existentes}
        normalizados: list[OperarioOrigen] = []
        numeros_vistos: set[str] = set()
        for fila in filas_origen:
            operario = normalizar_operario(fila)
            if not operario:
                resultado.errores += 1
                continue
            resultado.registros_leidos += 1
            if operario.numero_operario in numeros_vistos:
                resultado.errores += 1
                continue
            numeros_vistos.add(operario.numero_operario)
            normalizados.append(operario)

        # El correo es un dato de contacto, no la identidad del operario. El
        # origen corporativo contiene buzones compartidos; no deben bloquear el
        # censo porque la tabla conserva una restricción de correo único.
        conteo_correos = Counter(o.correo for o in normalizados if o.correo)
        propietario_correo = {
            str(fila.get("correo") or "").strip().lower(): str(fila["numero_operario"])
            for fila in existentes if fila.get("correo")
        }
        correos_omitidos = 0
        vistos: set[str] = set()
        for operario in normalizados:
            correo = operario.correo
            if correo and (conteo_correos[correo] > 1 or propietario_correo.get(correo, operario.numero_operario) != operario.numero_operario):
                correo = None
                correos_omitidos += 1
            vistos.add(operario.numero_operario)

            nuevo = {
                "numero_operario": operario.numero_operario,
                "nombre": operario.nombre,
                "correo": correo,
                "activo": operario.activo,
                "origen": operario.origen,
                "fecha_ultima_sincronizacion": ahora,
                "updated_at": ahora,
            }
            existente = por_numero.get(operario.numero_operario)
            if not existente:
                cliente.table("operarios_corporativos").insert(nuevo).execute()
                resultado.registros_nuevos += 1
                continue

            campos_comparables = ("nombre", "correo", "activo", "origen")
            if any(existente.get(campo) != nuevo[campo] for campo in campos_comparables):
                cliente.table("operarios_corporativos").update(nuevo).eq(
                    "id", existente["id"]
                ).execute()
                resultado.registros_actualizados += 1
            else:
                resultado.registros_sin_cambios += 1

        if correos_omitidos:
            resultado.detalle = (
                f"{correos_omitidos} correo(s) compartido(s) o ya asociado(s) "
                "a otro operario se han omitido para conservar el censo."
            )

        for numero, existente in por_numero.items():
            if numero not in vistos and existente.get("activo"):
                cliente.table("operarios_corporativos").update({
                    "activo": False,
                    "fecha_ultima_sincronizacion": ahora,
                    "updated_at": ahora,
                }).eq("id", existente["id"]).execute()
                resultado.registros_inactivados += 1

        cliente.table("sincronizaciones_operarios").update({
            **resultado.como_dict(),
            "estado": "COMPLETADA",
            "fin": datetime.now(timezone.utc).isoformat(),
        }).eq("id", auditoria_id).execute()
        return resultado
    except Exception as exc:
        resultado.errores += 1
        resultado.detalle = str(exc)
        cliente.table("sincronizaciones_operarios").update({
            **resultado.como_dict(),
            "estado": "ERROR",
            "fin": datetime.now(timezone.utc).isoformat(),
        }).eq("id", auditoria_id).execute()
        raise


def ejecutar_sincronizacion(
    cliente: Any,
    cargar_origen: Callable[[], Iterable[dict[str, Any] | OperarioOrigen]],
    ejecutado_por: str | None = None,
) -> ResultadoSincronizacion:
    """Punto de entrada compartido por la tarea diaria y la ejecución manual."""
    return sincronizar_operarios(cliente, cargar_origen(), ejecutado_por)
