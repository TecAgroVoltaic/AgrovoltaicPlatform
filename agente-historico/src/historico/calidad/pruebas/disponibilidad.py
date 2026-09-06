"""Familia 5: disponibilidad del EQUIPO. ¿La planta estaba funcionando?

Las cuatro familias anteriores preguntan por el DATO (¿esta completo? ¿es
posible? ¿las marcas se sostienen? ¿es raro?). Esta pregunta por el SISTEMA, y la
diferencia no es academica: **un dia con el inversor caido es un dia con dato
BUENO sobre un equipo MALO**, y hasta ahora el codigo no podia decir esa frase.

Nace de R3 de Leo Cardinale (verbatim en `docs/referencia/respuestas-lcv-consultas.md`):

    "vale la pena que el sistema detecte cuando se da este caso durante el dia;
     digamos entre 7am-5pm; porque quiere decir que el sistema no esta tratando
     de acoplarse a la red AC y entonces vale la pena ir a revisarlo."

La medicion completa que sostiene cada decision de este modulo esta en
`docs/referencia/medicion-inversor-caido.md`. Lo que hay que saber para leer el
codigo:

* El 0 de `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac` **es dato valido**:
  es la lectura exacta de un inversor que no se acoplo. Cuando el AC esta en 0, la
  potencia DC es 0 en el 100 % de los casos (7.872 de 7.872 lecturas), y en el
  97,0 % de ellas la tension de string pasa de 50 V: el arreglo estaba energizado
  y a plena luz, y el inversor no enganchaba.
* No es una excepcion rara: **41 de 202 dias evaluables (20,3 %) tienen la planta
  parada bajo sol**, medido por una via independiente (energia, no voltaje). Esta
  regla captura 41 de 41. Es lo que mueve el performance ratio de 0,830 a 0,648.

## La irradiancia gradua la severidad; NO filtra el hallazgo

Es la decision central del modulo y esta medida. Usar `GHI >= 300` como filtro
duro (la variante C de la medicion) pierde **8 dias que no tienen irradiancia, 3
de ellos apagones de dia entero** (2025-05-07, 2025-05-26 y 2026-01-05), y los
pierde **en silencio**, porque en SQL `NULL >= 300` es falso y la lectura no se
marca. El de 2026-01-05 se cae por 8 W/m2: el inversor estuvo caido sus 113
lecturas con un pico de GHI de 292, y a 292 W/m2 un arreglo de 2,84 kWp deberia
estar dando del orden de 700 W. Un detector de averias que se apaga solo en los
46 dias sin irradiancia y no lo dice es peor que no tenerlo.

Ademas, como filtro casi no aporta: la condicion de hora ya hacia el trabajo
(2.728 lecturas con hora + irradiancia contra 2.747 con irradiancia sola).

Como GRADUADOR si aporta, y mucho: separa 2.728 lecturas / 69 dias donde el sol
es indiscutible de 3.251 donde "estaba nublado" es una explicacion admisible. Esa
separacion es informacion real. Tirar la mitad del hallazgo para conseguirla, no.

Por eso: se marca por HORA, se gradua por SOL, y cuando no hay sol medido se
marca igual con el motivo `sin_irradiancia`. **Nunca se calla.**

## El criterio es `= 0`, y la rampa de arranque se cuenta sin marcarse

R3 dice "deberian ser MAYORES A CERO", y todo el rendimiento medido de la regla
(6.330 lecturas en 95 dias, 41 de 41 dias de planta parada capturados) sale de
ese criterio exacto. Al bajar a 0 el piso de rango de las dos columnas aparecio
la pregunta obvia: hay 82 lecturas de `voltaje_vac` entre 0 y 100 V y 120 de
`frecuencia_hz` entre 0 y 55 Hz, y son reales (99,79 V con 28,0 Hz y 0 W de
salida es una de ellas): el inversor despertando. ¿No deberia marcarlas tambien?

No, y por tres razones medidas: esas lecturas ya caen por el tercer disyunto
(`potencia_total_wac = 0`) siempre que esa columna exista; ocurren cerca del
amanecer (05:26), o sea casi siempre FUERA de la ventana 07:00-17:00; y un
inversor arrancando no es un inversor averiado, asi que marcarlo seria la falsa
alarma que el propio Leo pidio evitar. Ensanchar el criterio ademas invalidaria
el rendimiento medido sin volver a medirlo.

Lo que si hace falta es que el silencio no se lea como salud: cada hallazgo dice
cuantas lecturas de rampa tuvo el dia (`lecturas_en_rampa`), para que nadie
confunda "distinto de cero" con "acoplado y exportando". Queda SIN MEDIR, y
anotado como tal en `umbrales.RAMPA_DE_ARRANQUE_POR_VARIABLE`: un dia con rampa
dentro de 07-17 y sin ningun cero no genera hallazgo.

## El cruce con la irradiancia va por BIN de 5 min, jamas por timestamp exacto

Es el hallazgo central del proyecto y se reprodujo otra vez aca. Emparejando por
igualdad de timestamp se encuentra irradiancia para **818 de las 6.330** lecturas
marcadas (se pierde el 87,1 %); con `date_bin` de 5 minutos se emparejan **5.979
(94,5 %)**. Las dos tablas no comparten reloj: lo electrico va a 5 min y la
radiacion a 15 s con jitter. `tests/test_calidad_disponibilidad.py` fija esta
propiedad para que el error no se pueda volver a cometer.

## De donde tiene que salir la serie

**De donde el 0 SOBREVIVA.** Hoy `v_sc_electrico_corregido` hace
`CASE WHEN voltaje_vac < 100 OR > 280 THEN NULL`, o sea que la capa "corregida"
borra exactamente los ceros que esta prueba existe para contar: 7.872 ceros en la
tabla cruda, **0** en la vista. Una prueba leida de ahi devolveria cero hallazgos
siempre y aprobaria por construccion.

Esa vista se esta corrigiendo (los tres `CASE` de las variables AC se eliminan,
no se reajustan: cualquier piso por encima de 0 vuelve a borrar el dato de R3).
Por eso la prueba NO se declara `no_aplica` contra el origen corregido: el
`origen` viaja en el detalle de cada hallazgo para que se pueda auditar de donde
salio, y `tests/test_calidad_disponibilidad.py` cubre el caso desde el crudo.
Mientras la vista siga anulando ceros, esta prueba sobre la vista sale vacia; el
sintoma es una serie AC con muchos NULL dentro de 07-17 y ni un cero.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    AVISO, GRAVE, Contexto, Hallazgo, NoAplica, Serie, es_valor, indices_por_dia,
)

TIPO = "inversor_sin_acoplar"


@dataclass(frozen=True)
class ContextoDisponibilidad(Contexto):
    """El `Contexto` comun mas la irradiancia con que se gradua la severidad.

    Va como SUBCLASE y no como campo nuevo del contrato porque la irradiancia la
    necesita una sola familia y el contrato lo comparten las cinco: quien corre el
    catalogo entero puede pasar esto y las otras cuatro pruebas ni se enteran.

    El mapa esta indexado por BIN de 5 minutos (`bin_de_emparejamiento`), no por
    marca: ver el docstring del modulo. Lo arma `irradiancia_por_bin()`.

    Que no venga NO es un error: con un `Contexto` pelado la prueba sigue marcando
    y sale toda con motivo `sin_irradiancia`, que es el comportamiento que protege
    los 3 apagones de dia entero. Degradar hacia el silencio seria lo contrario.
    """

    irradiancia_por_bin: Mapping[datetime, float] = field(default_factory=dict)


def bin_de_emparejamiento(marca: datetime) -> datetime:
    """La ventana de 5 min a la que pertenece una marca.

    Replica exactamente `date_bin('5 minutes', ts, timestamp '2024-01-01 00:00')`
    de la medicion: con origen a medianoche y un tamaño que divide a la hora,
    truncar el minuto al multiplo de 5 da el mismo bin sin depender del origen.

    ZONA HORARIA: no se convierte nada, igual que en todo el paquete. La marca es
    el reloj de pared local y el bin tambien.
    """
    tamaño = umbrales.BIN_DE_EMPAREJAMIENTO_SEG // 60
    return marca.replace(minute=marca.minute - marca.minute % tamaño,
                         second=0, microsecond=0)


def irradiancia_por_bin(marcas, valores) -> dict[datetime, float]:
    """Promedia una serie de radiacion por ventana de 5 min: el mapa del contexto.

    Es el `avg(irradiancia_incidente) GROUP BY date_bin('5 minutes', ...)` de la
    medicion, hecho en memoria. Promedio y no primera lectura: en una ventana de
    5 min entran ~1,5 muestras de radiacion (medido), y quedarse con una sola
    haria que el mismo bin diera distinto segun el orden de llegada.
    """
    suma: dict[datetime, float] = {}
    cuenta: dict[datetime, int] = {}
    for marca, valor in zip(marcas, valores):
        if not es_valor(valor):
            continue
        ventana = bin_de_emparejamiento(marca)
        suma[ventana] = suma.get(ventana, 0.0) + valor
        cuenta[ventana] = cuenta.get(ventana, 0) + 1
    return {ventana: suma[ventana] / cuenta[ventana] for ventana in suma}


def en_ventana_operativa(marca: datetime) -> bool:
    """¿La marca cae en las 07:00-17:00 de R3? Hora LOCAL, sin convertir zona."""
    return umbrales.VENTANA_OPERATIVA_DESDE <= marca.time() < umbrales.VENTANA_OPERATIVA_HASTA


def inversor_sin_acoplar(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Las tres variables AC en CERO dentro de la ventana 07:00-17:00.

    Un hallazgo por dia y por variable, graduado por la irradiancia concurrente:

        grave   alguna de las lecturas caidas tuvo GHI >= 300 W/m2 (sol pleno:
                el inversor tenia que estar generando y no lo estaba)
        aviso   todas las que se pudieron medir estaban por debajo del umbral
        aviso   con motivo `sin_irradiancia` cuando NINGUNA se pudo medir

    El corte por dia se hereda del store: la PK de `hallazgos_calidad` es
    (fecha, fuente, variable, tipo). Las tres variables comparten `tipo` sin
    pisarse porque difieren en `variable`, y eso es deliberado: `voltaje_vac`
    marca el doble de dias que las otras dos porque `frecuencia_hz` y
    `potencia_total_wac` son NULL al 100 % de nov-2025 a feb-2026 (la columna no
    vino en el CSV). Fundir las tres en una sola fila esconderia ese hecho.

    `grave` si ALGUNA lectura del dia tuvo sol pleno, no si lo tuvieron todas: es
    lo que reproduce los 69 dias medidos, y es el criterio honesto (que el sol se
    haya nublado a las 15:00 no explica que el inversor estuviera caido a las 12).
    """
    if serie.variable.clave not in umbrales.VARIABLES_DE_ACOPLE_AC:
        raise NoAplica(
            f"{serie.variable.clave} no dice si el inversor se acoplo; R3 habla de "
            f"{', '.join(umbrales.VARIABLES_DE_ACOPLE_AC)}")

    # Un `Contexto` pelado no trae irradiancia y la prueba corre igual: ver el
    # docstring de `ContextoDisponibilidad`.
    mapa = getattr(contexto, "irradiancia_por_bin", None) or {}
    umbral = umbrales.IRRADIANCIA_QUE_EXIGE_GENERACION_WM2

    salida: list[Hallazgo] = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        # `es_valor(v) and v == 0`: un NULL NO es un cero. Los cuatro meses sin
        # columna AC son `parametro_faltante`, que es otro problema y ya tiene su
        # prueba; contarlos aca inventaria apagones que nadie observo.
        caidas = [i for i in indices
                  if es_valor(serie.valores[i]) and serie.valores[i] == 0
                  and en_ventana_operativa(serie.marcas[i])]
        if not caidas:
            continue

        medidas = [ghi for ghi in (mapa.get(bin_de_emparejamiento(serie.marcas[i]))
                                   for i in caidas) if es_valor(ghi)]
        con_sol = [ghi for ghi in medidas if ghi >= umbral]
        severidad, motivo = _graduar(medidas, con_sol)
        rampa = _lecturas_en_rampa(serie, indices)

        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo=TIPO, severidad=severidad, n_afectadas=len(caidas),
            detalle={
                "de": len(indices),
                "fraccion": round(len(caidas) / len(indices), 4),
                "motivo": motivo,
                "ventana": f"{umbrales.VENTANA_OPERATIVA_DESDE:%H:%M}-"
                           f"{umbrales.VENTANA_OPERATIVA_HASTA:%H:%M}",
                "umbral_ghi_wm2": umbral,
                "lecturas_con_sol": len(con_sol),
                "lecturas_con_poco_sol": len(medidas) - len(con_sol),
                "lecturas_sin_irradiancia": len(caidas) - len(medidas),
                "ghi_max_wm2": round(max(medidas), 1) if medidas else None,
                "primera": serie.marcas[min(caidas)],
                "ultima": serie.marcas[max(caidas)],
                "emparejamiento": f"bin de {umbrales.BIN_DE_EMPAREJAMIENTO_SEG} s",
                "origen": serie.origen,
                "nota": _nota(motivo, dia),
                **rampa,
            }))
    return salida


def _lecturas_en_rampa(serie: Serie, indices) -> dict:
    """Las lecturas de ARRANQUE del dia dentro de la ventana, contadas aparte.

    Son las que valen mas que 0 pero menos que el piso de acople (82 de
    `voltaje_vac` bajo 100 V y 120 de `frecuencia_hz` bajo 55 Hz en todo el
    historico): el inversor despertando, con 0 W de salida. NO se marcan como
    falta de disponibilidad, por las razones medidas que estan en
    `umbrales.RAMPA_DE_ARRANQUE_POR_VARIABLE`.

    Pero se CUENTAN, porque el riesgo real no es que la regla las marque de mas:
    es que alguien lea "distinto de cero" como "acoplado y exportando". Este
    renglon en el detalle impide esa lectura sin inventar un umbral sin medir.
    """
    piso = umbrales.RAMPA_DE_ARRANQUE_POR_VARIABLE.get(serie.variable.clave)
    if piso is None:
        return {}
    n = sum(1 for i in indices
            if es_valor(serie.valores[i]) and 0 < serie.valores[i] < piso
            and en_ventana_operativa(serie.marcas[i]))
    return {"lecturas_en_rampa": n, "piso_de_acople": piso,
            "nota_rampa": f"lecturas sobre 0 y bajo {piso:g}: el inversor arrancando, "
                          f"con 0 W de salida. NO cuentan como sistema acoplado, y "
                          f"tampoco como averia: no se marcan, se muestran"}


def _graduar(medidas: list[float], con_sol: list[float]) -> tuple[str, str]:
    """La severidad, unica decision que toma la irradiancia en esta prueba."""
    if not medidas:
        # SIN dato de sol se marca IGUAL. Filtrando se perderian 8 dias en
        # silencio, 3 de ellos apagones de dia entero.
        return AVISO, umbrales.MOTIVO_SIN_IRRADIANCIA
    if con_sol:
        return GRAVE, umbrales.MOTIVO_BAJO_SOL
    return AVISO, umbrales.MOTIVO_IRRADIANCIA_BAJA


def _nota(motivo: str, dia: date) -> str:
    """Que hay que entender al leer este hallazgo, en una linea."""
    if motivo == umbrales.MOTIVO_SIN_IRRADIANCIA:
        porque = ("la irradiancia anterior al 2025-07-01 es NULL por decision del "
                  "equipo" if dia < umbrales.IRRADIANCIA_UTIL_DESDE else
                  "no hubo lectura de radiacion en las ventanas de 5 min afectadas")
        return (f"el inversor no se acoplo en horario operativo y NO se pudo graduar "
                f"por sol: {porque}. Se reporta igual, sin graduar, porque callarlo "
                f"perderia apagones reales de dia entero")
    if motivo == umbrales.MOTIVO_BAJO_SOL:
        return ("el inversor no se acoplo con sol pleno: el DATO es correcto, lo que "
                "fallo es el EQUIPO. Hay que ir a revisar la planta, no la serie")
    return ("el inversor no se acoplo pero la irradiancia era baja: puede ser una "
            "desconexion legitima por poca luz. Se reporta como aviso, no se descarta")
