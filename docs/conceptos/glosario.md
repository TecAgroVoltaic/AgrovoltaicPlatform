# Glosario de conceptos — sistema agrovoltaico

Términos del dominio para leer los datos de monitoreo. Material de apoyo conceptual;
**no** es parte del sistema de memoria (`../memoria/`). Para las explicaciones visuales,
ver los diagramas HTML de esta misma carpeta.

## Generación fotovoltaica
- **Panel solar (módulo PV)** — convierte luz en electricidad. La luz (fotones) golpea el
  silicio y **arranca electrones**; el panel separa esas cargas y las obliga a moverse en
  **una misma dirección** → esa corriente ordenada es la electricidad. No "absorbe"
  radiación como una esponja absorbe agua. Ver `panel-desnivel-electrones.html`.
- **String** — conjunto de paneles en serie que entra como una entrada DC al inversor.
  Este sistema tiene **dos**: PV1 y PV2 (ver `../memoria/datos/fuentes-fisicas.md`).
- **Inversor** — convierte la corriente continua (DC) de los strings en corriente alterna
  (AC) para la carga o la red.
- **Panel monofacial** — capta luz solo por el frente.
- **Panel bifacial** — capta luz por **ambas caras** (frente + luz reflejada del suelo por
  detrás). Si los paneles del sitio son bifaciales cambia la producción esperada; pendiente
  de confirmar (ver `../memoria/pendientes/bloqueantes.md`).

## Irradiancia y albedo
- **Irradiancia incidente** — intensidad de la luz solar que cae sobre el panel (W/m²).
- **Irradiancia reflejada** — fracción que rebota del suelo/entorno hacia el sensor.
- **Albedo** — proporción reflejada/incidente (irradiancia reflejada ÷ irradiancia
  incidente). Adimensional, típicamente 0–1.
- **Piranómetro** — sensor que mide irradiancia. Aquí mide incidente, reflejada y, desde
  may-2026, un segundo sensor de referencia **SP722**. ⚠️ Las lecturas vienen **sin
  calibrar** (ver `../memoria/inconsistencias/irradiancia-sin-calibrar.md`).

## Diagramas visuales (en esta carpeta)
- `sistema-fotovoltaico.html` — anatomía de un sistema fotovoltaico completo.
- `panel-desnivel-electrones.html` — por qué nace la corriente (el "desnivel" del panel).
- `proceso-datos-agrovoltaico.html` — recorrido **de la luz al dato**: del sol hasta la
  fila en Supabase. Usa las imágenes de `img/` (ver `img/README.md`).
