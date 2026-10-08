"""La severidad, la nota y la rampa de arranque de cada hallazgo de disponibilidad.

Se usa a traves de `disponibilidad`, que arma el hallazgo con estas piezas.

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
"""
from __future__ import annotations

from datetime import date, datetime

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import AVISO, GRAVE, Serie, es_valor


def en_ventana_operativa(marca: datetime) -> bool:
    """¿La marca cae en las 07:00-17:00 de R3? Hora LOCAL, sin convertir zona."""
    return umbrales.VENTANA_OPERATIVA_DESDE <= marca.time() < umbrales.VENTANA_OPERATIVA_HASTA


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
