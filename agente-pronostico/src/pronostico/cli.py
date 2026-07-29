"""
Punto de entrada de linea de comandos.

    python -m pronostico.cli "¿cuanta irradiancia va a haber en 2 horas?"

Construye el agente, le pasa la pregunta y imprime la respuesta. Si falta la
clave de API, avisa con un mensaje claro (el agente necesita el LLM para orquestar
y redactar; los numeros igual salen de la herramienta fisica).
"""
from __future__ import annotations

import os
import sys


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    pregunta = " ".join(argv).strip()
    if not pregunta:
        print('Uso: python -m pronostico.cli "¿cuanta irradiancia va a haber en 2 horas?"')
        return 2

    # Importar config CORRE load_dotenv(): asi la clave del .env llega a os.environ
    # ANTES de comprobarla. Es barato (solo constantes); el SDK sigue difiriendose.
    from pronostico import config  # noqa: F401

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Falta ANTHROPIC_API_KEY en el entorno (o en .env). "
              "El agente la necesita para entender la pregunta y redactar la respuesta.",
              file=sys.stderr)
        return 1

    # Import diferido: evita cargar el SDK si faltan argumentos o la clave.
    from pronostico.agent.agent import ForecastAgent

    agente = ForecastAgent()
    print(agente.ask(pregunta))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
