"""Familia 2: validez fisica. ¿El numero es POSIBLE?

Las nueve pruebas del documento se reducen a tres funciones genericas, y esa
reduccion es el punto: "irradiancia < 0", "RH < 0", "viento < 0" y "precipitacion
< 0" son la MISMA prueba con distinto limite, y escribirlas cuatro veces solo
garantiza que la quinta se olvide. El limite sale de
`catalogo.obtener(clave).minimo/.maximo`, que es la fuente de verdad de los
rangos y ademas la allowlist de SQL. La trazabilidad de que linea del PDF
corresponde a que entrada del catalogo esta en `umbrales.LIMITES_DEL_DOCUMENTO`.

## Cuatro de las nueve pruebas no tienen dato, y se reportan igual

RH, temperatura ambiente, viento y precipitacion no existen en ninguna tabla: el
catalogo las registra con `fuente_ausente` y su motivo. La prueba se implementa
igual y el corredor la marca `sin_fuente`. Omitirlas seria peor que no tenerlas:
un informe de validez fisica sin renglon de humedad se lee como una humedad
correcta, y nadie va a ir a buscar la prueba que falta.

## Esta familia SOLO corre contra el crudo, y se niega a fingir lo contrario

Las vistas corregidas ya convierten a NULL todo lo que cae fuera de rango. Leida
contra ellas, esta familia devuelve cero valores imposibles porque la vista los
borro, no porque el sensor estuviera bien: un aprobado falso POR CONSTRUCCION, y
del peor tipo, porque es indistinguible de un aprobado real.

Por eso las tres pruebas se declaran `no_aplica` cuando la serie viene de una
vista corregida, en vez de devolver la lista vacia. La forma correcta de correrlas
es `consultas.serie(clave, ..., crudo=True)`, que usa el `origen_crudo` que
registra el catalogo: contra el crudo si aparecen los 26.503.162 W de
`potencia_pv1_w` que dejaron las filas mezcladas del piranometro.

`kt_star` es el unico caso con fuente y sin crudo: es un cociente que la vista
calcula al vuelo. Se mide igual (la vista no le recorta el rango) pero la serie
llega con origen DERIVADA y el hallazgo lo dice, porque un numero calculado y una
lectura de sensor no son la misma evidencia.

## El 0 de las tres variables AC ya NO es una violacion de rango

R3 de Leo Cardinale: el 0 de `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac`
**es dato valido**, la lectura exacta de un inversor que no se acoplo. Con el
rango 100-280 V puesto, esos ceros salian `fuera_de_rango` GRAVE en 238 dias y
declaraban malo un dato perfecto; lo que estaba mal era el equipo. Eso ahora lo
mide `disponibilidad.py`, en un eje que no toca la calidad del dato.

La exencion se escribe aca ADEMAS de en el catalogo, y a proposito: es una
decision sobre un valor concreto (el 0) y no sobre un rango, asi que sobrevive a
cualquier limite que el catalogo vuelva a fijar para esas columnas. Todo lo demas
sigue cayendo igual: un voltaje negativo, que si es fisicamente imposible, sigue
siendo `bajo_minimo_fisico`.
"""
from __future__ import annotations

from datetime import timedelta

from historico.analitica.catalogo import RADIACION
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    CORREGIDA, GRAVE, Contexto, Hallazgo, NoAplica, Serie, es_valor,
    hallazgos_por_dia, indices_por_dia,
)

_PREFIJO_IRRADIANCIA = "irradiancia_"


def _exigir_dato_sin_corregir(serie: Serie) -> None:
    """Corta antes de medir si la serie ya paso por la capa de correccion."""
    if serie.origen == CORREGIDA:
        raise NoAplica(
            f"{serie.variable.clave} llega de una vista corregida, que ya anulo lo "
            f"que cae fuera de rango: la prueba saldria vacia por construccion. "
            f"Pedi la serie con `crudo=True`")


def _cero_declarado_valido(serie: Serie, valor) -> bool:
    """El 0 de las tres variables AC: dato valido por R3, no violacion de rango.

    Es el inversor sin acoplar, y lo mide `disponibilidad.inversor_sin_acoplar`
    como problema del EQUIPO. Marcarlo ademas aca contaria el mismo hecho dos
    veces y, peor, lo contaria como dato malo: hundiria la confianza de meses
    cuya energia es exacta.
    """
    return valor == 0 and serie.variable.clave in umbrales.VARIABLES_DE_ACOPLE_AC


def bajo_minimo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Valores por debajo del minimo fisico de la variable.

    El 0 de las variables AC queda exento (ver el docstring del modulo). Un valor
    genuinamente imposible, como un voltaje negativo, sigue cayendo.
    """
    _exigir_dato_sin_corregir(serie)
    limite = serie.variable.minimo
    if limite is None:
        raise NoAplica(f"{serie.variable.clave} no tiene minimo fisico en el catalogo")
    afectados = [i for i, v in enumerate(serie.valores)
                 if es_valor(v) and v < limite and not _cero_declarado_valido(serie, v)]
    # La exencion viaja en el hallazgo SOLO de las variables que la tienen: quien
    # lea un `bajo_minimo_fisico` de `voltaje_vac` tiene que saber que el 0 no
    # esta contado ahi, y quien lea uno de irradiancia no necesita el ruido.
    exento = ({"exento": "el 0 es dato valido (R3, inversor sin acoplar): lo mide "
                         "`disponibilidad`, no la validez fisica"}
              if serie.variable.clave in umbrales.VARIABLES_DE_ACOPLE_AC else {})
    return hallazgos_por_dia(
        serie, afectados, "bajo_minimo_fisico", limite=limite,
        unidad=serie.variable.unidad, origen=serie.origen, **exento,
        detalle_del_dia=lambda idx: {
            "peor": min(serie.valores[i] for i in idx)})


def sobre_maximo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Valores por encima del maximo fisico de la variable."""
    _exigir_dato_sin_corregir(serie)
    limite = serie.variable.maximo
    if limite is None:
        raise NoAplica(f"{serie.variable.clave} no tiene maximo fisico en el catalogo")
    afectados = [i for i, v in enumerate(serie.valores) if es_valor(v) and v > limite]
    return hallazgos_por_dia(
        serie, afectados, "sobre_maximo_fisico", limite=limite,
        unidad=serie.variable.unidad, origen=serie.origen,
        detalle_del_dia=lambda idx: {
            "peor": max(serie.valores[i] for i in idx)})


def irradiancia_de_noche(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Irradiancia apreciable fuera de la ventana de sol de ese dia.

    El documento pide contrastar contra la ALTURA SOLAR. La altura solar del
    sitio ya esta resuelta dia por dia en `ventana_solar` (pvlib, via
    `calidad/sol.py`), asi que la prueba compara la marca contra el amanecer y el
    atardecer de SU dia en vez de rehacer la geometria y arriesgarse a que las
    dos capas discrepen.

    ZONA HORARIA: no se convierte nada. Las marcas y la ventana solar estan las
    dos en el reloj de pared local de Costa Rica, que es la convencion del store.
    Meter un `AT TIME ZONE` correria seis horas la comparacion y convertiria
    todas las mañanas del historico en irradiancia nocturna.
    """
    _exigir_dato_sin_corregir(serie)
    if serie.variable.familia != RADIACION or not serie.variable.clave.startswith(
            _PREFIJO_IRRADIANCIA):
        raise NoAplica(f"{serie.variable.clave} no es una irradiancia medida")
    if not contexto.ventanas_solares:
        raise NoAplica("sin `ventana_solar` no hay contra que contrastar la noche")

    margen = timedelta(minutes=umbrales.MARGEN_CREPUSCULO_MINUTOS)
    tolerado = umbrales.IRRADIANCIA_NOCTURNA_TOLERADA_WM2
    afectados, evaluados = [], 0
    for dia, indices in indices_por_dia(serie).items():
        ventana = contexto.ventanas_solares.get(dia)
        if ventana is None:
            continue
        evaluados += 1
        for i in indices:
            valor = serie.valores[i]
            if not es_valor(valor) or valor <= tolerado:
                continue
            if ventana.amanecer - margen <= serie.marcas[i] <= ventana.atardecer + margen:
                continue
            afectados.append(i)
    if not evaluados:
        raise NoAplica("ningun dia de la serie tiene ventana solar calculada")

    return hallazgos_por_dia(
        serie, afectados, "irradiancia_nocturna", severidad=GRAVE,
        tolerado_wm2=tolerado, origen=serie.origen,
        margen_crepusculo_min=umbrales.MARGEN_CREPUSCULO_MINUTOS,
        nota="radiacion apreciable con el sol bajo el horizonte: sensor, reloj o "
             "calibracion, nunca el cielo",
        detalle_del_dia=lambda idx: {
            "peor": max(serie.valores[i] for i in idx),
            "primera": serie.marcas[min(idx)], "ultima": serie.marcas[max(idx)]})
