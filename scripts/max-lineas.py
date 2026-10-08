#!/usr/bin/env python3
"""Guard de tamaño de archivo: ningún archivo de código supera MAX líneas.

Regla del proyecto (2026-10-08): una responsabilidad por archivo y un techo
duro de 150 líneas, contando todo. Los tests y las fixtures quedan fuera: son
la red de seguridad del refactor, no su objeto. Se corre en el CI y a mano:

    python3 scripts/max-lineas.py            # falla con exit 1 si hay violaciones
    python3 scripts/max-lineas.py --top 20   # además lista los 20 más grandes
"""
from __future__ import annotations

import sys
from pathlib import Path

MAX = 150
RAIZ = Path(__file__).resolve().parent.parent

# (carpeta, sufijos). Las carpetas se recorren recursivamente.
ALCANCE = (
    ("agente-historico/src", (".py",)),
    ("mvp-debugger/app", (".ts", ".tsx", ".css", ".mjs")),
    ("mvp-debugger/scripts", (".mjs", ".ts")),
)
EXCLUIR_SI = (
    lambda p: ".test." in p.name,
    lambda p: p.name == "fixtures.ts" or p.name.endswith(".fixtures.ts"),
    lambda p: "node_modules" in p.parts or ".venv" in p.parts or ".next" in p.parts,
)


def archivos() -> list[Path]:
    salida: list[Path] = []
    for carpeta, sufijos in ALCANCE:
        base = RAIZ / carpeta
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in sufijos and not any(f(p) for f in EXCLUIR_SI):
                salida.append(p)
    return salida


def lineas(p: Path) -> int:
    with p.open("rb") as f:
        return sum(1 for _ in f)


def main(argv: list[str]) -> int:
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 0
    medidos = sorted(((lineas(p), p.relative_to(RAIZ)) for p in archivos()), reverse=True)
    violaciones = [(n, p) for n, p in medidos if n > MAX]
    if top:
        for n, p in medidos[:top]:
            print(f"{n:5d}  {p}")
        print()
    if violaciones:
        print(f"{len(violaciones)} archivo(s) superan {MAX} líneas:")
        for n, p in violaciones:
            print(f"{n:5d}  {p}")
        return 1
    print(f"ok: {len(medidos)} archivos, ninguno supera {MAX} líneas")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
