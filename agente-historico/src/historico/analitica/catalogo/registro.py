"""El registro completo, en su orden, con la guarda que lo verifica al importar."""
from __future__ import annotations

from historico.analitica.catalogo.registro_electrico import _REGISTRO_ELECTRICO
from historico.analitica.catalogo.registro_radiacion import _REGISTRO_RADIACION
from historico.analitica.catalogo.variable import AMBIENTAL, Variable
from historico.analitica.catalogo.vigiladas import _VIGILADAS

_REGISTRO_AUSENTES: tuple[Variable, ...] = (
    # ── Lo que el documento pide y la base NO tiene ──────────────────────────
    # Se registran para que las pruebas de validez fisica las reporten como
    # `sin_fuente` en vez de omitirlas: el hueco tiene que verse.
    Variable("humedad_relativa_pct", "Humedad relativa", "%", AMBIENTAL,
             minimo=0, maximo=100,
             fuente_ausente="ninguna tabla la contiene; el bloque abiotico (Fliwer, "
                            "nodos ESP32) no esta ingestado"),
    Variable("temperatura_ambiente_c", "Temperatura ambiente", "C", AMBIENTAL,
             minimo=-5, maximo=50,
             fuente_ausente="ninguna tabla la contiene; solo hay temperatura de "
                            "MODULO, que no es lo mismo"),
    Variable("velocidad_viento_ms", "Velocidad del viento", "m/s", AMBIENTAL, minimo=0,
             fuente_ausente="no hay anemometro en el sitio ni en las tablas del documento"),
    Variable("precipitacion_mm", "Precipitacion", "mm", AMBIENTAL, minimo=0,
             fuente_ausente="no hay pluviometro en el sitio ni en las tablas del documento"),
)

_REGISTRO: tuple[Variable, ...] = (*_REGISTRO_ELECTRICO, *_REGISTRO_RADIACION, *_REGISTRO_AUSENTES)

CATALOGO: dict[str, Variable] = {v.clave: v for v in _REGISTRO}


def _verificar_registro() -> None:
    """Guarda de importacion contra el olvido que ya se cometio una vez.

    Olvidar `relacion_cruda` en una variable no revienta nada: la deja como
    "derivada", sus hallazgos dejan de encontrarse y su confianza sale impecable.
    Es un fallo silencioso y en la direccion peligrosa. Paso de verdad con las tres
    temperaturas, que perdian sus 837 hallazgos reales por usar el constructor
    completo en vez del helper.

    Se comprueba al importar y no en un test porque el modulo es un REGISTRO: el
    error no esta en la logica sino en un dato mal escrito, y tiene que doler al
    escribirlo, no cuando alguien acuerde correr la suite.
    """
    huerfanas = [v.clave for v in _REGISTRO
                 if v.disponible and v.relacion_cruda is None and v.clave != "kt_star"]
    if huerfanas:
        raise RuntimeError(
            f"variables con fuente pero sin `relacion_cruda`: {', '.join(huerfanas)}. "
            f"Si de verdad son derivadas, exceptualas aca explicando por que"
        )
    perdidas = _VIGILADAS - {v.clave_calidad for v in _REGISTRO if v.clave_calidad}
    if perdidas:
        raise RuntimeError(
            f"el barrido vigila {', '.join(sorted(perdidas))} pero ninguna variable "
            f"del catalogo llega a ese nombre: sus hallazgos serian invisibles"
        )


_verificar_registro()
