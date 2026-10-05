"""Fig. 8 bis: el diagrama de carpeta, dia x hora del dia.

Una matriz con un renglon por dia y 24 columnas (una por hora local). Es el grafico
que muestra de un vistazo la forma del dia a lo largo de meses: donde empieza y
termina la generacion, que dias se cayo el logger, como se corre el mediodia solar.

## Dos reglas que este modulo NO puede romper

**1. La hora ya es local. No se convierte.** Las columnas son `timestamptz`
etiquetadas `+00`, pero lo guardado es la hora local de Costa Rica. Verificado
contra el dato: la irradiancia media pico cae en la hora 11-12 y se anula en la 5 y
la 17, y `ventana_solar` da amanecer 05:26 y atardecer 17:20 para esas fechas.
`extract(hour from ts)` YA devuelve la hora local; meter un `AT TIME ZONE` corre
seis horas TODO el heatmap y lo convierte en una mentira con forma de dato.

**2. Una celda sin dato no es una celda en cero.** De noche la generacion es cero
de verdad; en un dia que el logger no grabo no hay dato. Si las dos se pintaran
igual, un mes caido se veria como un mes de noche permanente. Por eso la celda vacia
va como `None` y ademas viaja `conteo`, con cuantas lecturas la sostienen: el cero
con `n > 0` es medido, el `None` con `n = 0` es ausencia.

La celda en Wh integra el salto real de cada lectura, acotado por
`fuente.TECHO_SALTO_SEG`. Ese techo es el que evita que la ultima lectura del
atardecer, cuyo salto siguiente es el de toda la noche, se lleve doce horas de
generacion a la hora 17.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from historico import db
from historico.analitica import catalogo, fuente, resultado
from historico.analitica.ventana import DIA, Ventana

HORAS_DEL_DIA = 24
# Techo de renglones. El sentido del diagrama de carpeta es ver el historico ENTERO
# a resolucion de dia (hoy son 569 dias), asi que el limite es holgado a proposito:
# solo frena ventanas absurdas, como la que abre `ventana.crear()` sin `hasta`.
MAXIMO_DIAS = 1200

PROMEDIO, INTEGRAL = "promedio", "integral"
AGREGACIONES = (PROMEDIO, INTEGRAL)
SEGUNDOS_POR_HORA = 3600.0
# Integrar en el tiempo solo significa algo para una potencia o una densidad de
# potencia. Una temperatura por hora no es ninguna magnitud, asi que no se ofrece.
UNIDAD_INTEGRADA = {"W": "Wh", "W/m2": "Wh/m2"}

FORMATO_DIA = "%Y-%m-%d"


def unidad_de(var: catalogo.Variable, agregacion: str) -> str:
    """Valida la agregacion pedida y devuelve la unidad que tendra la celda."""
    if agregacion not in AGREGACIONES:
        raise ValueError(f"agregacion {agregacion!r}; validas: {', '.join(AGREGACIONES)}")
    if agregacion == PROMEDIO:
        return var.unidad
    if var.unidad not in UNIDAD_INTEGRADA:
        raise ValueError(
            f"integrar {var.clave!r} ({var.unidad}) en el tiempo no da ninguna "
            f"magnitud; solo se integra {', '.join(UNIDAD_INTEGRADA)}"
        )
    return UNIDAD_INTEGRADA[var.unidad]


def _celdas(v: Ventana, o: fuente.Origen,
            agregacion: str) -> dict[tuple[str, int], dict]:
    """Una fila por (dia, hora local) con dato. Indexada por esa pareja.

    `extract(hour ...)` sin conversion de zona: ver la regla 1 del docstring.
    """
    celda = (f"avg(valor)" if agregacion == PROMEDIO
             else f"sum(valor * segundos) / {SEGUNDOS_POR_HORA}")
    filas = db.query(
        f"""
        WITH lecturas AS ({fuente.lecturas_pesadas(o)})
        SELECT ts::date::text              AS dia,
               extract(hour from ts)::int  AS hora,
               ({celda})::double precision AS valor,
               count(valor)                AS n
          FROM lecturas
         GROUP BY 1, 2
        """,
        v.sql,
    )
    return {(f["dia"], f["hora"]): f for f in filas}


def reducir(dias: list[datetime], celdas: dict[tuple[str, int], dict],
            unidad: str) -> dict:
    """La matriz completa, con los huecos marcados. Pura: se prueba sin base de datos.

    `matriz[i][h]` es el valor de la hora `h` del dia `i`, o `None` si no hay dato.
    `conteo[i][h]` dice cuantas lecturas lo sostienen, que es lo que distingue un
    cero medido (de noche) de un dia que el logger no grabo.
    """
    matriz: list[list[float | None]] = []
    conteo: list[list[int]] = []
    valores: list[float] = []
    lecturas = 0
    for t in dias:
        dia = t.strftime(FORMATO_DIA)
        fila_valor: list[float | None] = []
        fila_n: list[int] = []
        for hora in range(HORAS_DEL_DIA):
            celda = celdas.get((dia, hora), {})
            valor, n = celda.get("valor"), int(celda.get("n") or 0)
            fila_valor.append(valor)
            fila_n.append(n)
            lecturas += n
            if valor is not None:
                valores.append(valor)
        matriz.append(fila_valor)
        conteo.append(fila_n)
    return {
        "dias": [t.strftime(FORMATO_DIA) for t in dias],
        "horas": list(range(HORAS_DEL_DIA)),
        "matriz": matriz,
        "conteo": conteo,
        # El rango es para la escala de color. Va como metrica para que una carpeta
        # sin una sola lectura devuelva None y no un cero que pintaria todo igual.
        "rango": {
            "minimo": resultado.metrica(min(valores) if valores else None, lecturas, unidad),
            "maximo": resultado.metrica(max(valores) if valores else None, lecturas, unidad),
        },
        "celdas_con_dato": len(valores),
        "celdas_totales": len(dias) * HORAS_DEL_DIA,
    }


def diagrama(v: Ventana, variable: str, agregacion: str = PROMEDIO) -> dict:
    """Fig. 8 bis: matriz dia x hora local de una variable dentro de la ventana.

    `agregacion` es 'promedio' (el valor tipico de esa hora) o 'integral' (cuanta
    energia entro en esa hora, para potencias y densidades de potencia).
    """
    var, o = catalogo.obtener(variable), fuente.origen(variable)
    unidad = unidad_de(var, agregacion)
    diaria = replace(v, granularidad=DIA)
    fuente.validar_tamano(diaria, MAXIMO_DIAS)
    # Las celdas y la confianza son independientes: van a la vez y el endpoint pasa
    # de dos viajes al pooler a uno. Ver `db.en_paralelo`.
    confianza, celdas = db.en_paralelo(
        lambda: fuente.confianza_de(v, [variable]),
        lambda: _celdas(v, o, agregacion),
    )
    matriz = reducir(fuente.rejilla(diaria), celdas, unidad)
    return resultado.sobre(
        v, confianza,
        variable={"clave": variable, "etiqueta": var.etiqueta, "unidad": unidad},
        agregacion=agregacion, techo_salto_seg=fuente.TECHO_SALTO_SEG, **matriz,
    )
