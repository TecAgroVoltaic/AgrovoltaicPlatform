# Memoria del Proyecto — AgroVoltaic

Sistema de memoria jerárquico. Un tema por archivo, agrupados por carpeta. Empieza aquí
para ubicar qué buscas; cada línea apunta al archivo de detalle.

**Última actualización:** 2026-06-01

## proyecto/ — qué es y en qué fase está
- [objetivo.md](proyecto/objetivo.md) — estandarizar CSV crudos y cargarlos a Supabase como pipeline automatizado y permanente
- [estado.md](proyecto/estado.md) — EDA hecho, pipeline diseñado, código de limpieza aún no iniciado

## datos/ — el dataset y sus fuentes
- [fuentes-fisicas.md](datos/fuentes-fisicas.md) — 3 fuentes: inversor, piranómetros, DS18B20
- [dataset-actual.md](datos/dataset-actual.md) — carpeta NEW (285 CSVs), rango, NEW vs OLD

## inconsistencias/ — un archivo por problema (verificadas en NEW el 2026-06-01)
- [schemas-multiples.md](inconsistencias/schemas-multiples.md) — 13 schemas, nombres inconsistentes
- [filas-mezcladas.md](inconsistencias/filas-mezcladas.md) — filas de distintas fuentes con ≠ nº de columnas
- [irradiancia-sin-calibrar.md](inconsistencias/irradiancia-sin-calibrar.md) — valores negativos/irreales, offset −38.845
- [temperatura-85.md](inconsistencias/temperatura-85.md) — saturación en 85.0 (error DS18B20)
- [muestreo-variable.md](inconsistencias/muestreo-variable.md) — de 2 s a 5 min según la época
- [gaps-temporales.md](inconsistencias/gaps-temporales.md) — gaps de 126 y 71 días + nuevos
- [duplicados.md](inconsistencias/duplicados.md) — archivos `(N)` duplicados y fragmentos
- [typos-headers.md](inconsistencias/typos-headers.md) — `Energì`, `POTencia`, `Corriente PV2[A]`

## decisiones/ — qué decidimos y por qué
- [decisiones.md](decisiones/decisiones.md) — resampleo, 85→NULL, offset→0, gaps, duplicados, schema destino

## pendientes/ — lo que bloquea
- [bloqueantes.md](pendientes/bloqueantes.md) — lat/lon, kWp, timezone, modelo de piranómetro

## contexto-externo/ — sistemas aparte
- [agrodash.md](contexto-externo/agrodash.md) — API de sensores de suelo; NO combinar con esto

---

## Documentos de detalle (fuera de la memoria, referencia larga)
- `../EDA-Monitoreo-AgroVoltaic.md` — análisis exploratorio completo
- `../TODO-Pipeline-Limpieza.md` — pipeline de 12 pasos en 6 fases
- `../DUDAS-Pendientes.md` — 17 preguntas para el equipo de campo
- `../ObjetivosProyecto.md` — plan de la pasantía (contexto académico)
- `../referencia_api_agrodash.pdf` — contexto de AgroDash (sistema aparte)
