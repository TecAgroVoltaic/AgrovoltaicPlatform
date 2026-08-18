# Avances — bitácora semanal

Informes de avance del proyecto AGRIVOLTAIC, uno por semana. Cada carpeta contiene el informe
en HTML (fuente editable), el PDF generado y las figuras usadas.

| Semana | Periodo | Foco | Horas | Estado |
|---|---|---|---|---|
| [Semana 1](semana-01/) | 3 – 7 ago 2026 | Requerimientos, inventario de variables y fuentes, diagnóstico del histórico, casos de uso | 20 | ✅ Entregado |
| [Semana 2](semana-02/) | 10 – 16 ago 2026 | Criterio de datos resuelto · procesamiento del histórico · arquitectura e inicio de la capa de agentes | 20 | ✅ Entregado |

Cada semana se corresponde con una semana de la Fase 1 del plan de pasantía
(`docs/referencia/ObjetivosProyecto.md`): Semana 1 = levantamiento de requerimientos y variables;
Semana 2 = arquitectura conceptual y flujo multiagente.

**Acumulado:** 40 h.

## Cómo se regenera un informe

Las figuras se generan consultando la base real (solo lectura) y el PDF se produce desde el HTML:

```bash
weasyprint docs/avances/semana-NN/informe-semana-NN.html docs/avances/semana-NN/informe-semana-NN.pdf
```

Requiere `weasyprint` (ya instalado) y, para regenerar figuras, el venv `env/` con `matplotlib`.

## Criterios de redacción

- **Cifras verificables.** Todo número del informe sale de una consulta a la base o del repositorio;
  nada se estima ni se ilustra.
- **Ritmo de divulgación.** El informe reporta el avance de la semana correspondiente; el trabajo
  que va por delante del calendario de reporte se documenta en semanas posteriores, no se adelanta.
- **Lenguaje para lector no técnico.** Nombres de tablas y detalle de implementación solo donde
  aportan evidencia; el resto se explica en términos del problema.
