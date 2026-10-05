"""
Parseo determinista del horizonte temporal (sin LLM).

`parse_horizon("en 2 horas", ahora)` -> 7200 (segundos). Es una funcion PURA y
testeable: convierte expresiones en espanol a segundos, sin llamar a ningun
modelo. El LLM tambien sabe traducir el horizonte (ver prompts.py), pero tener
esta version determinista permite testear el sistema sin red y sirve de respaldo.

Reglas de referencia:
  "media hora"                 -> 1800   (30 min)
  "una hora" / "en 1 hora"     -> 3600   (60 min)
  "hora y media" / "90 min"    -> 5400   (90 min)
  "2 horas" / "dos horas"      -> 7200   (120 min)
  "en 45 min"                  -> 2700   (45 min)
  "un cuarto de hora"          -> 900    (15 min)

Lanza ValueError si la expresion es ambigua o no se puede interpretar
(p.ej. "pronto", "en un rato", "" o un numero sin unidad como "en 2"), o si
contiene VARIAS expresiones de la misma unidad que compiten entre si
("una hora o dos horas") — eso es una duda, no un horizonte.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime

# Palabras-numero enteras (suficiente para horizontes de pronostico).
_PALABRAS_NUM = {
    "un": 1, "uno": 1, "una": 1,
    "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12,
}
# Alternancia para regex: numeros escritos con palabra (dos|tres|...).
_NUM_RE = "|".join(sorted(_PALABRAS_NUM, key=len, reverse=True))

# Unidades: horas y minutos con sus variantes/abreviaturas.
_RE_HORAS = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|hs?|h)\b")
_RE_MIN = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:minutos?|mins?|min|m)\b")

# Frases compuestas (se resuelven antes que la regla general).
_RE_HORA_Y_MEDIA = re.compile(r"(?:(" + _NUM_RE + r"|\d+)\s+)?horas?\s+y\s+media\b")
_RE_MEDIA_HORA = re.compile(r"\bmedia\s+hora\b")
_RE_CUARTO_HORA = re.compile(r"\b(?:un\s+|una\s+)?cuarto\s+de\s+hora\b")
# Palabra-numero seguida de unidad (dos horas, una hora, tres min).
_RE_PALABRA_NUM = re.compile(r"\b(" + _NUM_RE + r")\b")


def _normalizar(texto: str) -> str:
    """minusculas, sin acentos, espacios colapsados."""
    t = texto.lower().strip()
    t = "".join(c for c in unicodedata.normalize("NFD", t)
                if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t)


def _num(token: str | None) -> float:
    """Convierte un token numerico (digito o palabra) a float; None -> 1."""
    if token is None:
        return 1.0
    if token in _PALABRAS_NUM:
        return float(_PALABRAS_NUM[token])
    return float(token.replace(",", "."))


def parse_horizon(texto: str, ahora: datetime | None = None) -> int:
    """Traduce una expresion de horizonte en espanol a SEGUNDOS.

    `ahora` se acepta para futuras expresiones absolutas ("hoy a las 3pm"); las
    expresiones de duracion (el caso actual) no lo necesitan. Lanza ValueError si
    la expresion es ambigua o no interpretable.
    """
    if not texto or not texto.strip():
        raise ValueError("horizonte vacio")

    t = _normalizar(texto)
    total_min = 0.0
    encontrado = False

    # 1) "hora y media", "una hora y media", "2 horas y media" -> n*60 + 30
    m = _RE_HORA_Y_MEDIA.search(t)
    if m:
        total_min += _num(m.group(1)) * 60 + 30
        encontrado = True
        t = t[:m.start()] + " " + t[m.end():]   # consumir para no recontar "hora"

    # 2) "media hora" -> 30
    if _RE_MEDIA_HORA.search(t):
        total_min += 30
        encontrado = True
        t = _RE_MEDIA_HORA.sub(" ", t)

    # 3) "cuarto de hora" / "un cuarto de hora" -> 15
    if _RE_CUARTO_HORA.search(t):
        total_min += 15
        encontrado = True
        t = _RE_CUARTO_HORA.sub(" ", t)

    # 4) Palabras-numero -> digitos (dos horas -> 2 horas), para la regla general.
    t = _RE_PALABRA_NUM.sub(lambda mo: str(_PALABRAS_NUM[mo.group(1)]), t)

    # 5+6) Horas y minutos explicitos. Se recolectan ANTES de sumar para poder
    # rechazar expresiones que COMPITEN: dos menciones de la misma unidad
    # ("una hora o dos horas", "en 1 hora, mejor 2 horas") no son un horizonte,
    # son una duda -> ambiguo. En cambio 1 hora + 1 min ("1 hora 30 min") es un
    # compuesto legitimo y se suma. Esto es critico porque parse_horizon PISA la
    # conversion del LLM: sumar dos "horas" produciria un horizonte falso.
    horas = list(_RE_HORAS.finditer(t))          # "2 horas", "1 hora", "1.5 h"
    minutos = list(_RE_MIN.finditer(t))          # "45 min", "30 minutos", "90 m"
    if len(horas) > 1 or len(minutos) > 1:
        raise ValueError(
            f"horizonte con varias expresiones de la misma unidad (ambiguo): {texto!r}")
    for mo in horas:
        total_min += float(mo.group(1).replace(",", ".")) * 60
        encontrado = True
    for mo in minutos:
        total_min += float(mo.group(1).replace(",", "."))
        encontrado = True

    if not encontrado or total_min <= 0:
        raise ValueError(f"horizonte ambiguo o no interpretable: {texto!r}")

    return int(round(total_min * 60))
