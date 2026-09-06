"""La cadencia de referencia POR TRAMO. Resuelve la trampa de las tres epocas.

El historico no tiene una cadencia: tiene tramos a 2 s (dic 2024), 1 min
(may 2025) y 5 min (nov 2025+), y ademas archivos sueltos a 6 s. Una prueba
temporal escrita contra un numero fijo no detecta nada, marca media base como
rota: con 300 s de referencia, diciembre 2024 entero (una muestra cada 2 s) seria
un dia de "intervalos anomalos", y con 15 s lo seria todo noviembre 2025 en
adelante.

La decision, en este orden y sin excepciones:

  1. **INFERIDA (local).** La moda de los saltos VECINOS de esa muestra, dentro de
     su mismo dia. Es la clave del modulo y esta explicada abajo.
  2. **INFERIDA (del dia).** Si la ventana local no da para una moda, la del dia
     entero. Es lo que hace `barrido.py` en SQL (`mode() WITHIN GROUP`), y se
     replica el criterio para que las dos capas no puedan discrepar.
  3. **INFERIDA_SERIE.** Si el dia no da ni para una moda (menos de dos muestras),
     la moda de la SERIE entera. Cubre el caso que antes cubria el metadato: un
     dia casi vacio sigue teniendo una referencia sensata, y sale de datos reales.
  4. **DECLARADA.** `intervalo_original_seg`, y solo cuando el dato NO alcanza para
     inferir nada (ver abajo por que no va primera).
  5. **NOMINAL.** Si nada de lo anterior aplica, la tasa nominal que fija el
     documento: 5 min lo electrico, 15 s la radiacion.

## Por que la moda es LOCAL y no del dia entero

Porque las dos cosas que hay que distinguir viven en la misma escala. Un dia que
arranca a 60 s y pasa a 300 s a media mañana no tiene un hueco: se reconfiguro el
logger, y ese hecho lo reporta `cambio_de_cadencia`. Pero un salto de 600 s dentro
de un tramo a 300 s SI es una fila perdida.

Con la moda del dia entero el tramo minoritario se juzga contra la cadencia del
mayoritario y todo el tramo sale como huecos falsos. Con una ventana corta cada
muestra se juzga contra sus vecinas: el tramo lento tiene por referencia su propia
cadencia, y el hueco suelto queda en minoria dentro de su ventana y se detecta.

Es lo que el titulo de este modulo dice desde el principio, POR TRAMO, y lo que
antes se intentaba conseguir leyendo el metadato.

## Por que `intervalo_original_seg` NO encabeza la lista

La primera version de este modulo la ponia primera, con un argumento correcto: el
metadato no se degrada cuando faltan muestras. El problema es que esa columna **no
contiene lo que el argumento supone**. Guarda la cadencia del CSV de ORIGEN, no la
del dato almacenado, y el ETL remuestrea.

Medido contra produccion el 2026-08-28 sobre `monitoreo_sc_electrico`:

  * 35.101 de 36.468 saltos consecutivos son de exactamente 300 s: la tabla esta
    remuestreada a 5 min uniformes.
  * En esos mismos pasos de 300 s, `intervalo_original_seg` promedia 241,8 s y
    baja hasta 2 s, porque describe el CSV de ORIGEN.
  * Con el umbral de 2x sobre la cadencia DECLARADA, **8.756 saltos salen como
    intervalo excesivo. Con la cadencia MEDIDA salen 65.** De la diferencia, 8.691
    son pasos normales de 300 s marcados como hueco solo porque el CSV de origen
    iba mas rapido: 2 x 62 s da 124 s, y un paso de 300 s lo supera sin ser nada.
  * En sentido contrario no se pierde nada: cero saltos que el criterio declarado
    detecte y el medido no.

O sea: priorizar el metadato reportaba como hueco uno de cada cuatro pasos de la
tabla principal. No es un ajuste de sensibilidad, es la diferencia entre una prueba
que senala 65 anomalias reales y una que ahoga esas 65 entre 8.691 falsas.

(Nota sobre el borde: un hueco de EXACTAMENTE 600 s, o sea una sola fila perdida en
un tramo de 300 s, no lo ve ninguno de los dos criterios, porque el documento pide
intervalos "mayores a dos veces" la tasa y 600 no es mayor que 600. Son 1.029 casos
y quien los detecta es `completitud.timestamps_faltantes`, que cuenta las muestras
que debieron estar en vez de mirar el tamano del salto.)

`intervalo_original_seg` sigue siendo util para OTRA cosa: saber con que cadencia
se tomo el CSV de origen, que es trazabilidad y es lo que alimenta el hallazgo
`cambio_de_cadencia` del barrido. No es la cadencia del dato guardado.

El origen viaja en el hallazgo. Que un tramo infiera 2 s no es un error, es
diciembre de 2024, y quien lea el hallazgo tiene que poder distinguirlo.

## El corte por dia no es un detalle de implementacion

El logger de San Carlos SOLO graba de dia. El salto de las 17:45 a las 05:45 del
dia siguiente son doce horas de noche, no un hueco de datos. Por eso los pasos se
calculan DENTRO de cada dia: sin ese corte, cada dia del historico empezaria con
un hueco falso de 43.000 segundos y la prueba de intervalos seria inutilizable.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import Serie, indices_por_dia

DECLARADA, INFERIDA, NOMINAL = "declarada", "inferida", "nominal"
# La moda de TODA la serie, para el dia que no da ni para una moda propia.
INFERIDA_SERIE = "inferida_serie"

# Cuantos saltos vecinos, a cada lado, entran en la moda LOCAL de una muestra.
# Con 5 la ventana son 11 saltos, que es lo que hace el criterio robusto en las
# dos direcciones a la vez: un hueco suelto queda en minoria y se detecta, y un
# cambio de regimen a media mañana no contamina al tramo vecino porque la ventana
# es corta. Ver el docstring del modulo.
MUESTRAS_DE_CONTEXTO = 5

# Cuantas veces tiene que repetirse un salto para creerle que es LA cadencia.
# Con 1 basta un salto suelto para definirse a si mismo como normal, y entonces
# ninguna serie corta puede tener un hueco: el valor que se quiere juzgar seria a
# la vez la vara con que se lo juzga.
REPETICIONES_PARA_CREER = 2

# Los intervalos se agrupan al segundo para sacar la moda: el sub-segundo de una
# marca es jitter del logger, no cadencia, y sin redondear la moda seria siempre
# el primer valor porque no habria dos iguales.
_PRECISION_SEG = 1


@dataclass(frozen=True)
class Paso:
    """El salto de tiempo entre una muestra y la anterior DEL MISMO DIA."""

    anterior: int
    segundos: float


@dataclass(frozen=True)
class Esperada:
    """La cadencia contra la que se juzga una muestra, y de donde salio."""

    segundos: float
    origen: str


def moda(valores, minimo_repeticiones: int = 1) -> float | None:
    """El valor mas repetido entre los positivos, redondeado al segundo.

    `minimo_repeticiones` es lo que separa "el dato me dice cual es la cadencia" de
    "el dato no alcanza para saberlo". Con dos muestras hay UN salto, y su moda es
    ese mismo salto: preguntarle al dato cual era la cadencia esperada devuelve el
    valor que se queria juzgar, asi que nada puede salir nunca anomalo. Exigiendo
    que el valor se repita, ese caso devuelve None y el llamador pasa al respaldo.
    """
    candidatos = [round(v, _PRECISION_SEG) for v in valores if v and v > 0]
    if not candidatos:
        return None
    valor, repeticiones = Counter(candidatos).most_common(1)[0]
    return valor if repeticiones >= minimo_repeticiones else None


def nominal(fuente: str) -> float:
    """La tasa de muestreo que el documento le asigna a la fuente."""
    return umbrales.CADENCIA_NOMINAL_POR_FUENTE.get(
        fuente, umbrales.CADENCIA_NOMINAL_POR_DEFECTO)


def pasos(serie: Serie) -> list[Paso | None]:
    """Para cada muestra, su salto respecto a la anterior del mismo dia."""
    salida: list[Paso | None] = [None] * serie.n
    for indices in indices_por_dia(serie).values():
        for previo, actual in zip(indices, indices[1:]):
            salida[actual] = Paso(
                anterior=previo,
                segundos=(serie.marcas[actual] - serie.marcas[previo]).total_seconds())
    return salida


# Donde se guarda el resultado ya calculado, dentro de la propia Serie.
_MEMO = "_cadencia_esperada"


def esperada(serie: Serie) -> list[Esperada]:
    """La cadencia de referencia de cada muestra. Ver el orden en el docstring.

    MEMOIZADA sobre la instancia, y no por optimizacion prematura: sin esto el
    barrido completo escalaba CUADRATICO con los dias. `dominante()` llama aca y
    `completitud` llama a `dominante()` una vez por dia, asi que cada dia recorria
    la serie ENTERA. Con 274 dias y 95.000 marcas son unos 26 millones de recalculos
    por prueba y por serie, medidos en 7,7 minutos de CPU para una corrida completa.
    El resultado solo depende de la serie, que es inmutable, asi que calcularlo mas
    de una vez no puede dar nada distinto.

    Se guarda con `object.__setattr__` porque `Serie` es un dataclass congelado. Es
    cache de instancia y no global a proposito: muere con la serie, no puede crecer
    sin fin ni servirle a nadie un resultado de otra corrida.
    """
    en_cache = getattr(serie, _MEMO, None)
    if en_cache is not None:
        return en_cache
    salida = _calcular_esperada(serie)
    object.__setattr__(serie, _MEMO, salida)
    return salida


def _calcular_esperada(serie: Serie) -> list[Esperada]:
    """La referencia LOCAL de cada muestra. Ver el orden en el docstring del modulo."""
    saltos = pasos(serie)
    de_la_serie = moda([p.segundos for p in saltos if p])
    respaldo = (Esperada(de_la_serie, INFERIDA_SERIE) if de_la_serie
                else Esperada(nominal(serie.fuente), NOMINAL))
    salida: list[Esperada] = [respaldo] * serie.n

    for indices in indices_por_dia(serie).values():
        del_dia = moda([saltos[i].segundos for i in indices if saltos[i]],
                       REPETICIONES_PARA_CREER)
        por_defecto = Esperada(del_dia, INFERIDA) if del_dia else respaldo
        vecinos = [saltos[i].segundos if saltos[i] else None for i in indices]
        for k, i in enumerate(indices):
            desde = max(0, k - MUESTRAS_DE_CONTEXTO)
            local = moda(vecinos[desde:k + MUESTRAS_DE_CONTEXTO + 1],
                         REPETICIONES_PARA_CREER)
            if local:
                salida[i] = Esperada(local, INFERIDA)
                continue
            # El dato no alcanza para inferir. Aca, y SOLO aca, el metadato aporta
            # algo que la serie no tiene: con un unico salto no hay forma de saber
            # si son 601 s de cadencia o 300 s con una fila perdida.
            declarada = serie.intervalos[i] if serie.intervalos else None
            salida[i] = (Esperada(float(declarada), DECLARADA)
                         if declarada and declarada > 0 else por_defecto)
    return salida


def dominante(serie: Serie, indices) -> Esperada:
    """La cadencia de referencia del conjunto de muestras que se le pase.

    La usan las pruebas que razonan sobre un dia entero (cuantas lecturas debia
    haber) y no muestra a muestra.
    """
    referencias = esperada(serie)
    valor = moda([referencias[i].segundos for i in indices])
    if valor is None:
        return Esperada(nominal(serie.fuente), NOMINAL)
    # El origen que se reporta es el MAYORITARIO entre las muestras que sostienen
    # ese valor. La version anterior prefería `DECLARADA` en cuanto una sola
    # muestra lo usara, y eso etiquetaba como "declarada" a un dia entero que en
    # realidad se infirio del dato: la etiqueta viaja en el hallazgo y tiene que
    # decir de donde salio el numero de verdad.
    origenes = [referencias[i].origen for i in indices
                if round(referencias[i].segundos, _PRECISION_SEG) == valor]
    return Esperada(valor, Counter(origenes).most_common(1)[0][0]
                    if origenes else NOMINAL)


def tramos(serie: Serie) -> list[dict]:
    """Los tramos de cadencia constante de la serie, para el detalle del hallazgo.

    Un dia que cambia de 60 s a 300 s a media mañana produce dos tramos, y verlo
    es lo que distingue "el logger se reconfiguro" de "el logger se cayo".
    """
    referencias = esperada(serie)
    salida: list[dict] = []
    for _, indices in sorted(indices_por_dia(serie).items()):
        for i in indices:
            actual, marca = referencias[i], serie.marcas[i]
            if salida and salida[-1]["cadencia_seg"] == actual.segundos:
                salida[-1]["hasta"] = marca
                salida[-1]["muestras"] += 1
                continue
            salida.append({"desde": marca, "hasta": marca, "muestras": 1,
                           "cadencia_seg": actual.segundos, "origen": actual.origen})
    return salida
