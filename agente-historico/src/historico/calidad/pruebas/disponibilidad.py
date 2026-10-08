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

La graduacion por sol y el criterio `= 0` (con la rampa de arranque contada
aparte) estan explicados en `disponibilidad_detalle`; el cruce por BIN de 5 min
con la irradiancia, en `disponibilidad_bins`.

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

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    Contexto, Hallazgo, NoAplica, Serie, es_valor, indices_por_dia,
)
from historico.calidad.pruebas.disponibilidad_bins import (  # noqa: F401
    ContextoDisponibilidad, bin_de_emparejamiento, irradiancia_por_bin,
)
from historico.calidad.pruebas.disponibilidad_detalle import (  # noqa: F401
    _graduar, _lecturas_en_rampa, _nota, en_ventana_operativa,
)

TIPO = "inversor_sin_acoplar"


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
