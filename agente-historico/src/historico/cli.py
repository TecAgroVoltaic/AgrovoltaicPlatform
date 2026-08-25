"""CLI del Historico. Dos cosas que no se parecen, en un solo comando.

    historico                        Q&A por terminal (usa el LLM)
    historico barrido [--desde --hasta]   detecta problemas de calidad
    historico cielo   [--desde --hasta]   caracteriza el cielo por dia
    historico sol     [--desde --hasta]   ventana solar (amanecer/atardecer)
    historico reporte [--desde --hasta]   el informe legible
    historico todo    [--desde --hasta]   sol + barrido + cielo + reporte

Sin subcomando abre el Q&A, que es como se usaba antes del renombre.

Los cuatro subcomandos de calidad son el BARRIDO POR LOTES: escriben el store que
despues leen las herramientas. Van por cron, no por pregunta. Recorrer los dias es
caro y el resultado no depende de quien pregunte ni cuando; si esto viviera dentro
de una herramienta, cada pregunta lo repetiria y dos personas podrian obtener
veredictos distintos del mismo dia.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta

CALIDAD = ("sol", "barrido", "cielo", "reporte", "todo")


def _qa() -> int:
    """Q&A por terminal. Solo entrada/salida (SRP)."""
    from historico.agent.agent import Historico

    agente = Historico()
    print("=== agente Historico San Carlos (Q&A sobre el historico) ===")
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


def _rango(args) -> tuple[date, date]:
    """Fechas pedidas, o todo lo que haya en la base. `hasta` es EXCLUSIVO."""
    from historico import db

    lim = db.uno('SELECT min("timestamp")::date AS d0, max("timestamp")::date AS d1 '
                 "FROM radiacion_sc_15s")
    if not lim.get("d0"):
        raise SystemExit("no hay datos en radiacion_sc_15s")
    d0 = date.fromisoformat(args.desde) if args.desde else date.fromisoformat(lim["d0"])
    # +1 dia: `hasta` es exclusivo y el ultimo dia con datos tiene que entrar.
    d1 = (date.fromisoformat(args.hasta) if args.hasta
          else date.fromisoformat(lim["d1"]) + timedelta(days=1))
    return d0, d1


def _calidad(args) -> int:
    from historico import db
    from historico.calidad import barrido, cielo, reporte, sol

    try:
        desde, hasta = _rango(args)
        if args.accion in ("sol", "todo"):
            print(f"ventana solar: {sol.poblar(desde, hasta - timedelta(days=1))} dias",
                  file=sys.stderr)
        if args.accion in ("barrido", "todo"):
            print(json.dumps(barrido.barrer(desde, hasta), indent=2, ensure_ascii=False),
                  file=sys.stderr)
        if args.accion in ("cielo", "todo"):
            print(json.dumps(cielo.caracterizar(desde, hasta), indent=2, ensure_ascii=False),
                  file=sys.stderr)
        if args.accion in ("reporte", "todo"):
            print(reporte.generar(desde, hasta))
        return 0
    finally:
        db.cerrar()


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in CALIDAD:
        return _qa()

    p = argparse.ArgumentParser(prog="historico", description=__doc__)
    p.add_argument("accion", choices=list(CALIDAD))
    p.add_argument("--desde", help="fecha ISO inclusive")
    p.add_argument("--hasta", help="fecha ISO EXCLUSIVA")
    return _calidad(p.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
