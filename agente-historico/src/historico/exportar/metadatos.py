"""El bloque que encabeza el archivo. UNA redaccion, dos presentaciones. Puro.

Quien recibe estos archivos no siguio la conversacion donde se midieron las
trampas de este dato, asi que las trampas viajan ADENTRO. No es cortesia: las tres
primeras de `_AVISOS` estan medidas contra produccion y cada una hace equivocarse
en una direccion distinta (seis horas, un factor de mil, y confundir el arreglo
inclinado con el vertical, que es el eje entero del proyecto).

## El aviso que no es opcional: cuantas filas se quitaron

Si la consulta descarta filas, el archivo dice CUANTAS y POR QUE, aunque el filtro
sea el correcto y aunque no haya quitado ninguna. Un archivo que filtra callado es
indistinguible de uno donde no habia dato, y sobre esa lectura se toman decisiones:
es el error que este proyecto ya cometio cinco veces
(`docs/memoria/inconsistencias/silencio-leido-como-salud.md`). Por eso
`filas_descartadas` se escribe siempre, incluso valiendo cero, y por eso tambien se
dice cuando el filtro existia y NO se aplico.

Los avisos son CONDICIONALES a las columnas que lleve el archivo. Un archivo de
irradiancia que advierte sobre las unidades de energia enseña a saltearse el
bloque, y el bloque solo sirve si se lee.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from historico.analitica.catalogo import INCLINADO, VERTICAL
from historico.exportar import etiquetas, relaciones
from historico.exportar.consulta import Pedido
from historico.exportar.formatos import Formato

ZONA_HORARIA = "America/Costa_Rica (UTC-6)"
MARCA_COMENTARIO = "#"

# Las trampas medidas de este dato. El texto es el mismo en el `.csv` y en el `.mat`.
_TIEMPO_LOCAL = (
    "Las marcas de tiempo son hora LOCAL de Costa Rica (UTC-6) aunque la base las "
    "etiquete +00. NO les apliques conversion de zona horaria: hacerlo corre seis "
    "horas el archivo entero."
)
_ENERGIA_EN_KWH = (
    "Las columnas energia_*_wh estan en kWh PESE AL SUFIJO _wh, o sea un factor de "
    "mil. Medido por dos vias independientes contra produccion el 2026-08-31."
)
# Los angulos son los que valido Leo Cardinale el 2026-08-10; el detalle vive en
# docs/memoria/datos/geometria-sistema.md. Norte = 0 grados, sentido horario.
_QUE_ES_CADA_ARREGLO = (
    f"PV1 es el arreglo {INCLINADO.upper()} (20 grados de inclinacion, azimut 150) "
    f"y PV2 es el {VERTICAL.upper()} (90 grados, azimut 50). Los dos son bifaciales "
    f"de 1.420 Wp. Nunca leas PV1 y PV2 como si fueran intercambiables: la "
    f"comparacion entre esos dos montajes es el objeto del proyecto."
)
_VACIO_NO_ES_CERO = (
    "Un campo vacio es un NULL de la base, no un cero. Un 0 es una medicion de "
    "cero, que en este sistema es dato valido y frecuente (el inversor sin exportar)."
)
_NAN_NO_ES_CERO = (
    "NaN es un NULL de la base, no un cero. Un 0 es una medicion de cero, que en "
    "este sistema es dato valido y frecuente (el inversor sin exportar)."
)
_SIN_TIEMPO = (
    "Esta relacion NO tiene columna de tiempo: el rango pedido no se aplico y el "
    "archivo trae la relacion completa."
)
_METADATOS_IGNORADOS = (
    "Se pidio metadatos=0. En .mat los metadatos son nativos (esta misma struct) y "
    "no rompen `load`, asi que viajan igual."
)


@dataclass(frozen=True)
class Bloque:
    """Los metadatos ya redactados, listos para escribirse como texto o como struct."""

    campos: dict[str, str]
    avisos: tuple[str, ...]
    unidades: dict[str, str]


def _filas_descartadas(p: Pedido, descartadas: int) -> str:
    """El renglon del filtro. Nunca falta, ni siquiera cuando no quito nada."""
    if not p.filtro_disponible:
        return f"{descartadas} (esta relacion no lleva ningun filtro de calidad)"
    if not p.filtro:
        return (f"{descartadas}. El filtro `{p.filtro_disponible}` EXISTE para esta "
                f"relacion y NO se aplico: el archivo trae tambien las filas que el "
                f"analisis descarta")
    return f"{descartadas}, por `{p.filtro_disponible}`: {p.motivo_filtro}"


def _avisos(p: Pedido, formato: Formato, metadatos_ignorados: bool) -> tuple[str, ...]:
    """Las trampas que aplican a ESTE archivo, en orden de que tan caro es ignorarlas."""
    columnas = p.columnas
    avisos = []
    if p.acota_tiempo:
        avisos.append(_TIEMPO_LOCAL)
    else:
        avisos.append(_SIN_TIEMPO)
    if any(c.startswith("energia_") for c in columnas):
        avisos.append(_ENERGIA_EN_KWH)
    if any("pv1" in c or "pv2" in c or INCLINADO in c or VERTICAL in c for c in columnas):
        avisos.append(_QUE_ES_CADA_ARREGLO)
    avisos.append(_NAN_NO_ES_CERO if formato.solo_numeros else _VACIO_NO_ES_CERO)
    if metadatos_ignorados:
        avisos.append(_METADATOS_IGNORADOS)
    return tuple(avisos)


def construir(p: Pedido, conteos: dict, formato: Formato, ahora: datetime,
              metadatos_ignorados: bool = False) -> Bloque:
    """Redacta los metadatos del archivo. Puro: la hora entra, no se lee del reloj."""
    que_es = relaciones.describir(p.clave)
    campos = {
        "generado": ahora.strftime("%Y-%m-%d %H:%M:%S"),
        "origen": f"{p.clave} (relacion `{p.relacion}` de la Supabase PV de San Carlos)",
        "naturaleza": f"{que_es.naturaleza}: {relaciones.QUE_SIGNIFICA[que_es.naturaleza]}",
        "que_es": que_es.descripcion,
        "rango_desde": p.desde,
        "rango_hasta": f"{p.hasta} (EXCLUSIVO: el archivo no incluye ese dia)",
        "zona_horaria": ZONA_HORARIA,
        "filas": str(conteos["filas"]),
        "filas_descartadas": _filas_descartadas(p, conteos["descartadas"]),
        "columnas": str(len(p.columnas)),
    }
    unidades = {c: (etiquetas.describir(c)[1] or "") for c in p.columnas}
    return Bloque(campos, _avisos(p, formato, metadatos_ignorados), unidades)


def lineas(bloque: Bloque, columnas: tuple[str, ...]) -> list[str]:
    """El bloque como lineas de comentario, para el csv y el dat.

    Todas empiezan por `#`, que es lo que `pandas.read_csv(..., comment='#')`, R y
    gnuplot saltean solos. Las columnas se listan con su etiqueta y su unidad
    porque el nombre a secas (`temp_inclinado`) no dice ni que mide ni en que.
    """
    salida = [f"{MARCA_COMENTARIO} AgroVoltaic San Carlos, exportacion del historico "
              f"fotovoltaico"]
    salida += [f"{MARCA_COMENTARIO} {clave}: {valor}" for clave, valor in bloque.campos.items()]
    salida += [f"{MARCA_COMENTARIO} AVISO: {aviso}" for aviso in bloque.avisos]
    salida.append(f"{MARCA_COMENTARIO} ")
    for columna in columnas:
        etiqueta, unidad = etiquetas.describir(columna)
        sufijo = f" [{unidad}]" if unidad else ""
        salida.append(f"{MARCA_COMENTARIO}   {columna}{sufijo} = {etiqueta}")
    salida.append(f"{MARCA_COMENTARIO} ")
    return salida


def struct(bloque: Bloque) -> dict:
    """El bloque como struct de MATLAB. Mismos campos, sin el `#`."""
    return {**bloque.campos, "unidades": bloque.unidades, "avisos": list(bloque.avisos)}
