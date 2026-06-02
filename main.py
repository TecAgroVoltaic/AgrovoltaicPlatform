#!/usr/bin/env python3
"""Punto de entrada del ETL AgroVoltaic.

Uso:
    python3 main.py

Abre el menu interactivo. No requiere instalar nada (agrega src/ al path).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from agrovoltaic.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
