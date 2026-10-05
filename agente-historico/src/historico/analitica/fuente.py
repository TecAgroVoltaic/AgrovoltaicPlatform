"""De donde sale cada variable, sobre que rejilla se agrega y cuanto cubre su fila.

Lo comparten los tres modulos de graficos (`series`, `distribucion`, `carpeta`)
porque los tres necesitan exactamente lo mismo antes de poder consultar nada:
resolver la variable a una tabla CORREGIDA, armar la rejilla de buckets que se va
a dibujar, y traer el bloque de confianza acotado a las columnas que el grafico
usa. Tenerlo en un solo lugar no es orden: es que el que se olvide de actualizar
su copia es el que termina leyendo una tabla cruda, donde `potencia_pv1_w` llega a
26.503.162 W en un arreglo de 1.420 Wp.

## El peso temporal de una fila es el SALTO REAL, no un metadato

Para integrar (irradiacion mensual, celda de carpeta en Wh) hace falta saber cuanto
tiempo cubre cada lectura. `intervalo_original_seg` NO sirve: guarda la cadencia del
CSV original, no la de la fila guardada. Medido contra la base: en
`monitoreo_sc_electrico` 35.101 de 36.468 saltos reales son exactamente 300 s
mientras esa columna va de 2 a 330 s en esas mismas filas, y en `radiacion_sc_15s`
un salto real de 15 s convive con valores de 2 a 300 s en la columna. No hay
correspondencia fiable.

Lo que no puede mentir es el salto al siguiente registro
(`lead(timestamp) - timestamp`), y funciona igual en las dos tablas sin casos
especiales. Con un techo, que no es opcional: ver `TECHO_SALTO_SEG`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from historico.analitica import catalogo
from historico.analitica.ventana import DIA, HORA, MES, SEMANA, Ventana, VentanaInvalida
from historico.calidad import contexto

# Techo de puntos por grafico. Una ventana de 19 meses por hora son ~13.000 puntos
# que ni el navegador dibuja ni el ojo lee; `ventana.granularidad_sugerida` ya elige
# bien sola, asi que esto solo frena a quien fuerce la granularidad a mano.
MAXIMO_PUNTOS = 1500

# Techo del peso temporal de una fila, en segundos. De noche el logger para: el
# salto mas grande medido es de 43.800 s, y sin acotar una sola fila del atardecer
# se integraria como doce horas de irradiancia, con lo que un dia solo inventaria
# mas energia que un mes entero.
#
# 900 s son TRES VECES la cadencia nominal mas lenta del historico (los bins de
# 5 min del regimen de 2025-11 en adelante, que con jitter llegan a 330 s). Por
# encima de eso el salto ya no es una muestra sino un hueco de registro, y el tiempo
# que falta no lo midio nadie. Medido sobre la irradiancia real, mover el techo
# entre 600 y 1.800 s cambia el total mensual menos del 1 %: el numero no es fragil,
# lo que importa es que exista.
#
# NO se deriva de `config.FACTOR_HUECO` aunque el factor coincida. Ese umbral es
# politica de QC y se ajusta; que retocarlo moviera en silencio los kWh reportados
# seria un acoplamiento caro de descubrir.
TECHO_SALTO_SEG = 900

_SALTO_ACOTADO = (f'least(coalesce(extract(epoch FROM lead("timestamp") '
                  f'OVER (ORDER BY "timestamp") - "timestamp"), 0), {TECHO_SALTO_SEG})')

# Clave de bucket, la misma en Python y en SQL para que se puedan cruzar.
FORMATO_BUCKET = "%Y-%m-%dT%H:%M"
FORMATO_BUCKET_SQL = 'YYYY-MM-DD"T"HH24:MI'

# relacion -> filtro SQL extra. Literales de este modulo, nunca entrada del usuario.
# `valido AND qc_ok` no es opcional en radiacion: sin el entran los valores previos
# a julio 2025, que el equipo descarto por calibracion.
_FILTRO: dict[str, str] = {
    "v_sc_electrico_corregido": "",
    "v_sc_radiacion_calibrada": " AND valido AND qc_ok",
    "radiacion_sc_poa": "",
}


class FuenteAusente(ValueError):
    """La variable esta en el catalogo pero ninguna tabla la contiene.

    Hereda de ValueError para que la API la traduzca a 400 como el resto de los
    errores de parametro. `codigo` la identifica sin leer el texto.
    """

    codigo = "fuente_ausente"


@dataclass(frozen=True)
class Origen:
    """De donde se lee una variable, ya validada contra el catalogo."""

    clave: str
    relacion: str
    columna: str
    filtro: str


def origen(clave: str) -> Origen:
    """Resuelve la variable a tabla y columna. Puerta UNICA a nombres de SQL.

    Ninguna funcion de graficos interpola un nombre que no haya salido de aca: la
    allowlist del catalogo es la defensa contra inyeccion, no documentacion.
    """
    var = catalogo.obtener(clave)
    if not var.disponible:
        raise FuenteAusente(f"{clave!r} no se puede analizar: {var.fuente_ausente}")
    return Origen(clave, var.relacion, var.columna, _FILTRO[var.relacion])


def donde(o: Origen) -> str:
    """El FROM/WHERE comun a todas las consultas. Consume DOS parametros: desde y hasta."""
    return (f'FROM {o.relacion} WHERE "timestamp" >= %s AND "timestamp" < %s '
            f'AND {o.columna} IS NOT NULL{o.filtro}')


def lecturas_pesadas(o: Origen) -> str:
    """Subconsulta que le pone a cada lectura el tiempo que REALMENTE cubre.

    Va como CTE porque una funcion de ventana no puede vivir dentro de un agregado.
    Expone `ts`, `valor` y `segundos`. Consume dos parametros: desde y hasta.
    """
    return (f'SELECT "timestamp" AS ts, {o.columna} AS valor, '
            f'{_SALTO_ACOTADO} AS segundos {donde(o)}')


def validar_tamano(v: Ventana, maximo: int = MAXIMO_PUNTOS) -> None:
    """Rechaza la ventana ANTES de consultar si su granularidad la haria ilegible."""
    buckets = {HORA: v.dias * 24, DIA: v.dias, SEMANA: v.dias / 7, MES: v.dias / 28}
    if buckets[v.granularidad] > maximo:
        raise VentanaInvalida(
            "ventana_demasiado_fina",
            f"{v.dias} dias por {v.granularidad} pasan del techo de {maximo} puntos; "
            f"usa una granularidad mas gruesa o acorta la ventana",
        )


def rejilla(v: Ventana) -> list[datetime]:
    """TODOS los buckets de la ventana, tengan o no lecturas. Pura, sin base.

    Se arma aca y no con lo que devolvio el SQL porque una consulta solo puede
    mostrar los buckets que existen, y los que faltan son justamente el dato: el
    historico tiene 274 dias de un calendario de 569.
    """
    inicio = datetime(v.desde.year, v.desde.month, v.desde.day)
    fin = datetime(v.hasta.year, v.hasta.month, v.hasta.day)
    if v.granularidad == MES:
        buckets, t = [], inicio.replace(day=1)
        while t < fin:
            buckets.append(t)
            t = (t.replace(day=28) + timedelta(days=4)).replace(day=1)
        return buckets
    if v.granularidad == SEMANA:
        inicio -= timedelta(days=inicio.weekday())   # date_trunc('week') es lunes
    paso = {HORA: timedelta(hours=1), DIA: timedelta(days=1),
            SEMANA: timedelta(weeks=1)}[v.granularidad]
    buckets, t = [], inicio
    while t < fin:
        buckets.append(t)
        t += paso
    return buckets


def confianza_de(v: Ventana, claves: list[str]) -> dict:
    """El bloque de fiabilidad acotado a las variables de las que depende el grafico.

    Los nombres se traducen con `catalogo.para_confianza`, que es la puerta unica:
    `hallazgos_calidad` guarda `irradiancia_incidente` y el catalogo expone
    `irradiancia_incidente_wm2`, asi que pasar la clave cruda encontraba CERO
    hallazgos de los 321 reales y devolvia una confianza impecable justo cuando la
    irradiancia estaba rota.

    Y se dice aparte cuales variables el barrido no vigila: que no tengan hallazgos
    no significa que esten limpias, significa que nadie las miro, y hoy las dos
    cosas se ven igual.
    """
    variables, fuente = catalogo.para_confianza(*claves)
    desde, hasta = v.sql
    bloque = contexto.confianza(desde, hasta, variables, fuente)
    ciegas = catalogo.sin_vigilancia(*claves)
    if ciegas:
        bloque["sin_vigilancia"] = {
            "variables": ciegas,
            "nota": ("el barrido de calidad NO revisa estas variables una por una: "
                     "que no tengan hallazgos no dice que esten bien, dice que nadie "
                     "las miro. Para ellas la confianza solo mide cobertura de dias "
                     "y hallazgos de dia entero"),
        }
    return bloque


def peso_temporal(salto_seg: float | None) -> float:
    """Cuanto tiempo cubre una lectura, dado su salto al siguiente registro.

    Es LA REGLA escrita en Python, y `_SALTO_ACOTADO` es su traduccion literal a
    SQL. Las dos existen porque la agregacion tiene que pasar en la base (sumar
    94.868 pesos en el proceso seria traerse la tabla) y una funcion de ventana no
    se puede escribir en Python, pero el criterio y su techo se prueban aca sin
    base de datos. Comparten la constante `TECHO_SALTO_SEG`, y la prueba de forma
    de `lecturas_pesadas` verifica que el SQL siga diciendo lo mismo.

    Sin salto siguiente (la ultima fila de la ventana) el peso es 0: no se sabe
    cuanto cubrio y no se inventa. Sobre miles de filas es despreciable.
    """
    return min(salto_seg or 0.0, float(TECHO_SALTO_SEG))
