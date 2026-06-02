---
name: muestreo-variable
description: El intervalo de muestreo cambia entre épocas (2 s en dic-2024 hasta 5 min en 2026)
categoria: inconsistencia
---

# Intervalo de muestreo variable

El intervalo no es constante y varía drásticamente entre épocas:

| Período | Intervalo | Filas/día |
|---|---|---|
| Dic 2024 | ~2 s | ~9.500–18.700 |
| May-Jun 2025 | ~1 min | ~1.400–1.500 |
| Oct 2025 | ~6–10 s | ~6.500 |
| Nov 2025+ | ~5 min | ~155–260 |

**Evidencia en NEW (2026-06-01):** dic-2024 ~18.500 filas/día vs archivos nuevos ~155 filas/día.

Decisión: resamplear todo a **5 min** (mean para tasas, last para acumulados).

Relacionado: [[decisiones]], [[gaps-temporales]].
