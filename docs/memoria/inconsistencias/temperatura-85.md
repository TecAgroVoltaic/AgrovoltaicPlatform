---
name: temperatura-85
description: Sensores de temperatura saturados en 85.0, el valor de error por defecto del DS18B20 desconectado
categoria: inconsistencia
---

# Temperaturas saturadas en 85.0

Múltiples períodos reportan **85.0** constante en temperatura. Es el **valor de error por
defecto del DS18B20** (sensor desconectado, dañado o sin comunicación), no una temperatura real.

**Evidencia en NEW (2026-06-01):** presente en **137 archivos**. Los 8 archivos nuevos
(may-jun 2026) sí salen limpios de 85.0.

Decisión previa (SUPERADA): `85.0 → NULL` in-place.

> **Respuesta oficial de Leo (2026-08-10, [[respuestas-leo-cardinale]] · P2/P3):** *"dejar el
> valor crudo"* y limpiar en la etapa de análisis (variable corregida nueva). **Causa física del
> error:** el **pegamento del sensor** dejó de funcionar (se reparaba y volvía a fallar) y en otros
> casos hubo **falso contacto** eléctrico. Existe bitácora de mantenimiento, pero **recién se
> implementó**, así que este error no está registrado ahí. **Rango válido de temperatura: 10–80 °C**
> (reemplaza el −10…60 °C de AgroDash), aplicado en posproceso, no anulando en la DB.

Relacionado: [[decisiones]], [[respuestas-leo-cardinale]], [[agrodash]], [[fuentes-fisicas]].
