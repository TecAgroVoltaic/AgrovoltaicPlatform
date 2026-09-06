"""Que es cada relacion descargable y si su dato es crudo o corregido. Puro.

Dos consumidores y una sola redaccion: el catalogo que la consola dibuja
(`inventario`) y el bloque que encabeza cada archivo (`metadatos`). Si cada uno
escribiera la suya, el archivo y la pantalla terminarian afirmando cosas distintas
sobre el mismo dato, y el que se queda viejo es siempre el que nadie mira.

Las descripciones estan escritas contra la definicion VIVA de las vistas
(`sql/schema.sql` + `sql/003_electrico_sin_falsos_positivos.sql`), no contra lo que
se creia que hacian: la vista corregida estuvo un tiempo sin corregir las cuatro
columnas de energia (`docs/memoria/inconsistencias/vista-corregida-no-corrige.md`),
asi que aca se afirma solo lo que la definicion dice hoy.
"""
from __future__ import annotations

from dataclasses import dataclass

CRUDO = "crudo"
CORREGIDO = "corregido"
MODELADO = "modelado"
DERIVADO = "derivado"

# Como leer cada naturaleza, para quien recibe el archivo y no siguio la discusion.
QUE_SIGNIFICA = {
    CRUDO: "dato tal como se ingesto, sin ninguna correccion aplicada",
    CORREGIDO: "dato con las correcciones del equipo aplicadas en la vista; "
               "el crudo sigue intacto en su tabla",
    MODELADO: "dato CALCULADO por un modelo, no medido por ningun sensor",
    DERIVADO: "dato calculado a partir de otras relaciones de esta misma base",
}


@dataclass(frozen=True)
class Descripcion:
    """Que es una relacion, en una linea, y de que naturaleza es su dato."""

    etiqueta: str
    naturaleza: str
    descripcion: str


DESCRIPCIONES: dict[str, Descripcion] = {
    "electrico_crudo": Descripcion(
        "Electrico (crudo)", CRUDO,
        "Lecturas del inversor tal como se ingestaron: incluye las filas del "
        "piranometro que se mezclaron en el CSV (hasta 26.503.162 W de potencia en "
        "un arreglo de 1.420 Wp) y el 85,0 C del sensor de temperatura desconectado."),
    "electrico_corregido": Descripcion(
        "Electrico (corregido)", CORREGIDO,
        "Lo mismo que la cruda con los valores fisicamente imposibles anulados a "
        "NULL columna por columna (potencia 0 a 5.000 W, tension DC 0 a 600 V, "
        "temperaturas 10 a 80 C y el 85,0 exacto). No borra ni una fila."),
    "radiacion_15s_cruda": Descripcion(
        "Radiacion 15 s (cruda)", CRUDO,
        "Piranometros tal como llegaron: con el offset nocturno constante de "
        "-38,845 y con todo lo anterior a julio de 2025, que el equipo descarto "
        "porque el sensor estaba mal antes de esa correccion."),
    "radiacion_corregida": Descripcion(
        "Radiacion 15 s (corregida)", CORREGIDO,
        "El offset nocturno y los negativos llevados a 0, el albedo fuera de 0 a 1 "
        "anulado y todo lo previo al 2025-07-01 en NULL. La bandera `valido` marca "
        "ese corte."),
    "radiacion_calibrada": Descripcion(
        "Radiacion calibrada + cielo despejado", CORREGIDO,
        "La corregida mas el GHI de cielo despejado de pvlib, el indice kt* y la "
        "bandera `qc_ok`. OJO: el factor de calibracion vigente es 1,0 porque el "
        "sensor no tiene constante conocida, asi que los W/m2 son los del sensor "
        "sin escalar."),
    "radiacion_clearsky": Descripcion(
        "Cielo despejado (modelo pvlib)", MODELADO,
        "GHI que habria con cielo despejado en San Carlos segun pvlib. Es la "
        "referencia contra la que se mide kt*, y es un MODELO: ningun sensor lo midio."),
    "radiacion_poa": Descripcion(
        "Irradiancia en el plano de los arreglos (modelo)", MODELADO,
        "Irradiancia transpuesta al plano de cada arreglo con pvlib, bifacial y "
        "solo cara frontal. Modelada, y con la ecuacion de transposicion todavia "
        "pendiente de que la confirme Hugo."),
    "performance": Descripcion(
        "Performance por lectura", DERIVADO,
        "Potencia de cada arreglo contra su POA, emparejadas por bin de 5 minutos, "
        "con el PR de esa lectura. El PR que vale es el DIARIO y mensual de "
        "`/analitica/rendimiento` (asi lo fijo Leo Cardinale), no este punto a punto."),
    "diccionario": Descripcion(
        "Diccionario de variables", DERIVADO,
        "Definiciones cargadas en la base. No tiene columna de tiempo, y sus "
        "nombres son de COLUMNA CRUDA: no coinciden con las claves del catalogo de "
        "analisis."),
}


def describir(clave: str) -> Descripcion:
    """La descripcion de una relacion. Una desconocida no rompe el archivo."""
    return DESCRIPCIONES.get(clave, Descripcion(clave, DERIVADO, ""))
