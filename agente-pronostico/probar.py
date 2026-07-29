"""
Probar el agente de pronóstico — demo interactiva y sin fricción.

    python probar.py

Funciona en DOS niveles:

  1) SIN credenciales (offline): usa el caché de datos (parquet) y te muestra
     cómo se comporta el MOTOR FÍSICO del agente a distintos horizontes.
     Es exactamente el número que el LLM recibiría de la herramienta.

  2) CON ANTHROPIC_API_KEY (en el entorno o en .env): además corre el AGENTE
     COMPLETO (Claude entiende la pregunta en español, llama a la herramienta y
     redacta la respuesta). Así ves la orquestación de punta a punta.

No necesitás AGRODASH_PASSWORD para probar: los datos ya están cacheados.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Permite `python probar.py` sin haber hecho `pip install -e .`
sys.path.insert(0, str(Path(__file__).parent / "src"))

from pronostico import config, data                      # noqa: E402
from pronostico.tools.forecast_tool import run_forecast  # noqa: E402


LINEA = "═" * 66
HORIZONTES = [("media hora", 1800), ("una hora", 3600),
              ("dos horas", 7200), ("tres horas", 10800)]

PREGUNTAS_DEMO = [
    "¿cuánta irradiancia va a haber en dos horas?",
    "¿y en media hora?",
    "¿me contás un chiste?",   # fuera de alcance: prueba que encuadra con cortesía
]


def encabezado() -> None:
    print(LINEA)
    print("  PROBAR EL AGENTE DE PRONÓSTICO · irradiancia · San Carlos")
    print(LINEA)
    serie = data.cargar_serie()
    ahora = serie.index.max()
    print(f"  Datos cacheados : {len(serie):,} lecturas")
    print(f"  Rango           : {serie.index.min():%Y-%m-%d %H:%M}  →  {ahora:%Y-%m-%d %H:%M}")
    print(f"  \"Ahora\" del agente = último dato ({ahora:%Y-%m-%d %H:%M}, hora local)")
    print(f"  Modelo LLM configurado: {config.MODEL}")
    print(f"  Método: persistencia inteligente sobre kt* (índice de cielo despejado)")


def demo_offline() -> None:
    print("\n" + LINEA)
    print("  1) EL MOTOR FÍSICO (offline, sin LLM) — lo que el LLM recibiría")
    print(LINEA)
    print("  Pronóstico desde el último dato, a varios horizontes:\n")
    print(f"  {'Horizonte':<12}{'Esperado':>12}{'Banda ±1σ':>20}{'kt* recién':>12}{'':>8}")
    print("  " + "-" * 62)
    for etiqueta, seg in HORIZONTES:
        r = run_forecast("irradiancia", seg)
        val = r["valor_esperado"]
        lo, hi = r["banda"]["bajo"], r["banda"]["alto"]
        kt = r["contexto"]["kt_estrella_reciente"]
        noche = r["contexto"]["es_de_noche"]
        banda = f"[{lo:.0f} – {hi:.0f}]"
        nota = "  (de noche → ~0)" if noche else ""
        ktxt = f"{kt:.2f}" if kt is not None else "—"
        print(f"  {etiqueta:<12}{val:>9.0f} W/m²{banda:>20}{ktxt:>12}{nota}")
    print("\n  Lectura: el valor central es kt* reciente × cielo-despejado futuro;")
    print("  la banda crece con el horizonte (más incertidumbre). Sitio muy nuboso.")


def demo_agente() -> None:
    print("\n" + LINEA)
    print("  2) EL AGENTE COMPLETO (LLM orquesta: entiende → llama → redacta)")
    print(LINEA)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("  ⏸  Falta ANTHROPIC_API_KEY, así que este paso queda pausado.")
        print("     Para activarlo:")
        print("       1. cp .env.example .env")
        print("       2. poné tu clave en  ANTHROPIC_API_KEY=...")
        print("       3. volvé a correr:   python probar.py")
        print("     (El motor físico de arriba ya funciona sin la clave.)")
        return
    from pronostico.agent.agent import ForecastAgent  # import diferido
    agente = ForecastAgent()
    for preg in PREGUNTAS_DEMO:
        print(f"\n  🧑  {preg}")
        try:
            print(f"  🤖  {agente.ask(preg)}")
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️   Error consultando al modelo: {e}")


def main() -> int:
    try:
        encabezado()
        demo_offline()
        demo_agente()
    except FileNotFoundError:
        print("\n⚠️  No encuentro el caché de datos (data/irradiancia_sc.parquet).")
        print("   Generalo una vez con acceso a AgroDash:")
        print("     AGRODASH_PASSWORD=... python -m pronostico.data")
        return 1
    print("\n" + LINEA)
    print("  Listo. El motor físico corre offline; el agente completo necesita la API key.")
    print(LINEA)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
