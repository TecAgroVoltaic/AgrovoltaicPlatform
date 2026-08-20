#!/usr/bin/env python
"""
Calibracion del metodo de pronostico: la evidencia, reproducible y fuera de muestra.

Que hace
--------
Recorre la segunda mitad de la serie DIA POR DIA, y para cada dia arma la
climatologia, el peso y los cuantiles con lo que se sabia hasta el dia ANTERIOR.
Despues compara el metodo ANTERIOR contra el ACTUAL en cinco horizontes y verifica
los criterios de aceptacion.

Por que dia por dia y no un corte fijo a la mitad: asi corre en produccion. La
climatologia es una ventana MOVIL de 30 dias, no una foto. Con un corte congelado
en junio, evaluar julio sobre-corrige (el sitio se cierra mas de tarde a medida
que avanza la estacion) y la medicion dice mas del corte que del metodo. La
primera mitad queda como periodo de calentamiento: son los dias que el metodo
necesita para tener climatologia.

    python scripts/calibrar.py                     # tablas + criterios
    python scripts/calibrar.py --sesgo-por-hora    # el sesgo diurno, hora por hora
    python scripts/calibrar.py --horizonte 10800   # cambia el horizonte del detalle

No toca la red: lee el parquet cacheado (`python -m pronostico.data` lo refresca).

La linea que no se cruza
------------------------
Esto es calibracion OFFLINE, con particion fija, y su resultado se congela en el
codigo. NO es algo que el agente haga al predecir. Es la misma linea que se trazo
al borrar `comparar_configuraciones`: elegir una configuracion mirando el error de
la consulta que se esta respondiendo no es predecir, es ajustar contra la
respuesta. Calibrar un metodo UNA vez contra un conjunto reservado es seleccion de
modelo, y es legitimo justamente porque el conjunto queda reservado.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pronostico import config, data                             # noqa: E402
from pronostico.domain import Variable                          # noqa: E402
from pronostico.forecasters import climatologia, estimador, nwp, riesgo  # noqa: E402
from pronostico.physics import clear_sky_ghi, clear_sky_index   # noqa: E402

HORIZONTES_MIN = (30, 60, 120, 180, 360)

# Configuracion ANTERIOR a este trabajo: persistencia pura de la mediana de 60 min,
# sin ajuste diurno y sin contraccion. Es el punto de comparacion honesto.
ANTES = dict(estadistico="mediana", peso=1.0, ajuste_diurno=False, centrar=False)
AHORA: dict = dict()          # los defaults del estimador

# La banda tambien cambio, asi que compararlas con la MISMA banda escondería medio
# arreglo. "antes" se evalua con su banda de entonces: +-1 sigma de los kt* de la
# ultima hora, que no crecia con el horizonte.
BANDA_VIEJA = "sigma-reciente"

LIMITE_CONOCIDO = """
Limite conocido (medido, no tapado): a las 16 h el sesgo queda en -19 %. Se lee
peor de lo que es: a esa hora el valor real medio son 101 W/m2, asi que ese 19 %
son -19 W/m2, el error absoluto mas chico del dia. En esa misma hora el error
medio bajo de 71 a 42 W/m2 (-40 %). El criterio esta expresado en porcentaje y por
eso castiga justo donde el denominador es mas chico; se deja como esta en vez de
aflojarlo, porque cambiar el criterio despues de ver el resultado es el error que
este arnes existe para evitar.

Lo que si vale mirar es la AMPLITUD: el defecto original no era errar, era errar
hacia abajo de manana (-27 %) y hacia arriba de tarde (+37 %), 64 puntos de
diferencia dentro del mismo dia. Un sesgo que cambia de signo segun la hora no se
puede corregir de un saque ni explicar al usuario. Ahora son 24 puntos, todos del
mismo lado y chicos en W/m2.

Queda ademas un sesgo global de -4 a -13 W/m2 segun el horizonte, mas marcado
entre 1 y 2 h. Con 78 dias de historia, de los cuales el periodo evaluado
atraviesa un cambio de estacion fuerte (el nivel del sitio cae de 0,59 en junio a
0,42 en julio), no se puede separar "el metodo se inclina" de "julio fue raro".
Revisar con `scripts/calibrar.py` cuando haya mas de una estacion de datos.
"""

# Criterios de aceptacion (los del plan).
MAX_SESGO_PCT = 10.0          # sesgo por hora objetivo, horas 9..16, a 3 h
COBERTURA_MIN, COBERTURA_MAX = 60.0, 80.0
MEJORA_MIN_LARGO = 8.0        # % de RMSE a 3 h y 6 h


def _rejilla(variable: str) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Medida, techo y kt* sobre la rejilla regular. Misma receta que climatologia."""
    serie = data.cargar_serie(variable)
    if serie.empty:
        raise SystemExit(f"sin datos cacheados para {variable!r}; corre "
                         f"`python -m pronostico.data {variable}`")
    idx = pd.date_range(serie.index.min().ceil(climatologia.PASO),
                        serie.index.max().floor(climatologia.PASO),
                        freq=climatologia.PASO, tz=serie.index.tz)
    g = serie.reindex(idx, method="nearest", tolerance=climatologia.TOLERANCIA)
    cs = clear_sky_ghi(idx, **data.SITE)
    kt = clear_sky_index(g, cs, config.UMBRAL_CS).reindex(idx)
    return g, cs, kt


def _predicciones(g, cs, kt, corte, hmin, cfg, banda_vieja=False,
                  con_modelos=False) -> pd.DataFrame:
    """pred vs real en la ventana de evaluacion, con climatologia DIA POR DIA.

    Para cada dia D del periodo evaluado, todo lo que el metodo usa (perfil
    horario, peso, cuantiles) se arma con datos anteriores a D. Es exactamente la
    barrera de produccion: `climatologia._corte` lleva el corte al inicio del dia.
    """
    seg = hmin * 60
    pasos = seg // int(pd.Timedelta(climatologia.PASO).total_seconds())
    um = config.UMBRAL_CS
    real = g.shift(-pasos)
    cs_obj = cs.shift(-pasos)
    evaluables = (g.index >= corte) & (cs > um) & (cs_obj > um) & real.notna()

    trozos = []
    for dia in sorted({t.date() for t in g.index[evaluables]}):
        # Un solo `antes_de` por dia: el cache de `climatologia` queda caliente y
        # no se recalcula el clear-sky del historico en cada instante.
        ancla = pd.Timestamp(dia, tz=g.index.tz)
        kt_hat = estimador.kt_a_persistir_serie(kt, seg, antes_de=ancla, **cfg)
        # La banda se ancla en el valor SIN centrar: es contra ese que se midieron
        # los cuantiles. Anclarla en el centrado aplicaria la correccion dos veces.
        kt_crudo = estimador.kt_a_persistir_serie(kt, seg, antes_de=ancla,
                                                  **{**cfg, "centrar": False})
        q = climatologia.cuantiles_error(seg, antes_de=ancla)
        # Banda CONDICIONADA al regimen del cielo: los cuantiles se miden sobre
        # momentos que venian igual de movidos. La turbulencia es causal, asi que
        # filtrar por ella no mete informacion del futuro.
        reg = riesgo.clasificar_serie(riesgo._turbulencia(kt), antes_de=ancla)
        q_reg = {r: climatologia.cuantiles_error(seg, antes_de=ancla, regimen=r)
                 for r in riesgo.REGIMENES}
        del_dia = evaluables & pd.Series([t.date() == dia for t in g.index], index=g.index)
        if not del_dia.any():
            continue
        if con_modelos:
            # ADDON: se mezcla la opinion de los modelos numericos con el peso
            # DERIVADO para este horizonte. Misma barrera: todo se calibra con
            # datos anteriores al dia evaluado.
            w = nwp.peso_mezcla(seg, antes_de=ancla)
            if w > 0:
                mos = pd.Series(
                    [nwp.kt_pronosticado(t + pd.Timedelta(minutes=hmin), antes_de=ancla)
                     for t in g.index[del_dia]], index=g.index[del_dia], dtype=float)
                kt_hat = kt_hat.copy()
                kt_hat.loc[del_dia] = ((1 - w) * kt_hat[del_dia]
                                       + w * mos.fillna(kt_hat[del_dia])).clip(lower=0)

        marco = pd.DataFrame({
            "pred": (kt_hat * cs_obj)[del_dia],
            "real": real[del_dia],
            "hora_obj": [(t + pd.Timedelta(minutes=hmin)).hour for t in g.index[del_dia]],
        })
        if banda_vieja:
            # +-1 sigma de los kt* de la ultima hora: la banda anterior.
            ventana = max(2, round(pd.Timedelta("60min") / pd.Timedelta(climatologia.PASO)))
            sigma = kt.rolling(ventana, min_periods=3).std(ddof=0)
            marco["lo"] = ((kt_hat - sigma).clip(lower=0) * cs_obj)[del_dia]
            marco["hi"] = ((kt_hat + sigma) * cs_obj)[del_dia]
        elif q is not None:
            bajo = pd.Series(q[0], index=g.index); alto = pd.Series(q[2], index=g.index)
            for r, qr in q_reg.items():
                if qr is not None:
                    bajo[reg == r] = qr[0]; alto[reg == r] = qr[2]
            marco["lo"] = ((kt_crudo + bajo).clip(lower=0) * cs_obj)[del_dia]
            marco["hi"] = ((kt_crudo + alto) * cs_obj)[del_dia]
            marco["reg"] = reg[del_dia]
        trozos.append(marco.dropna(subset=["pred", "real"]))

    if not trozos:
        raise SystemExit("no quedaron pares para evaluar; serie demasiado corta")
    return pd.concat(trozos)


def _metricas(d: pd.DataFrame) -> dict:
    """MAE, RMSE, sesgo y cobertura de la banda sobre los pares (pred, real)."""
    e = d["pred"] - d["real"]
    r = {"n": len(d), "mae": float(e.abs().mean()),
         "rmse": float(np.sqrt((e ** 2).mean())), "bias": float(e.mean()),
         "real": float(d["real"].mean())}
    if "lo" in d:
        b = d.dropna(subset=["lo", "hi"])
        r["cobertura"] = float(((b["real"] >= b["lo"]) & (b["real"] <= b["hi"])).mean()) * 100
        r["ancho"] = float((b["hi"] - b["lo"]).mean())
        if "reg" in b:
            # La cobertura POR REGIMEN es la que delata si la banda esta
            # mintiendo: una global de 68 % puede esconder 83 % en calmo y 64 %
            # en turbulento, que es exactamente lo que pasaba.
            por = b.dropna(subset=["reg"]).groupby("reg", observed=True).apply(
                lambda x: ((x["real"] >= x["lo"]) & (x["real"] <= x["hi"])).mean() * 100,
                include_groups=False)
            r["cobertura_por_regimen"] = {k: round(v, 1) for k, v in por.items()}
    else:
        r["cobertura"], r["ancho"] = float("nan"), float("nan")
    return r


def _sesgo_por_hora(d: pd.DataFrame) -> pd.DataFrame:
    """Sesgo del metodo segun la HORA que se pronostica. Es la tabla que delata
    el defecto principal: persistir la manana hacia la tarde."""
    return d.groupby("hora_obj").apply(
        lambda x: pd.Series({
            "n": len(x), "real": x.real.mean(),
            "sesgo": (x.pred - x.real).mean(),
            "sesgo_pct": (x.pred - x.real).mean() / x.real.mean() * 100,
            "mae": (x.pred - x.real).abs().mean(),
        }), include_groups=False)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variable", default=Variable.IRRADIANCIA.value)
    ap.add_argument("--sesgo-por-hora", action="store_true",
                    help="muestra el sesgo hora por hora (antes vs ahora)")
    ap.add_argument("--horizonte", type=int, default=10800,
                    help="horizonte en segundos para el detalle por hora")
    ap.add_argument("--json", dest="salida_json", default=None,
                    help="vuelca los numeros a un JSON (para armar reportes sin "
                         "transcribirlos a mano, que es como se cuelan los errores)")
    args = ap.parse_args()

    climatologia.reiniciar_cache()
    g, cs, kt = _rejilla(args.variable)
    corte = g.index[len(g) // 2]
    print(f"Serie   : {args.variable}  {g.index.min():%Y-%m-%d} -> {g.index.max():%Y-%m-%d}"
          f"  ({int(g.notna().sum())} lecturas en rejilla)")
    print(f"Corte   : {corte:%Y-%m-%d %H:%M}  (antes calibra, despues evalua)\n")

    print("Metodo ANTERIOR: persistencia pura de la mediana de 60 min, sin ajuste")
    print("                 diurno; banda de +-1 sigma de la ultima hora")
    print("Metodo ACTUAL  : anomalia de kt* con EWMA, ajuste diurno, peso derivado")
    print("                 y centrado; banda por cuantiles historicos del horizonte")
    if nwp.habilitado():
        print("ADDON +modelos : ACTUAL mezclado con la nubosidad de "
              f"{len(nwp.MODELOS)} modelos numericos")
    else:
        print("ADDON +modelos : APAGADO (prender con NWP_HABILITADO=1)")
    print()
    cab = (f"{'h':>6} {'':<8} {'n':>6} {'MAE':>7} {'RMSE':>7} {'sesgo':>7} "
           f"{'cobert%':>8} {'ancho':>7}")
    print(cab)
    print("-" * len(cab))

    filas: dict[int, dict] = {}
    detalle: dict[str, pd.DataFrame] = {}
    hd = args.horizonte // 60
    for hmin in HORIZONTES_MIN:
        pares = {}
        variantes = [("antes", ANTES, False), ("ahora", AHORA, False)]
        if nwp.habilitado():
            variantes.append(("+modelos", AHORA, True))
        for etiqueta, cfg, con_modelos in variantes:
            pares[etiqueta] = _predicciones(g, cs, kt, corte, hmin, cfg,
                                            banda_vieja=(etiqueta == "antes"),
                                            con_modelos=con_modelos)
            if hmin == hd:
                detalle[etiqueta] = pares[etiqueta]
        filas[hmin] = {k: _metricas(v) for k, v in pares.items()}
        for etiqueta, _cfg, _cm in variantes:
            r = filas[hmin][etiqueta]
            print(f"{hmin:>5}m {etiqueta:<8} {r['n']:>6} {r['mae']:>7.1f} {r['rmse']:>7.1f} "
                  f"{r['bias']:>7.1f} {r['cobertura']:>8.1f} {r['ancho']:>7.1f}")
        print("-" * len(cab))

    if hd not in HORIZONTES_MIN:
        for etiqueta, cfg in (("antes", ANTES), ("ahora", AHORA)):
            detalle[etiqueta] = _predicciones(g, cs, kt, corte, hd, cfg,
                                              banda_vieja=(etiqueta == "antes"))

    print(f"\nSesgo por HORA OBJETIVO a {hd} min de anticipacion "
          f"(el defecto principal, y su arreglo):")
    sa, sb = _sesgo_por_hora(detalle["antes"]), _sesgo_por_hora(detalle["ahora"])
    comp = pd.DataFrame({"n": sa["n"], "real": sa["real"],
                         "sesgo%_antes": sa["sesgo_pct"], "sesgo%_ahora": sb["sesgo_pct"],
                         "mae_antes": sa["mae"], "mae_ahora": sb["mae"]})
    print(comp.round(1).to_string())
    if args.salida_json:
        _volcar(args.salida_json, g, corte, hd, filas, comp)
        print(f"\nNumeros volcados a {args.salida_json}")
    return _veredicto(filas, comp)


def _volcar(ruta, g, corte, hd, filas, comp) -> None:
    """Vuelca las mismas tablas que se imprimen, en JSON."""
    import json
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({
            "serie": {"desde": g.index.min().isoformat(),
                      "hasta": g.index.max().isoformat(),
                      "lecturas": int(g.notna().sum()),
                      "corte": corte.isoformat()},
            "addon_activo": nwp.habilitado(),
            "horizonte_detalle_min": hd,
            "por_horizonte": {str(h): v for h, v in filas.items()},
            "por_hora": comp.reset_index().to_dict(orient="records"),
        }, f, ensure_ascii=False, indent=2)


def _veredicto(filas: dict, comp: pd.DataFrame) -> int:
    """Los criterios de aceptacion, cada uno con su numero al lado.

    Devuelve 0 si pasan todos. Un criterio que falla no es una opinion: es una
    linea que dice cuanto falto.
    """
    print("\n" + "=" * 72)
    print("CRITERIOS DE ACEPTACION")
    print("=" * 72)
    ok = True

    dia = comp[(comp.index >= 9) & (comp.index <= 16)]
    peor = dia["sesgo%_ahora"].abs().max()
    hora_peor = dia["sesgo%_ahora"].abs().idxmax()
    paso = peor <= MAX_SESGO_PCT
    ok &= paso
    print(f"[{'OK ' if paso else 'NO '}] 1. Sesgo por hora (9-16 h) dentro de +-{MAX_SESGO_PCT:.0f} %: "
          f"peor {peor:.1f} % a las {hora_peor} h "
          f"(antes: {dia['sesgo%_antes'].abs().max():.1f} %)")
    # El AMPLITUD del sesgo a lo largo del dia importa mas que su valor puntual:
    # el defecto original no era errar, era errar hacia ARRIBA de tarde y hacia
    # ABAJO de manana. Un sesgo parejo se corrige de un saque; uno que cambia de
    # signo segun la hora, no. Se informa al lado, no reemplaza al criterio.
    amp_antes = dia["sesgo%_antes"].max() - dia["sesgo%_antes"].min()
    amp_ahora = dia["sesgo%_ahora"].max() - dia["sesgo%_ahora"].min()
    print(f"      amplitud del sesgo a lo largo del dia: {amp_antes:.0f} puntos -> "
          f"{amp_ahora:.0f} puntos")

    fuera = [f"{h}m={r['ahora']['cobertura']:.0f}%" for h, r in filas.items()
             if not COBERTURA_MIN <= r["ahora"]["cobertura"] <= COBERTURA_MAX]
    paso = not fuera
    ok &= paso
    print(f"[{'OK ' if paso else 'NO '}] 2. Cobertura de la banda entre {COBERTURA_MIN:.0f} y "
          f"{COBERTURA_MAX:.0f} %: " + ("todas dentro" if paso else "fuera " + ", ".join(fuera)))

    peores = [f"{h}m {(r['ahora']['rmse'] / r['antes']['rmse'] - 1) * 100:+.1f} %"
              for h, r in filas.items() if r["ahora"]["rmse"] > r["antes"]["rmse"]]
    paso = not peores
    ok &= paso
    print(f"[{'OK ' if paso else 'NO '}] 3a. RMSE no peor en ningun horizonte: "
          + ("ninguno empeora" if paso else "empeora " + ", ".join(peores)))

    largos = {h: (1 - filas[h]["ahora"]["rmse"] / filas[h]["antes"]["rmse"]) * 100
              for h in (180, 360) if h in filas}
    paso = all(v >= MEJORA_MIN_LARGO for v in largos.values())
    ok &= paso
    print(f"[{'OK ' if paso else 'NO '}] 3b. RMSE al menos {MEJORA_MIN_LARGO:.0f} % mejor a 3 h y 6 h: "
          + ", ".join(f"{h}m {v:+.1f} %" for h, v in largos.items()))

    print("=" * 72)
    print("TODOS LOS CRITERIOS PASAN" if ok else "HAY CRITERIOS SIN CUMPLIR")
    if not ok:
        print(LIMITE_CONOCIDO)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
