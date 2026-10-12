"""Tool `navegar_consola` — "¿donde veo ...?" -> una tarjeta que lleva a la seccion.

Contrato §4.3, §5 y §6 (`docs/referencia/contratos-asistente-plataforma.md`).
Elige la seccion de `secciones.json` (copia en `historico.conocimiento`) por
coincidencia con su etiqueta, lo que muestra y su descripcion, o toma la
`seccion` explicita. Los `params` se filtran a los que esa seccion declara (el
frontend vuelve a filtrar con lista blanca). Sin buena coincidencia NO hay
`_navegacion`: vuelve el catalogo para que el LLM elija y llame de nuevo.
"""
from __future__ import annotations

from historico import conocimiento
from historico.conocimiento import elegir_seccion, secciones
from historico.conocimiento.secciones import SeccionConsola

VERSION = 1
MAX_ALTERNATIVAS = 3
_NOTA = "La interfaz pinta la tarjeta con el enlace; contale al usuario qué va a ver ahí."
_NOTA_ELEGIR = ("Ninguna sección coincide con claridad: elegí una de `secciones` y volvé a "
                "llamar con `seccion`, o preguntale al usuario.")

SCHEMA = {
    "name": "navegar_consola",
    "description": (
        "Lleva al usuario a la seccion de la consola donde ve lo que pide ('¿donde veo "
        "las alertas?', 'llevame al PR por dia de agosto'). Devuelve la seccion elegida "
        "y la interfaz pinta un enlace. `params` solo admite los que la seccion declara "
        "(p. ej. desde/hasta en YYYY-MM-DD, hasta exclusivo)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "objetivo": {"type": "string",
                         "description": "Que quiere ver el usuario, en sus palabras."},
            "seccion": {"type": "string",
                        "description": "Id de seccion si ya se sabe (p. ej. 'comparativa')."},
            "params": {"type": "object", "additionalProperties": True,
                       "description": "Parametros de la vista (desde, hasta, variables, ...)."},
        },
        "required": ["objetivo"],
        "additionalProperties": False,
    },
}


def _valor(v: object) -> str | None:
    if isinstance(v, (list, tuple)):
        v = ",".join(str(x) for x in v if x not in (None, ""))
    return None if v is None or str(v).strip() == "" else str(v).strip()


def _filtrar(s: SeccionConsola, params: dict | None) -> tuple[dict[str, str], list[str]]:
    declarados = s.nombres_params()
    validos = {k: _valor(v) for k, v in (params or {}).items() if k in declarados}
    descartados = sorted(k for k in (params or {}) if k not in declarados)
    return {k: v for k, v in validos.items() if v is not None}, descartados


def _detalle(params: dict[str, str]) -> str:
    resto = dict(params)
    partes = []
    if "desde" in resto or "hasta" in resto:
        partes.append(f"{resto.pop('desde', '…')} a {resto.pop('hasta', '…')} (exclusivo)")
    partes.extend(f"{k}: {v}" for k, v in resto.items())
    return " · ".join(partes)


def _breve(s: SeccionConsola) -> dict:
    return {"id": s.id, "etiqueta": s.etiqueta, "descripcion": s.descripcion}


def _navegar(s: SeccionConsola, muestra: str | None, params: dict | None,
             alternativas: list[SeccionConsola]) -> dict:
    filtrados, descartados = _filtrar(s, params)
    etiqueta = f"{s.etiqueta} · {muestra}" if muestra else s.etiqueta
    navegacion = {"version": VERSION, "seccion": s.id, "etiqueta": etiqueta,
                  "params": filtrados}
    if filtrados:
        navegacion["detalle"] = _detalle(filtrados)
    salida = {
        "seccion": {**_breve(s), "ruta": s.ruta, "muestra": list(s.muestra),
                    "params_admitidos": [p.nombre for p in s.params]},
        "params": filtrados,
        "alternativas": [_breve(a) for a in alternativas[:MAX_ALTERNATIVAS]],
        "_navegacion": navegacion,
        "nota": _NOTA,
    }
    if descartados:
        salida["params_descartados"] = descartados
    return salida


def run(objetivo: str, seccion: str | None = None, params: dict | None = None) -> dict:
    if not secciones.catalogo():
        return {"objetivo": objetivo, "nota": conocimiento.NO_DISPONIBLE}
    elegida, otras = elegir_seccion.elegir(objetivo)
    explicita = secciones.por_id(seccion) if seccion else None
    if explicita is not None:
        muestra = elegida.muestra if elegida and elegida.seccion.id == explicita.id else None
        resto = [c.seccion for c in ([elegida] if elegida else []) + otras
                 if c.seccion.id != explicita.id]
        return _navegar(explicita, muestra, params, resto)
    if elegida is None:
        return {"objetivo": objetivo, "seccion_pedida": seccion,
                "secciones": [_breve(s) for s in secciones.catalogo()], "nota": _NOTA_ELEGIR}
    return _navegar(elegida.seccion, elegida.muestra, params, [c.seccion for c in otras])
