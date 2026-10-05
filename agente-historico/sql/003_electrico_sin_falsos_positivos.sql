-- ============================================================================
--  Historico · 003 · `v_sc_electrico_corregido` sin falsos positivos
--
--  La vista "corregida" tenia dos defectos MEDIDOS, y hacian daño en
--  direcciones opuestas: borraba dato bueno y dejaba pasar dato malo.
--
--  ── Defecto 1: borraba el 0 de las variables AC ──────────────────────────
--  Tenia `CASE WHEN voltaje_vac < 100.0 ... THEN NULL` y su gemelo de
--  `frecuencia_hz` (55-65). Leo Cardinale decidio el 2026-08-30 (R3 de
--  `docs/referencia/respuestas-lcv-consultas.md`) que un 0 en esas columnas es
--  DATO VALIDO: es el inversor que no se esta acoplando a la red. Medido sobre
--  produccion el 2026-08-31: la vista anulaba 7.873 ceros de `voltaje_vac` y
--  3.761 de `frecuencia_hz`, o sea que cualquier analisis leido de la vista era
--  ESTRUCTURALMENTE incapaz de detectar un inversor caido a mediodia, que es
--  justo lo que Leo pide detectar.
--
--  ── Defecto 2: no limpiaba las cuatro columnas de energia ────────────────
--  `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh` y `energia_pv2_wh`
--  pasaban SIN NINGUN `CASE`, asi que la vista corregida devolvia el mismo
--  maximo imposible de 39.328.367 que la tabla cruda.
--
--  ── Que cambia, exactamente ───────────────────────────────────────────────
--  1. El piso de `voltaje_vac` pasa de 100,0 a 0,0 y el de `frecuencia_hz` de
--     55,0 a 0,0. Los TECHOS se conservan (280 V y 65 Hz): son la guarda que
--     sigue mandando a NULL lo genuinamente imposible (un 400 V no es dato).
--  2. Las cuatro columnas de energia se anulan en las filas con FIRMA de
--     piranometro mezclado.
--  3. Se documenta por `COMMENT ON COLUMN` que esas cuatro columnas estan en
--     kWh pese al sufijo `_wh` del nombre.
--
--  El resto de la vista queda IDENTICO: mismas columnas, mismo orden, mismos
--  tipos, mismo numero de filas (36.469). No hay `WHERE`: la capa de correccion
--  anula valores, no descarta filas.
--
--  ── Por que el piso baja a 0 y no se queda en 100 con una excepcion ──────
--  Porque el dato entre 0 y 100 tambien es bueno. Medido: `voltaje_vac` tiene
--  82 lecturas en (0, 100) y `frecuencia_hz` 120 en (0, 55), y son la RAMPA DE
--  ARRANQUE del inversor al amanecer (2026-05-21 05:20 -> 99,79 V con 28,0 Hz y
--  0 W; 2025-10-15 05:25 -> 95,06 V con 26,66 Hz), mas algun evento de mediodia
--  (2026-03-10 11:25, 2026-03-20 16:00). Dejar el piso en 100 y exceptuar solo
--  el 0 repetiria el mismo error una escala mas abajo: convertir en NULL la
--  evidencia de que el inversor no estaba acoplado.
--  Todo el dominio observado es valido: `voltaje_vac` va de 0 a 218,84 V (el
--  techo de 280 NUNCA se dispara) y `frecuencia_hz` de 0 a 60,06 Hz (el de 65
--  tampoco). No hay ni una lectura negativa en 36.469 filas.
--
--  ── ESTE RANGO VIVE EN TRES SITIOS Y HAY QUE TOCAR LOS TRES A LA VEZ ─────
--    1. `src/historico/config.py`            -> `RANGOS` (lo usa el barrido)
--    2. `src/historico/analitica/catalogo.py`-> `minimo`/`maximo` (validez fisica)
--    3. esta vista
--  Esta migracion es el sitio 3. Los otros dos ya estan cambiados en el mismo
--  commit, y `tests/test_rangos_fisicos.py` verifica que los tres coincidan.
--  Olvidar cualquiera de los tres FALLA EN SILENCIO: si se arregla la vista y
--  no `config`, el barrido sigue escribiendo 7.954 `fuera_de_rango` graves; si
--  se arregla `config` y no la vista, el analisis sigue ciego a los apagones.
--
--  ── CUIDADO CON LA LOGICA TERNARIA DE SQL ────────────────────────────────
--  La firma se evalua UNA vez en el CTE y se cierra con `IS TRUE`, que colapsa
--  el NULL a falso ahi mismo. Es deliberado. Escribir la guarda como
--  `WHERE NOT (firma)` en vez de `WHERE (firma) IS NOT TRUE` YA NOS MORDIO:
--  con cualquier columna de la firma en NULL, `NOT (NULL)` es NULL, la fila no
--  pasa el filtro y la base cae de 36.469 a 18.005 filas (274 -> 132 dias). Se
--  pierde la mitad del historico sin un solo aviso.
--
--  ── La firma, y por que no es un rango sobre la energia ──────────────────
--  La contaminacion son FILAS DEL PIRANOMETRO mezcladas en el CSV del inversor
--  (el problema conocido de los 13 esquemas), no valores fuera de rango de la
--  energia en si. Por eso se filtra por magnitudes imposibles para un inversor
--  de 2,84 kWp en OTRAS columnas de la misma fila, nunca por el valor de la
--  columna de energia que se quiere limpiar: un umbral sobre la propia energia
--  recortaria dias record legitimos.
--
--  Medido el 2026-08-31 sobre `monitoreo_sc_electrico` (36.469 filas):
--    * la firma marca 490 filas en 46 dias (2025-10-07 a 2026-03-09);
--    * incluye la fila conocida 2025-10-07 07:45 (`potencia_pv1_w` =
--      26.503.162,8 W, `temperatura_inversor_c` = 291,1 C, `energia_total_wh` =
--      39.328.367,1), que por si sola producia el maximo imposible;
--    * incluye tambien el ultimo registro del 2026-03-09 17:55 (137,25 en
--      `energia_hoy_wh` contra una mediana de 6,65), que entra por
--      `corriente_pv2_a` = 121,295 A en un arreglo que nunca pasa de 20 A.
--
--  Maximos de las cuatro columnas, antes y despues:
--
--    columna             | hoy (vista y cruda) | con la firma aplicada
--    --------------------|---------------------|----------------------
--    energia_total_wh    |        39.328.367,1 |               2.710,7
--    energia_hoy_wh      |               671,1 |                  14,2
--    energia_pv1_wh      |           203.194,6 |                   7,9
--    energia_pv2_wh      |                 5,3 |                   5,3
--
--  2.710,7 kWh de vida para 2,84 kWp en 569 dias son 571 kWh/kWp/año: bajo,
--  pero perfectamente fisico para un agrovoltaico con un arreglo vertical y
--  sombreado. El acumulador NO estaba roto: estabamos leyendo la tabla sucia.
--
--  ── LAS CUATRO COLUMNAS `energia_*_wh` ESTAN EN kWh, NO EN Wh ────────────
--  Medido, no supuesto (`docs/referencia/medicion-energia-ac.md`, hallazgo
--  cero): integrando `potencia_total_wac` (que si esta en W) dia a dia contra
--  el cierre diario del contador, la razon da mediana 1.003,58 sobre 127 dias,
--  con dispersion menor al 1%. El contraste fisico lo confirma: el rendimiento
--  especifico diario implicito da mediana 2,32 y maximo exactamente 5,00
--  kWh/kWp/dia, que es el techo de Costa Rica.
--  NO se renombran las columnas: eso romperia a todos los consumidores. Se
--  documenta la unidad real en cada una, porque el nombre miente y el siguiente
--  que lo lea se equivoca por un factor de mil.
--
--  ── Ojo: SOLO se toca esta vista ──────────────────────────────────────────
--  La misma mentira de unidad vive en `monitoreo_sc_electrico` y en las filas
--  de `diccionario_variables` ('Energia AC generada en el dia [Wh]'). Esas dos
--  las tiene que actualizar quien sea dueño de ellas: no entran aca.
-- ============================================================================

CREATE OR REPLACE VIEW v_sc_electrico_corregido WITH (security_invoker = on) AS
WITH marcado AS (
    SELECT m.*,
           (
             -- FIRMA:INICIO  (la parsea tests/test_rangos_fisicos.py: no borrar los marcadores)
                m.potencia_pv1_w        > 5000.0 OR m.potencia_pv2_w  > 5000.0
             OR m.voltaje_pv1_v         > 600.0  OR m.voltaje_pv2_v   > 600.0
             OR m.corriente_pv1_a       > 20.0   OR m.corriente_pv2_a > 20.0
             OR m.potencia_total_wac    > 5000.0
             OR m.temperatura_inversor_c > 100.0
             OR m.potencia_pv1_w        < 0.0    OR m.potencia_pv2_w  < 0.0
             OR m.voltaje_pv1_v         < 0.0    OR m.voltaje_pv2_v   < 0.0
             -- FIRMA:FIN
           ) IS TRUE AS fila_de_piranometro   -- `IS TRUE`: colapsa el NULL a falso UNA vez
      FROM monitoreo_sc_electrico m
)
SELECT
    "timestamp",
    CASE WHEN voltaje_pv1_v < 0.0 OR voltaje_pv1_v > 600.0 THEN NULL ELSE voltaje_pv1_v END AS voltaje_pv1_v,
    CASE WHEN corriente_pv1_a < 0.0 OR corriente_pv1_a > 20.0 THEN NULL ELSE corriente_pv1_a END AS corriente_pv1_a,
    CASE WHEN potencia_pv1_w < 0.0 OR potencia_pv1_w > 5000.0 THEN NULL ELSE potencia_pv1_w END AS potencia_pv1_w,
    CASE WHEN voltaje_pv2_v < 0.0 OR voltaje_pv2_v > 600.0 THEN NULL ELSE voltaje_pv2_v END AS voltaje_pv2_v,
    CASE WHEN corriente_pv2_a < 0.0 OR corriente_pv2_a > 20.0 THEN NULL ELSE corriente_pv2_a END AS corriente_pv2_a,
    CASE WHEN potencia_pv2_w < 0.0 OR potencia_pv2_w > 5000.0 THEN NULL ELSE potencia_pv2_w END AS potencia_pv2_w,
    CASE WHEN potencia_total_wac < 0.0 OR potencia_total_wac > 5000.0 THEN NULL ELSE potencia_total_wac END AS potencia_total_wac,
    -- Piso 0,0 (era 55,0): el 0 Hz es el inversor sin acoplar, dato valido (R3, 2026-08-30).
    CASE WHEN frecuencia_hz < 0.0 OR frecuencia_hz > 65.0 THEN NULL ELSE frecuencia_hz END AS frecuencia_hz,
    -- Piso 0,0 (era 100,0): el 0 V es el inversor sin acoplar, dato valido (R3, 2026-08-30).
    CASE WHEN voltaje_vac < 0.0 OR voltaje_vac > 280.0 THEN NULL ELSE voltaje_vac END AS voltaje_vac,
    corriente_aac,
    -- Las cuatro de energia: se anulan SOLO en las filas con firma de piranometro.
    CASE WHEN fila_de_piranometro THEN NULL ELSE energia_hoy_wh END AS energia_hoy_wh,
    CASE WHEN fila_de_piranometro THEN NULL ELSE energia_total_wh END AS energia_total_wh,
    CASE WHEN fila_de_piranometro THEN NULL ELSE energia_pv1_wh END AS energia_pv1_wh,
    CASE WHEN fila_de_piranometro THEN NULL ELSE energia_pv2_wh END AS energia_pv2_wh,
    CASE WHEN temperatura_inversor_c = 85.0 OR temperatura_inversor_c < 10.0 OR temperatura_inversor_c > 80.0 THEN NULL ELSE temperatura_inversor_c END AS temperatura_inversor_c,
    codigo_error,
    CASE WHEN temp_vertical = 85.0 OR temp_vertical < 10.0 OR temp_vertical > 80.0 THEN NULL ELSE temp_vertical END AS temp_vertical,
    CASE WHEN temp_inclinado = 85.0 OR temp_inclinado < 10.0 OR temp_inclinado > 80.0 THEN NULL ELSE temp_inclinado END AS temp_inclinado,
    n_muestras,
    intervalo_original_seg,
    fuente_archivo
FROM marcado;

-- `fila_de_piranometro` queda DENTRO del CTE a proposito: no se expone como
-- columna de la vista para no cambiarle la forma a los consumidores que hacen
-- `SELECT *`. Si alguna vez hace falta para diagnostico, va en otra migracion.

-- ── Unidad real de las cuatro columnas de energia (ver cabecera) ────────────
COMMENT ON COLUMN v_sc_electrico_corregido.energia_hoy_wh IS
    'Energia AC del dia, contador del inversor. UNIDAD REAL: kWh, NO Wh, pese al sufijo _wh del nombre (razon integral/contador = 1.003,58 de mediana sobre 127 dias). Se reinicia cada dia. Se anula en las filas con firma de piranometro mezclado.';
COMMENT ON COLUMN v_sc_electrico_corregido.energia_total_wh IS
    'Energia AC acumulada de vida, contador del inversor. UNIDAD REAL: kWh, NO Wh, pese al sufijo _wh del nombre. Estrictamente monotona: 182,3 -> 2.710,7 kWh, 0 reinicios en 19.889 lecturas. Se anula en las filas con firma de piranometro mezclado.';
COMMENT ON COLUMN v_sc_electrico_corregido.energia_pv1_wh IS
    'Energia DC del dia del arreglo PV1 (inclinado). UNIDAD REAL: kWh, NO Wh, pese al sufijo _wh del nombre. Es un acumulador DIARIO (abre en 0 al amanecer en 134 de 144 dias), no energia del intervalo: para el PR diario se toma el CIERRE del dia. Se anula en las filas con firma de piranometro mezclado.';
COMMENT ON COLUMN v_sc_electrico_corregido.energia_pv2_wh IS
    'Energia DC del dia del arreglo PV2 (vertical). UNIDAD REAL: kWh, NO Wh, pese al sufijo _wh del nombre. Es un acumulador DIARIO, no energia del intervalo: para el PR diario se toma el CIERRE del dia. Se anula en las filas con firma de piranometro mezclado.';

-- ── Las dos columnas AC donde el 0 dejo de ser una violacion de rango ───────
COMMENT ON COLUMN v_sc_electrico_corregido.voltaje_vac IS
    'Tension AC que GENERA el inversor (no la de la red externa). El 0 V es DATO VALIDO: es el inversor sin acoplarse (R3 de Leo Cardinale, 2026-08-30). Rango conservado 0-280 V; el maximo historico es 218,84 V.';
COMMENT ON COLUMN v_sc_electrico_corregido.frecuencia_hz IS
    'Frecuencia que genera el inversor. El 0 Hz es DATO VALIDO: es el inversor sin acoplarse (R3 de Leo Cardinale, 2026-08-30). Rango conservado 0-65 Hz; el maximo historico es 60,06 Hz.';
