-- ============================================================================
--  Comparador · 001 · Store de hallazgos + caracterizacion del cielo
--
--  Sigue lo decidido en docs/memoria/proyecto/capa-agentes.md: la deteccion es
--  DETERMINISTA y deja un store de hallazgos propio; el LLM solo narra por
--  encima, y no esta en el camino numerico.
--
--  Tres objetos:
--    * `ventana_solar`      dimension: amanecer/atardecer por dia (pvlib).
--    * `hallazgos_calidad`  un renglon por (dia, fuente, variable, tipo).
--    * `cielo_diario`       caracterizacion del cielo por dia (kt + variabilidad).
--
--  Por que `ventana_solar` es una TABLA y no se calcula al vuelo: el logger de
--  San Carlos **solo graba de dia** (11,5 a 12,7 h cubiertas segun el dia), asi
--  que "el dia esta completo" NO se mide contra 24 h sino contra las horas de
--  sol. Y `radiacion_sc_clearsky` no sirve para eso: solo tiene timestamps donde
--  YA hay dato, o sea que no puede decir cuando deberia haberlo habido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ventana_solar (
    fecha      DATE PRIMARY KEY,
    amanecer   TIMESTAMPTZ NOT NULL,   -- reloj de pared local, como el resto del store
    atardecer  TIMESTAMPTZ NOT NULL,
    horas_sol  DOUBLE PRECISION NOT NULL
);
COMMENT ON TABLE ventana_solar IS
    'Amanecer/atardecer por dia en San Carlos (pvlib). Define contra que se mide "el dia esta completo": el logger solo graba de dia.';

CREATE TABLE IF NOT EXISTS hallazgos_calidad (
    fecha        DATE        NOT NULL,
    fuente       TEXT        NOT NULL,   -- 'radiacion_sc_15s' | 'monitoreo_sc_electrico'
    variable     TEXT        NOT NULL,   -- columna afectada, o '*' si es del dia entero
    tipo         TEXT        NOT NULL,   -- ver comentario de abajo
    severidad    TEXT        NOT NULL,   -- 'info' | 'aviso' | 'grave'
    n_afectadas  INTEGER,                -- cuantas lecturas caen en el hallazgo
    detalle      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    detectado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fecha, fuente, variable, tipo),
    CONSTRAINT hallazgos_severidad_valida CHECK (severidad IN ('info','aviso','grave'))
);
COMMENT ON TABLE hallazgos_calidad IS
    'Store de hallazgos del Comparador. PK (fecha, fuente, variable, tipo) -> re-correr el barrido actualiza, no duplica.';
COMMENT ON COLUMN hallazgos_calidad.tipo IS
    'dia_incompleto | hueco | duplicado_timestamp | cambio_de_cadencia | columna_ausente | nulos | fuera_de_rango | saturado_85 | constante_en_cero | sensor_plano | offset_nocturno | kt_imposible';

CREATE INDEX IF NOT EXISTS idx_hallazgos_tipo  ON hallazgos_calidad (tipo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_hallazgos_grave ON hallazgos_calidad (fecha DESC) WHERE severidad = 'grave';

CREATE TABLE IF NOT EXISTS cielo_diario (
    fecha                DATE PRIMARY KEY,
    n_muestras_dia       INTEGER NOT NULL,        -- lecturas con sol (cs_ghi > 50)
    kt_medio             DOUBLE PRECISION,        -- indice de cielo despejado medio
    kt_mediana           DOUBLE PRECISION,
    frac_despejado       DOUBLE PRECISION,        -- kt >= 0.70
    frac_parcial         DOUBLE PRECISION,        -- 0.35 <= kt < 0.70
    frac_cubierto        DOUBLE PRECISION,        -- kt < 0.35
    indice_variabilidad  DOUBLE PRECISION,        -- VI de Stein: largo de la curva medida / la de cielo despejado
    clase                TEXT,                    -- 'despejado' | 'cubierto' | 'variable' | 'parcial'
    energia_medida_whm2  DOUBLE PRECISION,        -- integral del GHI medido
    energia_cs_whm2      DOUBLE PRECISION,        -- integral del clear-sky
    calculado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE cielo_diario IS
    'Caracterizacion estadistica del cielo por dia: cuanto sol hubo (kt) y que tan intermitente fue (indice de variabilidad). Insumo del analisis de que variables afectan la irradiancia.';
COMMENT ON COLUMN cielo_diario.indice_variabilidad IS
    'VI de Stein/Hansen/Riley: cociente entre el largo de arco de la curva medida y el de la de cielo despejado. 1 = tan suave como un dia despejado; >3 = paso de nubes marcado.';

ALTER TABLE ventana_solar      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos_calidad  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cielo_diario       ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON ventana_solar, hallazgos_calidad, cielo_diario TO joshua_ro;
