"""Variables de AgroDash por region: una por `sensor_tipo`, promedio de las cajas del sitio.

Las cajas se reparten entre San Carlos y Cartago con la MISMA regla de siempre (sufijo
" SC", `agrodash_api.region_de`, via `fuentes.agrodash.cajas_por_region`).

Cobertura: pedir el primer y ultimo dato por sensor serian cientos de llamadas a un
servidor ajeno. Se informa solo el ULTIMO dato de toda la API (`/readings/time-range`)
como `hasta` y `desde: null` (el `first` de la API es 2011, historico importado, y
como limite inferior solo estorba). Lo mismo que hace el inventario de exportacion.
"""
from __future__ import annotations

from historico import agrodash_api
from historico.catalogo_datos.etiquetas import GRUPOS, NO_MEDICION, describir
from historico.catalogo_datos.modelo import VariableDatos
from historico.fuentes.catalogo import AGRODASH_CARTAGO, AGRODASH_SC

REGION_DE_FUENTE = {AGRODASH_SC: agrodash_api.SAN_CARLOS, AGRODASH_CARTAGO: agrodash_api.CARTAGO}
_NOTA_CADENCIA = "cada sensor lee cada 1 a 3 min"
_NOTA_HASTA_GLOBAL = "'hasta' es el ultimo dato de toda la API, no de este sensor"


def _tipos(cajas: list[dict]) -> dict[str, list[str]]:
    """tipo -> cajas del sitio que lo tienen."""
    por_tipo: dict[str, list[str]] = {}
    for caja in cajas:
        for tipo in caja.get("sensores") or []:
            if tipo not in NO_MEDICION:
                por_tipo.setdefault(tipo, []).append(caja["nombre"])
    return por_tipo


def _nota(cajas: list[str], repetida: bool, tipo: str, por_tipo: bool) -> str:
    partes = [f"promedio de {len(cajas)} cajas" if len(cajas) > 1 else f"una caja ({cajas[0]})"]
    if repetida:
        partes.append(f"tipo «{tipo}» en AgroDash")
    partes.append(_NOTA_CADENCIA)
    if not por_tipo:
        partes.append(_NOTA_HASTA_GLOBAL)
    return "; ".join(partes)


def variables(fuente: str, cajas: list[dict], ultimo: str | None,
              ultimos_por_tipo: dict[str, str] | None = None) -> list[VariableDatos]:
    """Variables de una fuente AgroDash. `cajas`: [{nombre, sensores:[tipo]}] del sitio.
    `ultimos_por_tipo` (tipo -> ultimo dia) manda sobre el `ultimo` global de la API."""
    hasta_global = ultimo[:10] if ultimo else None
    por_tipo = _tipos(cajas)
    descritos = {tipo: describir(tipo) for tipo in por_tipo}
    vistas: dict[str, int] = {}
    for etiqueta, _, _ in descritos.values():
        vistas[etiqueta] = vistas.get(etiqueta, 0) + 1
    orden: dict[str, int] = {}
    out = []
    for tipo in sorted(por_tipo, key=lambda t: (descritos[t][2], descritos[t][0], t)):
        etiqueta, unidad, grupo = descritos[tipo]
        repetida = vistas[etiqueta] > 1
        orden[etiqueta] = orden.get(etiqueta, 0) + 1
        out.append(VariableDatos(
            fuente=fuente, clave=tipo, grupo=grupo, grupo_etiqueta=GRUPOS[grupo],
            etiqueta=f"{etiqueta} (variante {orden[etiqueta]})" if repetida else etiqueta,
            unidad=unidad, desde=None, cadencia_s=None,
            hasta=ultimos_por_tipo.get(tipo) if ultimos_por_tipo is not None else hasta_global,
            nota=_nota(por_tipo[tipo], repetida, tipo, ultimos_por_tipo is not None),
            sensor_tipo=tipo, cajas=tuple(sorted(por_tipo[tipo])), reloj="local",
        ))
    return out
