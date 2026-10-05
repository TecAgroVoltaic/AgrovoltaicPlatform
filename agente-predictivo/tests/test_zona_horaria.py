"""
Guard de zona horaria: el codigo del agente no lee el reloj de la MAQUINA.

El sitio esta en Costa Rica y el servidor corre en UTC: `date.today()` o
`datetime.now()` sin zona dan el dia y la hora del servidor, que desde las 18:00
de Costa Rica ya es "manana". El error no se ve en una maquina con el reloj en
Costa Rica, solo en produccion o en CI, y ya paso (tests que fallaban fuera de
CR). Toda lectura del reloj lleva zona explicita: `datetime.now(ZoneInfo(config.TZ))`
o `pd.Timestamp.now(tz=config.TZ)`.

Busca texto, no analiza el programa. Si una linea necesita de verdad el reloj de
la maquina, se marca con `# zona-horaria: ok <motivo>`.
"""
import re
from pathlib import Path

FUENTE = Path(__file__).resolve().parents[1] / "src"
PERMITIDO = "# zona-horaria: ok"

RELOJ_DE_LA_MAQUINA = re.compile(
    r"date\.today\(\)"
    r"|datetime\.today\(\)"
    r"|datetime\.now\(\s*\)"
    r"|datetime\.utcnow\(\)"
    r"|Timestamp\.now\(\s*\)"
    r"|Timestamp\.today\(\)"
    r"|time\.localtime\("
)


def test_ningun_modulo_lee_el_reloj_de_la_maquina():
    # Given: todo el codigo fuente del agente
    hallazgos = []
    for ruta in sorted(FUENTE.rglob("*.py")):
        for n, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), 1):
            codigo = linea.split("#", 1)[0]
            if PERMITIDO in linea or not RELOJ_DE_LA_MAQUINA.search(codigo):
                continue
            hallazgos.append(f"{ruta.relative_to(FUENTE)}:{n}: {linea.strip()}")

    # Then: ninguna lectura del reloj sin zona explicita
    assert not hallazgos, "reloj de la maquina sin zona:\n" + "\n".join(hallazgos)
