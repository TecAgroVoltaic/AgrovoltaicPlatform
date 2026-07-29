"""
Validacion de la capa fisica del pronostico de irradiancia (Paso 1 — de-riesgo).

ANTES de construir el agente confirmamos que la descomposicion por cielo despejado
funciona sobre los datos reales de `Caja Irradiancia SC` (AgroDash, San Carlos).
De un solo overlay verificamos las tres cosas que hunden estos proyectos:

  1. FASE / TIMEZONE  -> el pico de irradiancia medida debe caer al mediodia solar
     local (~11-12h). Si esta corrido ~6h hay bug de timezone (el error #1 en datos
     solares). Los timestamps de AgroDash son hora LOCAL (UTC-6), sin tz -> los
     etiquetamos como America/Costa_Rica (no movemos el reloj, solo el significado).
  2. MAGNITUD / CALIBRACION -> la medida no debe superar sistematicamente al cielo
     despejado y su pico debe rondar ~1000-1150 W/m2. Confirma que ya esta en W/m2.
  3. kt* SANO -> kt* = GHI_medida / GHI_cieloclaro debe caer mayormente en [0,1]
     (con algun >1 puntual por realce de nubes). Es la variable que pronosticaremos.

Solo-lectura (SET TRANSACTION READ ONLY). Genera PNGs en docs/pronostico/img/.
Credenciales por variables de entorno (AGRODASH_PASSWORD obligatoria).
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # backend sin ventana: solo guardamos imagenes
import matplotlib.pyplot as plt
import pandas as pd
import psycopg
from pvlib.location import Location

from pronostico import config

# --- Parametros del sitio (fuente de verdad: config) y ventana -------------
LAT, LON, ALT = config.LAT, config.LON, config.ALT   # San Carlos, C.R. (nivel ciudad)
TZ = config.TZ                                        # UTC-6 fijo, sin horario de verano
VENTANA_INI, VENTANA_FIN = "2026-05-05", "2026-05-15"  # 10 dias, mes de buena cobertura
SENSOR_TYPE = config.SENSOR_TYPE                      # unico en Caja Irradiancia SC (6 canales)
UMBRAL_CS = config.UMBRAL_CS                          # W/m2: kt* solo de dia (evita /0 nocturno)

IMG = Path(__file__).resolve().parents[1] / "docs" / "pronostico" / "img"
IMG.mkdir(parents=True, exist_ok=True)

# --- 1) Traer la serie medida (solo lectura) -------------------------------
dsn = config.dsn()
SQL = """
    SELECT r.sensor_id, b.name AS box, r.value, r.created_at
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    JOIN boxes   b ON b.id = s.box_id
    WHERE s.type = %s
      AND r.created_at >= %s AND r.created_at < %s
    ORDER BY r.created_at
"""
print(f"Conectando a {dsn['host']}:{dsn['port']}/{dsn['dbname']} (solo lectura)...")
with psycopg.connect(**dsn, autocommit=True) as conn:
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")  # cinturon de seguridad
    with conn.cursor() as cur:
        cur.execute(SQL, (SENSOR_TYPE, VENTANA_INI, VENTANA_FIN))
        rows = cur.fetchall()

df = pd.DataFrame(rows, columns=["sensor_id", "box", "value", "created_at"])
if df.empty:
    raise SystemExit("Sin lecturas para esa ventana/tipo. Revisa VENTANA_* o SENSOR_TYPE.")
df["value"] = df["value"].astype(float)
df["sensor_id"] = df["sensor_id"].astype(str)  # psycopg v3 devuelve UUID; a str

# elegir el canal con mas datos (hay 6 en la caja)
top = df["sensor_id"].value_counts().idxmax()
print(f"Caja(s): {sorted(df['box'].unique())} | canales: {df['sensor_id'].nunique()} | "
      f"uso el de mas datos {top} ({(df['sensor_id'] == top).sum()} lecturas)")
s = df[df["sensor_id"] == top].copy()

# indice temporal tz-aware: el timestamp es hora LOCAL (UTC-6) -> lo etiquetamos, no lo movemos
idx = pd.to_datetime(s["created_at"]).dt.tz_localize(TZ)
medida = pd.Series(s["value"].values, index=idx, name="ghi").sort_index()
medida = medida[~medida.index.duplicated(keep="first")]

# --- 2) Cielo despejado con pvlib ------------------------------------------
loc = Location(latitude=LAT, longitude=LON, altitude=ALT, tz=TZ)
ghi_cs = loc.get_clearsky(medida.index)["ghi"]   # Ineichen + turbidez Linke climatologica

# --- 3) kt* (indice de cielo despejado) ------------------------------------
mask = ghi_cs > UMBRAL_CS
ktstar = (medida[mask] / ghi_cs[mask]).clip(lower=0)

# --- Resumen numerico ------------------------------------------------------
h_med = int(medida.groupby(medida.index.hour).mean().idxmax())
h_cs = int(ghi_cs.groupby(ghi_cs.index.hour).mean().idxmax())
print("\n===== RESUMEN =====")
print(f"Medida   W/m2: min={medida.min():.1f}  max={medida.max():.1f}  media={medida.mean():.1f}")
print(f"ClearSky W/m2: max={ghi_cs.max():.1f}")
print(f"Hora del pico (local): medida={h_med}h | clear-sky={h_cs}h  (deben coincidir ~11-12h)")
print(f"kt* : mediana={ktstar.median():.2f}  p10={ktstar.quantile(.1):.2f}  p90={ktstar.quantile(.9):.2f}")
print(f"kt* dentro de [0,1.2]: {100 * ((ktstar >= 0) & (ktstar <= 1.2)).mean():.1f}%")

# --- Figuras ----------------------------------------------------------------
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(medida.index, medida.values, lw=0.7, label="Irradiancia medida (SC)")
ax.plot(ghi_cs.index, ghi_cs.values, lw=1.1, ls="--", label="Cielo despejado (pvlib)")
ax.set_ylabel("GHI [W/m2]"); ax.legend(loc="upper right")
ax.set_title(f"Medida vs cielo despejado - Caja Irradiancia SC - {VENTANA_INI}..{VENTANA_FIN}")
fig.autofmt_xdate(); fig.tight_layout(); fig.savefig(IMG / "01_overlay_ventana.png", dpi=110); plt.close(fig)

if not ktstar.empty:
    kt_dia = ktstar.groupby(ktstar.index.date).median()
    dia = kt_dia.idxmax()  # el dia mas despejado de la ventana
    md, cd = medida[medida.index.date == dia], ghi_cs[ghi_cs.index.date == dia]
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(md.index, md.values, label="Medida")
    ax.plot(cd.index, cd.values, ls="--", label="Cielo despejado")
    ax.set_ylabel("GHI [W/m2]"); ax.legend()
    ax.set_title(f"Dia mas despejado: {dia}  (kt* mediano={kt_dia.max():.2f})")
    fig.autofmt_xdate(); fig.tight_layout(); fig.savefig(IMG / "02_dia_despejado.png", dpi=110); plt.close(fig)

fig, ax = plt.subplots(figsize=(7, 4))
ax.hist(ktstar.values, bins=60, range=(0, 1.4))
ax.axvline(1.0, color="k", ls=":", lw=1)
ax.set_xlabel("kt*"); ax.set_ylabel("frecuencia")
ax.set_title("Distribucion de kt* (indice de cielo despejado)")
fig.tight_layout(); fig.savefig(IMG / "03_hist_ktstar.png", dpi=110); plt.close(fig)

print(f"\nImagenes en {IMG}/ : 01_overlay_ventana.png, 02_dia_despejado.png, 03_hist_ktstar.png")
