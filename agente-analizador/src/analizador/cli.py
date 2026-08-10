"""CLI del analizador: Q&A por terminal. Solo entrada/salida (SRP).

Uso:  python -m analizador.cli   (o el script `analizador` tras `pip install -e .`)
"""
from __future__ import annotations

import sys


def main() -> int:
    from analizador.agent.agent import Analizador

    agente = Analizador()
    print("=== Analizador PV San Carlos (Q&A sobre el historico) ===")
    print("Escribi tu pregunta. 'salir' para terminar.")
    while True:
        try:
            pregunta = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if pregunta.lower() in ("salir", "exit", "quit", ""):
            return 0
        try:
            print("\n" + agente.preguntar(pregunta))
        except Exception as exc:  # noqa: BLE001 — el CLI no debe morir por 1 fallo
            print(f"Error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
