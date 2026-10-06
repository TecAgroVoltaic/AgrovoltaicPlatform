-- ============================================================================
--  Historico · 004 · Alertas y su seguimiento
--
--  Contrato: docs/referencia/contratos-asistente-alertas.md, seccion 4.
--
--  Las alertas DERIVAN de `hallazgos_calidad`; no re-detectan nada. El generador
--  (`historico alertas`, y al final de `historico todo`) agrupa hallazgos por
--  `clave` = "{tipo}:{fuente}:{variable}" y deja UNA alerta abierta por clave.
--  Lo que se escribe a mano (reconocer, seguimiento, resolver, descartar,
--  reabrir) queda como evento en `alertas_eventos`: la ficha muestra la linea de
--  tiempo completa y nada se borra.
--
--  `alertas_evaluaciones` no estaba en la primera version del contrato. Existe
--  para que `GET /alertas/resumen` pueda decir CUANDO se evaluo por ultima vez:
--  sin ella, "no hay alertas nuevas" y "el generador no corrio" se ven igual, que
--  es el silencio leido como salud de docs/memoria/inconsistencias/.
--
--  Se aplica a mano. No modifica ninguna tabla existente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS alertas (
    id                   BIGSERIAL PRIMARY KEY,
    clave                TEXT NOT NULL,            -- "{tipo}:{fuente}:{variable}"; agrupa ocurrencias
    tipo                 TEXT NOT NULL,
    severidad            TEXT NOT NULL CHECK (severidad IN ('aviso','grave')),
    estado               TEXT NOT NULL DEFAULT 'nueva'
                         CHECK (estado IN ('nueva','reconocida','en_seguimiento','resuelta','descartada')),
    titulo               TEXT NOT NULL,
    descripcion          TEXT NOT NULL,
    fuente               TEXT NOT NULL,
    variable             TEXT NOT NULL,            -- '*' = dia entero
    fecha_inicio         DATE NOT NULL,
    fecha_fin            DATE NOT NULL,            -- ultima fecha con ocurrencia (inclusive)
    ocurrencias          INT  NOT NULL DEFAULT 1,  -- dias en que se vio la condicion
    evidencia            JSONB NOT NULL DEFAULT '{}'::jsonb,
    proxima_revision     DATE,
    creada_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_ocurrencia_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alertas_rango_valido CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT alertas_ocurrencias_positivas CHECK (ocurrencias >= 1)
);
-- Una sola abierta por clave. Es la garantia de que dos evaluaciones simultaneas
-- no dupliquen una alerta: la segunda choca aca en vez de crear un gemelo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_abierta_por_clave
    ON alertas (clave) WHERE estado IN ('nueva','reconocida','en_seguimiento');
CREATE INDEX IF NOT EXISTS idx_alertas_estado
    ON alertas (estado, severidad, fecha_fin DESC);
COMMENT ON TABLE alertas IS
    'Alertas derivadas de hallazgos_calidad. Una abierta por clave; las cerradas no se reabren solas.';

CREATE TABLE IF NOT EXISTS alertas_eventos (
    id         BIGSERIAL PRIMARY KEY,
    alerta_id  BIGINT NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
    tipo       TEXT NOT NULL CHECK (tipo IN ('creada','ocurrencia','reconocida','seguimiento',
                                             'nota','resuelta','descartada','reabierta')),
    nota       TEXT,
    autor      TEXT NOT NULL DEFAULT 'consola',
    datos      JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_eventos_alerta
    ON alertas_eventos (alerta_id, creado_en);
COMMENT ON TABLE alertas_eventos IS
    'Linea de tiempo de cada alerta: lo que hizo el generador y lo que hizo cada persona.';

CREATE TABLE IF NOT EXISTS alertas_evaluaciones (
    id            BIGSERIAL PRIMARY KEY,
    desde         DATE NOT NULL,
    hasta         DATE NOT NULL,                 -- exclusivo, como el resto del repo
    creadas       INT  NOT NULL,
    actualizadas  INT  NOT NULL,
    revisadas     INT  NOT NULL,
    notas         INT  NOT NULL,
    evaluada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_evaluaciones_cuando
    ON alertas_evaluaciones (evaluada_en DESC);
COMMENT ON TABLE alertas_evaluaciones IS
    'Una fila por corrida del generador de alertas. Distingue "nada nuevo" de "no se evaluo".';

ALTER TABLE alertas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_eventos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_evaluaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON alertas, alertas_eventos, alertas_evaluaciones TO joshua_ro;
