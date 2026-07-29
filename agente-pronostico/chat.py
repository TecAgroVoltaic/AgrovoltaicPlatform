"""
Chat interactivo con el agente de pronóstico (REPL).

    .venv/bin/python chat.py        (o:  python chat.py  si el venv está activo)

Escribí preguntas en español; el agente entiende → llama la herramienta
`forecast` → redacta la respuesta. Cada pregunta es una vuelta independiente
(el agente no guarda memoria entre preguntas). Salir: 'salir', 'exit', Ctrl-D.

Datos: usa el caché local (data/irradiancia_sc.parquet). El "ahora" del
pronóstico es el ÚLTIMO dato del caché, no la hora real. (Esta máquina no
alcanza la DB viva de Cartago por la ACL de Tailscale; los datos en vivo
corren en el sidecar de la EC2.)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Permite `python chat.py` sin haber hecho `pip install -e .`
sys.path.insert(0, str(Path(__file__).parent / "src"))

from pronostico import config, data  # noqa: E402

LINEA = "═" * 66
SALIR = {"salir", "exit", "quit", "q"}


def main() -> int:
    # Importar config ya corrió load_dotenv(); la clave del .env llega a os.environ.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Falta ANTHROPIC_API_KEY (en el entorno o en .env). El agente la "
              "necesita para entender la pregunta y redactar la respuesta.",
              file=sys.stderr)
        return 1

    try:
        serie = data.cargar_serie()
    except FileNotFoundError:
        print("No encuentro el caché (data/irradiancia_sc.parquet). Generalo con "
              "acceso a AgroDash:  AGRODASH_PASSWORD=... python -m pronostico.data",
              file=sys.stderr)
        return 1

    ahora = serie.index.max()
    print(LINEA)
    print("  CHAT · Agente de pronóstico de irradiancia · San Carlos")
    print(LINEA)
    print(f'  Modelo: {config.MODEL}')
    print(f'  "Ahora" del agente = {ahora:%Y-%m-%d %H:%M} (último dato del caché)')
    print("  Escribí tu pregunta. Salir: 'salir' / Ctrl-D.")
    print("─" * 66)

    from pronostico.agent.agent import ForecastAgent  # import diferido (carga el SDK)
    agente = ForecastAgent()

    while True:
        try:
            pregunta = input("\n🧑  vos > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nchau 👋")
            return 0
        if pregunta.lower() in SALIR:
            print("chau 👋")
            return 0
        if not pregunta:
            continue
        try:
            print(f"🤖  {agente.ask(pregunta)}")
        except Exception as e:  # noqa: BLE001
            print(f"⚠️   Error consultando al modelo: {e}")


if __name__ == "__main__":
    raise SystemExit(main())
