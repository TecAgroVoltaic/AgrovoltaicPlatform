"""
Tests de la exportacion por rango (csv / dat / mat), dos fuentes — sin DB.

Se mockean `db.query`/`db.uno`/`db.iterar` (aceptan `fuente`), asi que lo que se
prueba es: la resolucion en el borde (fuente, dataset, formato, rango, columnas,
filtros), la serializacion de cada formato y sus convenciones (nulos, booleanos,
las TRES convenciones de reloj), el tope del .mat y el catalogo tolerante a una
fuente caida. Estructura Given-When-Then.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO

import pytest

from analizador import exportar

UTC = timezone.utc
COLS = [
    {"nombre": "timestamp", "tipo": "timestamp with time zone"},
    {"nombre": "potencia_pv1_w", "tipo": "double precision"},
    {"nombre": "qc_ok", "tipo": "boolean"},
    {"nombre": "fuente", "tipo": "text"},
]
# La base PV devuelve el reloj local etiquetado +00 (sesion UTC).
FILAS = [
    (datetime(2026, 3, 1, 12, 0, tzinfo=UTC), Decimal("123.5"), True, "inversor"),
    (datetime(2026, 3, 1, 12, 5, tzinfo=UTC), None, False, None),
]


@pytest.fixture
def db_falsa(monkeypatch):
    """DB simulada para ambas fuentes; registra el ultimo SQL/params/fuente."""
    estado = {"n": len(FILAS), "sql": None, "params": None, "fuente": None}

    def query(sql, params=(), fuente="supabase"):
        estado["fuente"] = fuente
        if "information_schema" in sql:
            if "ANY" in sql:
                return [dict(c, relacion=rel) for rel in params[0] for c in COLS]
            return COLS
        if "min(" in sql:
            return [{"clave": k, "mn": "2024-11-10 00:00:00", "mx": "2026-08-31 23:55:00"}
                    for (f, k), ds in exportar.DATASETS.items() if f == "supabase" and ds.tcol]
        return []

    def uno(sql, params=(), fuente="supabase"):
        estado["sql"], estado["params"], estado["fuente"] = sql, params, fuente
        return {"n": estado["n"], "mn": "2026-03-01 12:00:00", "mx": "2026-03-01 12:05:00"}

    def iterar(sql, params=(), lote=5000, fuente="supabase"):
        estado["sql"], estado["params"], estado["fuente"] = sql, params, fuente
        yield [c["nombre"] for c in COLS]
        yield from FILAS

    monkeypatch.setattr(exportar.db, "query", query)
    monkeypatch.setattr(exportar.db, "uno", uno)
    monkeypatch.setattr(exportar.db, "iterar", iterar)
    return estado


def _bytes(ex: exportar.Exportacion) -> bytes:
    return b"".join(ex.cuerpo)


# ── Resolucion en el borde ────────────────────────────────────────────────────
def test_relacion_desconocida_no_llega_al_sql(db_falsa):
    with pytest.raises(ValueError, match="relacion desconocida"):
        exportar.exportar("users; DROP TABLE x", "csv", "2026-03-01", "2026-03-02")
    assert db_falsa["sql"] is None


def test_fuente_desconocida_corta(db_falsa):
    with pytest.raises(ValueError, match="fuente desconocida"):
        exportar.exportar("lecturas", "csv", "2026-03-01", "2026-03-02", fuente="mysql")


def test_formato_invalido_corta(db_falsa):
    with pytest.raises(ValueError, match="formato invalido"):
        exportar.exportar("electrico_crudo", "xlsx", "2026-03-01", "2026-03-02")


@pytest.mark.parametrize("desde,hasta,msg", [
    (None, "2026-03-02", "falta 'desde'"),
    ("2026-03-01", None, "falta 'hasta'"),
    ("hoy", "2026-03-02", "'desde' invalida"),
    ("2026-03-05", "2026-03-02", "rango vacio"),
])
def test_rango_invalido(db_falsa, desde, hasta, msg):
    with pytest.raises(ValueError, match=msg):
        exportar.exportar("electrico_crudo", "csv", desde, hasta)


def test_columna_desconocida_corta(db_falsa):
    with pytest.raises(ValueError, match="columnas desconocidas: pg_shadow"):
        exportar.exportar("electrico_crudo", "csv", "2026-03-01", "2026-03-02", ["pg_shadow"])


def test_filtro_no_declarado_corta(db_falsa):
    # Given/When/Then: el electrico no declara filtros -> no se interpola nada
    with pytest.raises(ValueError, match="filtro no admitido"):
        exportar.exportar("electrico_crudo", "csv", "2026-03-01", "2026-03-02",
                          filtros={"caja": ["Caja X"]})
    assert db_falsa["sql"] is None


def test_seleccion_de_columnas_mete_la_temporal_primero(db_falsa):
    ex = exportar.exportar("electrico_crudo", "csv", "2026-03-01", "2026-03-02", ["potencia_pv1_w"])
    cuerpo = _bytes(ex).decode()
    assert cuerpo.splitlines()[0] == "timestamp,potencia_pv1_w"
    assert db_falsa["sql"].startswith("SELECT timestamp, potencia_pv1_w FROM monitoreo_sc_electrico")
    assert db_falsa["params"] == ("2026-03-01T00:00:00", "2026-03-03T00:00:00")
    assert db_falsa["fuente"] == "supabase"


# ── Las tres convenciones de reloj → un solo reloj en el archivo ──────────────
def test_pv_reloj_local_etiquetado_utc_se_exporta_tal_cual():
    v = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)          # 12:00+00, pero ese reloj YA es local
    assert exportar._iso(v, "local") == "2026-03-01T12:00:00"
    assert exportar._epoch(v, "local") == datetime(2026, 3, 1, 18, 0, tzinfo=UTC).timestamp()


def test_ambiental_utc_real_aware_se_convierte_a_local():
    v = datetime(2026, 3, 1, 18, 0, tzinfo=UTC)          # instante real
    assert exportar._iso(v, "utc") == "2026-03-01T12:00:00"
    assert exportar._epoch(v, "utc") == v.timestamp()


def test_agrodash_utc_naive_se_interpreta_como_utc():
    v = datetime(2026, 3, 1, 18, 0)                       # naive, reloj UTC
    assert exportar._iso(v, "utc") == "2026-03-01T12:00:00"
    assert exportar._epoch(v, "utc") == datetime(2026, 3, 1, 18, 0, tzinfo=UTC).timestamp()


def test_limites_del_rango_segun_la_convencion():
    pv = exportar.DATASETS[("supabase", "electrico_crudo")]
    amb = exportar.DATASETS[("supabase", "ambiental_crudo")]
    # PV: naive (compara contra el reloj local etiquetado +00)
    assert exportar.rango("2026-03-01", "2026-03-01", pv)[:2] == ("2026-03-01T00:00:00", "2026-03-02T00:00:00")
    # ambiental (timestamptz UTC real): con zona -> el dia es el dia LOCAL
    assert exportar.rango("2026-03-01", "2026-03-01", amb)[:2] == ("2026-03-01T00:00:00-06:00", "2026-03-02T00:00:00-06:00")
    # agrodash (API en hora local naive): el dia local tal cual
    d, h, _, _ = exportar._rango_api("2026-03-01", "2026-03-01")
    assert (d, h) == (datetime(2026, 3, 1, 0, 0), datetime(2026, 3, 2, 0, 0))


def test_hasta_con_hora_es_exclusivo():
    d, h, _, _ = exportar.rango("2026-03-01T06:00", "2026-03-01T18:00")
    assert h == "2026-03-01T18:00:00"


# ── CSV / DAT / MAT ───────────────────────────────────────────────────────────
def test_csv_convenciones(db_falsa):
    ex = exportar.exportar("electrico_crudo", "csv", "2026-03-01", "2026-03-02")
    lineas = _bytes(ex).decode("utf-8").splitlines()
    assert ex.nombre == "electrico_crudo_2026-03-01_2026-03-02.csv"
    assert ex.content_type.startswith("text/csv")
    assert lineas == [
        "timestamp,potencia_pv1_w,qc_ok,fuente",
        "2026-03-01T12:00:00,123.5,true,inversor",
        "2026-03-01T12:05:00,,false,",      # nulo = vacio; hora local sin sufijo
    ]


def test_dat_convenciones(db_falsa):
    ex = exportar.exportar("electrico_crudo", "dat", "2026-03-01", "2026-03-02")
    lineas = _bytes(ex).decode("utf-8").splitlines()
    assert ex.nombre.endswith(".dat")
    assert lineas[0].split("\t") == ["timestamp", "timestamp_unix", "potencia_pv1_w", "qc_ok", "fuente"]
    f1, f2 = lineas[1].split("\t"), lineas[2].split("\t")
    assert f1[0] == "2026-03-01T12:00:00"
    assert float(f1[1]) == datetime(2026, 3, 1, 18, 0, tzinfo=UTC).timestamp()   # 12:00 CR = 18:00Z
    assert f1[2:] == ["123.5", "1", "inversor"]
    assert f2[2:] == ["NaN", "0", "NaN"]    # nulo = NaN, booleano = 1/0


def test_mat_roundtrip(db_falsa):
    from scipy.io import loadmat
    import numpy as np

    ex = exportar.exportar("electrico_crudo", "mat", "2026-03-01", "2026-03-02")
    m = loadmat(BytesIO(_bytes(ex)), squeeze_me=False)
    assert ex.nombre.endswith(".mat")
    assert m["potencia_pv1_w"].shape == (2, 1)
    assert m["potencia_pv1_w"][0, 0] == 123.5 and np.isnan(m["potencia_pv1_w"][1, 0])
    assert list(m["qc_ok"][:, 0]) == [1.0, 0.0]
    assert m["timestamp_unix"].shape == (2, 1)
    assert 739_000 < m["timestamp_datenum"][0, 0] < 741_000     # 1-mar-2026 = 740042
    assert str(m["timestamp"][0, 0][0]) == "2026-03-01T12:00:00"
    assert str(m["fuente"][0, 0][0]) == "inversor"
    meta = m["meta"]
    assert str(meta["relacion"][0, 0][0]) == "monitoreo_sc_electrico"
    assert int(meta["filas"][0, 0][0, 0]) == 2


def test_mat_rechaza_rangos_que_no_caben_en_memoria(db_falsa):
    db_falsa["n"] = exportar.MAX_FILAS_MAT + 1
    with pytest.raises(exportar.ExportacionDemasiadoGrande, match="acorta el rango"):
        exportar.exportar("electrico_crudo", "mat", "2026-01-01", "2026-12-31")


def test_csv_no_tiene_tope_porque_se_emite_por_lotes(db_falsa):
    db_falsa["n"] = exportar.MAX_FILAS_MAT + 1
    assert _bytes(exportar.exportar("electrico_crudo", "csv", "2026-01-01", "2026-12-31"))


def test_identificadores_matlab():
    usados: set[str] = set()
    assert exportar._ident_matlab("potencia_pv1_w", usados) == "potencia_pv1_w"
    assert exportar._ident_matlab("2col", usados) == "c_2col"
    assert exportar._ident_matlab("a-b c", usados) == "a_b_c"
    assert exportar._ident_matlab("a_b_c", usados) == "a_b_c_2"


# ── AgroDash (via API) ────────────────────────────────────────────────────────
SENSORES = [
    {"caja": "Caja Irradiancia SC", "sensor_numero": 1, "sensor_tipo": "irradiancia", "sensor_id": "abc"},
    {"caja": "Caja B", "sensor_numero": 2, "sensor_tipo": "humedad", "sensor_id": "def"},
]


@pytest.fixture
def api_falsa(monkeypatch):
    """AgroDash simulada: sensores fijos y buckets deterministas; registra las llamadas."""
    estado = {"llamadas": [], "caida": False}

    def sensores(filtros=None):
        if estado["caida"]:
            raise exportar.agrodash_api.AgroDashNoDisponible("AgroDash inaccesible (https://x): timeout")
        f = filtros or {}
        out = [s for s in SENSORES
               if (not f.get("caja") or s["caja"] in f["caja"])
               and (not f.get("sensor_tipo") or s["sensor_tipo"] in f["sensor_tipo"])]
        return out

    def lecturas(sensor_id, desde_utc, hasta_utc, paso_seg):
        estado["llamadas"].append((sensor_id, desde_utc, hasta_utc, paso_seg))
        # la API habla en hora LOCAL naive; los buckets vacios (n=0) ya los filtro el cliente
        yield {"bucket": "2026-03-01T12:00:00", "value": 612.0, "n": 1, "min": 612.0, "max": 612.0, "std": None}
        yield {"bucket": "2026-03-01T12:05:00.500", "value": 600.5, "n": 2, "min": 590.0, "max": 611.0, "std": 14.8}

    monkeypatch.setattr(exportar.agrodash_api, "sensores", sensores)
    monkeypatch.setattr(exportar.agrodash_api, "lecturas", lecturas)
    monkeypatch.setattr(exportar.agrodash_api, "rango_disponible", lambda: {"first": "2011-01-01T00:00:00", "last": "2026-09-11T14:58:33"})
    monkeypatch.setattr(exportar.agrodash_api, "conteos", lambda sens, d, h: [40 for _ in sens])
    return estado


def test_agrodash_lecturas_con_filtros_y_paso(db_falsa, api_falsa):
    ex = exportar.exportar("lecturas", "csv", "2026-03-01", "2026-03-01", None, "agrodash",
                           {"caja": ["Caja Irradiancia SC"], "sensor_tipo": ["irradiancia"]}, paso=300)
    lineas = _bytes(ex).decode().splitlines()

    # un solo sensor pasa el filtro; el dia local se pide tal cual, naive (la API es local)
    assert len(api_falsa["llamadas"]) == 1
    sid, d, h, paso = api_falsa["llamadas"][0]
    assert sid == "abc" and paso == 300
    assert d == datetime(2026, 3, 1, 0, 0) and h == datetime(2026, 3, 2, 0, 0)
    assert lineas[0] == "ts,caja,sensor_numero,sensor_tipo,sensor_id,valor,n,minimo,maximo,desvio"
    assert lineas[1] == "2026-03-01T12:00:00,Caja Irradiancia SC,1,irradiancia,abc,612.0,1,612.0,612.0,"
    assert lineas[2].startswith("2026-03-01T12:05:00.500000,")     # fraccion respetada, hora local
    assert ex.nombre == "agrodash_lecturas_caja-irradiancia-sc_2026-03-01_2026-03-01.csv"


def test_agrodash_paso_invalido_o_no_admitido(db_falsa, api_falsa):
    with pytest.raises(ValueError, match="paso invalido"):
        exportar.exportar("lecturas", "csv", "2026-03-01", "2026-03-01", None, "agrodash", None, paso=7)
    with pytest.raises(ValueError, match="no admite 'paso'"):
        exportar.exportar("electrico_crudo", "csv", "2026-03-01", "2026-03-01", None, "supabase", None, paso=60)


def test_agrodash_estimar_exacto_con_pocos_sensores(db_falsa, api_falsa):
    # crudo: suma exacta de lecturas (40 por sensor en la API falsa) -> no es cota
    r = exportar.estimar("lecturas", "2026-03-01", "2026-03-01", "agrodash", {"caja": ["Caja B"]}, paso=0)
    assert r["sensores"] == 1 and r["filas"] == 40 and r["cota"] is False
    # con paso: min(lecturas, intervalos) por sensor -> 2 sensores x min(40, 24) = 48, cota
    r = exportar.estimar("lecturas", "2026-03-01", "2026-03-01", "agrodash", None, paso=3600)
    assert r["cota"] is True and r["sensores"] == 2 and r["filas"] == 48


def test_agrodash_estimar_heuristica_con_muchos_sensores(db_falsa, api_falsa, monkeypatch):
    muchos = [{"caja": f"C{i}", "sensor_numero": 1, "sensor_tipo": "humedad", "sensor_id": str(i)} for i in range(30)]
    monkeypatch.setattr(exportar.agrodash_api, "sensores", lambda filtros=None: muchos)
    r = exportar.estimar("lecturas", "2026-03-01", "2026-03-01", "agrodash", None, paso=0)
    assert r["cota"] is True and r["filas"] == 30 * 24 * 60


def test_agrodash_sensores_sin_tiempo_se_exporta_completo(db_falsa, api_falsa):
    ex = exportar.exportar("sensores", "csv", None, None, None, "agrodash")
    lineas = _bytes(ex).decode().splitlines()
    assert ex.nombre == "agrodash_sensores.csv"
    assert lineas == ["caja,sensor_numero,sensor_tipo,sensor_id",
                      "Caja Irradiancia SC,1,irradiancia,abc", "Caja B,2,humedad,def"]


def test_agrodash_filtro_no_declarado_corta(db_falsa, api_falsa):
    with pytest.raises(ValueError, match="filtro no admitido"):
        exportar.exportar("lecturas", "csv", "2026-03-01", "2026-03-01", None, "agrodash", {"columna": ["x"]})
    assert api_falsa["llamadas"] == []


def test_agrodash_previa_corta_en_n(db_falsa, api_falsa):
    r = exportar.previa("lecturas", "2026-03-01", "2026-03-01", ["valor"], "agrodash", None, n=1)
    assert r["columnas"] == ["ts", "valor"] and r["filas"] == [["2026-03-01T12:00:00", "612.0"]]


def test_previa_devuelve_filas_serializadas_con_limite(db_falsa):
    r = exportar.previa("electrico_crudo", "2026-03-01", "2026-03-02", ["potencia_pv1_w"], n=5)
    assert r["columnas"] == ["timestamp", "potencia_pv1_w"]
    # (la DB falsa devuelve la fila entera; lo que importa es la serializacion y el LIMIT)
    assert r["filas"][0][:2] == ["2026-03-01T12:00:00", "123.5"]
    assert db_falsa["sql"].endswith("LIMIT %s") and db_falsa["params"][-1] == 5


# ── Catalogo ──────────────────────────────────────────────────────────────────
def test_catalogo_lista_ambas_fuentes(db_falsa, api_falsa):
    c = exportar.catalogo()
    por = {f["clave"]: f for f in c["fuentes"]}
    assert por["supabase"]["disponible"] and por["agrodash"]["disponible"]
    claves = {d["clave"] for d in por["supabase"]["datasets"]}
    assert {"electrico_crudo", "radiacion_calibrada", "ambiental_crudo", "diccionario"} <= claves
    assert por["supabase"]["datasets"][0]["desde"] == "2024-11-10 00:00:00"
    assert [d["clave"] for d in por["agrodash"]["datasets"]] == ["lecturas", "sensores"]
    assert por["agrodash"]["cajas"] == [{"caja": "Caja B", "sensor_tipo": "humedad", "sensores": 1},
                                        {"caja": "Caja Irradiancia SC", "sensor_tipo": "irradiancia", "sensores": 1}]
    lect = por["agrodash"]["datasets"][0]
    assert lect["filtros"] == ["caja", "sensor_tipo"] and lect["via"] == "api" and lect["pasos"] == [0, 60, 300, 900, 3600, 86400]
    assert lect["desde"] is None and lect["hasta"] == "2026-09-11T14:58:33"   # ultimo dato, tal cual (ya es local)


def test_catalogo_tolera_una_fuente_caida(db_falsa, api_falsa):
    api_falsa["caida"] = True
    c = exportar.catalogo()
    por = {f["clave"]: f for f in c["fuentes"]}
    assert por["supabase"]["disponible"] is True
    assert por["agrodash"]["disponible"] is False
    assert por["agrodash"]["motivo"].startswith("AgroDash inaccesible")


def test_la_allowlist_no_expone_relaciones_de_sistema():
    from analizador import datos
    for clave in datos.RELACIONES:
        assert ("supabase", clave) in exportar.DATASETS
    for ds in exportar.DATASETS.values():
        assert not ds.origen.startswith("pg_")


# ── Cliente AgroDash: particion en tramos ─────────────────────────────────────
def test_tramos_respetan_el_tope_de_puntos_por_llamada():
    api = exportar.agrodash_api
    d, h = datetime(2026, 3, 1), datetime(2026, 3, 5)      # 4 dias
    # 1 min: 5760 buckets -> 2 tramos de <= 4500 puntos, contiguos y en orden
    t = api.tramos(d, h, 60)
    assert len(t) == 2 and t[0][0] == d and t[-1][1] == h
    assert all(p <= api.MAX_PUNTOS_LLAMADA for _, _, p in t)
    assert all(t[i][1] == t[i + 1][0] for i in range(len(t) - 1))
    # 1 h: 96 buckets -> un solo tramo
    assert api.tramos(d, h, 3600) == [(d, h, 96)]
    # ventanas iguales y contiguas
    v = api.ventanas(d, h, 4)
    assert len(v) == 4 and v[0][0] == d and v[-1][1] == h and all(v[i][1] == v[i + 1][0] for i in range(3))


def test_crudo_adaptativo_parte_segun_el_conteo(monkeypatch):
    """La llamada gruesa mezcla lecturas (n>1) -> se parte en k = ceil(N/OBJETIVO) ventanas;
    las ventanas ya vienen limpias (n=1) -> no se biseca. Se verifica el numero de llamadas."""
    api = exportar.agrodash_api
    llamadas = []

    def tramo_falso(sensor_id, ini, fin, puntos):
        llamadas.append((ini, fin))
        if fin - ini >= timedelta(days=10):            # la gruesa: 6000 lecturas mezcladas
            return [{"bucket": ini.isoformat(), "value": 1.0, "n": 3}] * 2000
        return [{"bucket": (ini + timedelta(minutes=m)).isoformat(), "value": 1.0, "n": 1} for m in range(5)]

    monkeypatch.setattr(api, "_tramo", tramo_falso)
    d, h = datetime(2026, 3, 1), datetime(2026, 3, 11)
    out = api._crudo("s", d, h)
    k = -(-6000 // api.OBJETIVO_CRUDO)                  # ceil
    assert len(llamadas) == 1 + k                       # gruesa + k ventanas, sin bisecciones
    assert len(out) == 5 * k and all(b["n"] == 1 for b in out)


def test_crudo_sin_mezclas_es_una_sola_llamada(monkeypatch):
    api = exportar.agrodash_api
    llamadas = []
    monkeypatch.setattr(api, "_tramo", lambda sid, ini, fin, p: (llamadas.append(1), [{"bucket": ini.isoformat(), "value": 1.0, "n": 1}])[1])
    assert len(api._crudo("s", datetime(2026, 3, 1), datetime(2026, 3, 11))) == 1 and len(llamadas) == 1
