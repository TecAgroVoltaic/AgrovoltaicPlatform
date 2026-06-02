---
name: objetivo
description: Estandarizar los CSV crudos de monitoreo y cargarlos a Supabase como pipeline automatizado y permanente
categoria: proyecto
---

# Objetivo

Limpiar y estandarizar los datos crudos de monitoreo fotovoltaico (CSV) e insertarlos en
**Supabase**.

La carga debe ser un **pipeline automatizado y permanente**: proceso reproducible e
idempotente que pueda correr de forma recurrente, **no** un script de una sola vez.

Flujo: `CSV crudos → EDA → limpieza/estandarización → carga a Supabase`.

Más adelante (futuro): dashboard con visualización, predicción y agentes de IA.

Relacionado: [[estado]], [[dataset-actual]], [[decisiones]].
