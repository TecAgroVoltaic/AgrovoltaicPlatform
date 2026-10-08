"""La cadencia de referencia de cada muestra (memoizada), la dominante y los tramos."""
from __future__ import annotations

from collections import Counter

from historico.calidad.pruebas.cadencia.primitivas import (
    _PRECISION_SEG,
    DECLARADA,
    INFERIDA,
    INFERIDA_SERIE,
    MUESTRAS_DE_CONTEXTO,
    NOMINAL,
    REPETICIONES_PARA_CREER,
    Esperada,
    moda,
    nominal,
    pasos,
)
from historico.calidad.pruebas.contrato import Serie, indices_por_dia

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
