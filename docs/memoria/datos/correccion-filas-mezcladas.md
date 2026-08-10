---
name: correccion-filas-mezcladas
description: Especificación del equipo para corregir las filas mezcladas de los CSV San Carlos (remapeo de columnas del piranómetro a L/M/N + timestamp a O) + par de archivos ground-truth original/corregido
categoria: datos
---

# Corrección de filas mezcladas (spec + ground-truth)

Método **oficial del equipo** para arreglar la inconsistencia [[filas-mezcladas]]: en los CSV
dañados, las filas del piranómetro traen sus valores al inicio (donde van las columnas del
inversor) en vez de en su lugar. Fuente: PNG anotado
`../../referencia/correccion-filas-mezcladas/correcciones.png`.

## Reglas de remapeo
Header de 19 columnas; posiciones clave: **L** = `irradiancia_incidente`, **M** =
`irradiancia_reflejada`, **N** = `albedo`, **O** = `timestamp`.
- **Fila de piranómetro** (3-4 datos): los **3 primeros valores → columnas L, M, N** y su
  **estampa de tiempo → columna O**. El resto de columnas se dejan **en blanco**.
- **Fila de inversor** (fila completa): las columnas **L, M, N se dejan en blanco** (esa fila no
  trae irradiancia) y su timestamp va en **O**. Las columnas P, Q, R, S no se tienen → **en blanco**.
- ⚠️ **Las columnas de los archivos dañados NO están en el mismo orden que las de los archivos
  correctos** → hay que mover cada dato a su posición, no solo separar filas.

## Ground-truth (par de ejemplo)
En `../../referencia/correccion-filas-mezcladas/`:
- `Monitoreo_2025-12-26.csv` — original dañado (filas de piranómetro e inversor intercaladas).
- `Monitoreo_2025-12-26_corregido.csv` — corregido a mano por el equipo (268 filas ambos).

Sirve como **caso de prueba** para implementar el Paso 2 del pipeline (hoy las filas ragged se
saltan; ver [[implementacion]]).

Relacionado: [[filas-mezcladas]], [[implementacion]], [[diccionario-variables]].
