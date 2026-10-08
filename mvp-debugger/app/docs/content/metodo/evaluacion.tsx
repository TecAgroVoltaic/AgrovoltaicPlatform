import { Note, IC, Table } from "@/app/docs/ui";
import { Formula } from "@/app/docs/content/metodo/Formula";

/** El backtest, la detección de anomalías y las constantes: cómo se evalúa. */
export function MetodoEvaluacion() {
  return (
    <>
      <h2>El backtest: reconstruir el pasado</h2>
      <p><IC>backtest.py</IC> reaplica el método sobre el histórico ya remuestreado a franjas (<IC>bucket</IC> ∈ 15min / 30min / h / D). La reconstrucción es siempre <strong>una franja hacia adelante</strong>.</p>
      <Formula nota={<>N = índice de franja · el <IC>N−1</IC> es el <IC>.shift(1)</IC> de pandas · <IC>um</IC> = <IC>UMBRAL_CS</IC> = 20 W/m².</>}>
        real(N)  = media de las lecturas de la franja N<br />
        techo(N) = GHI<sub>cs</sub>(inicio de la franja N)<br />
        kt*(N)   = real(N) / techo(N)   si techo(N) &gt; um , si no NaN<br />
        pred(N)  = kt*(N−1) × techo(N) ,  y 0 si techo(N) &lt; um<br />
        ingenuo(N) = real(N−1)
      </Formula>
      <p>En humedad de suelo no hay techo: <IC>pred(N) = real(N−1)</IC>, que es <em>idéntico</em> al baseline ingenuo. Por eso su skill da 0 % por construcción, no por mal modelo, y la consola lo muestra como <strong>n/a</strong> en vez de un «+0 %» que parecería un fracaso.</p>

      <h3>Las cuatro métricas</h3>
      <Formula nota={<>n = pares (real, pred) que sobreviven al alineado; se descarta toda franja con algún NaN.</>}>
        e(N) = pred(N) − real(N)
      </Formula>
      <Table
        head={["Métrica", "Fórmula", "Cómo se lee"]}
        rows={[
          [<IC>mae</IC>, <span className="mono">(1/n) · Σ |e(N)|</span>, "Error típico en las unidades de la variable (W/m² o cuentas ADC). No distingue si sobra o falta."],
          [<IC>bias</IC>, <span className="mono">(1/n) · Σ e(N)</span>, "El sesgo, con signo: positivo = el método sobreestima en promedio; cerca de 0 = los errores se compensan."],
          [<IC>error_rel_pct</IC>, <span className="mono">mae / media(real) × 100</span>, <>MAE como porcentaje del nivel medio. <IC>null</IC> si la media es 0.</>],
          [<IC>skill_pct</IC>, <span className="mono">(1 − mae / mae_ingenuo) × 100</span>, <>Mejora sobre el baseline «igual que la franja anterior». &gt; 0 = le gana; 0 = empata; &lt; 0 = es peor. Vale <IC>0.0</IC> si <IC>mae_ingenuo</IC> es 0.</>],
        ]}
      />
      <p>El skill es la métrica que importa: un MAE de 30 W/m² no dice nada por sí solo (depende del sitio y del día), mientras que «cuánto le gana al modelo ingenuo» sí compara métodos sobre el mismo problema.</p>
      <Note>
        <div><b>Detalle del <IC>error_rel_pct</IC>.</b> La media del denominador incluye las franjas nocturnas (real ≈ 0, pred = 0), que la empujan hacia abajo y por lo tanto <b>inflan</b> el porcentaje. Conviene leerlo junto al MAE crudo, no en su lugar.</div>
      </Note>

      <h3>Dos advertencias al comparar errores</h3>
      <Note kind="warn">
        <div><b>El MAE de distintas resoluciones no es estrictamente comparable.</b> El <IC>bucket</IC> fija a la vez el <b>horizonte</b> (una franja hacia adelante) y el <b>promediado</b> del objetivo, así que al cambiarlo cambia <em>qué se está prediciendo</em>: la media horaria y la media de 15 minutos son objetivos distintos, y el promediado ya suaviza parte de la variabilidad. La caída de 32 a 14 W/m² del 22-jul al pasar de 1 h a 15 min es sobre todo efecto del horizonte más corto, pero no es una comparación estricta.</div>
      </Note>
      <Note kind="warn">
        <div><b>El backtest es una simplificación a nivel de franja; no es el forecaster en vivo.</b> <IC>POST /forecast</IC> usa un lookback de 60 minutos y la <b>mediana</b> de los kt* a resolución instantánea; el backtest usa el kt* de <b>una sola franja previa ya promediada</b> y evalúa el techo en el <b>borde</b> de la franja, no en su centro. Los errores que reporta el backtest orientan sobre el método, pero no son los del pronóstico en producción.</div>
      </Note>

      <h2>Detección de anomalías</h2>
      <p><IC>anomalias.py</IC> es 100 % determinista: el LLM solo narra los hallazgos. La señal analizada es <strong>kt*</strong> en irradiancia (quitar la parábola solar hace que un valor raro signifique «nube extraña o falla», y no simplemente «es de día») y el valor crudo en humedad.</p>
      <Formula nota={<>MAD = <i>median absolute deviation</i>. Si MAD = 0 el z se define como 0 (evita dividir por cero). Umbral: |z| &gt; 3,5, y solo con n ≥ 8 muestras.</>}>
        MAD(x) = mediana( |x − mediana(x)| )<br />
        z(x) = 0,6745 · (x − mediana(x)) / MAD(x)
      </Formula>
      <p><strong>De dónde sale el 1,4826 (y su inverso, 0,6745).</strong> Para una distribución normal, MAD ≈ 0,6745·σ, o sea σ ≈ <strong>1,4826</strong>·MAD. Multiplicar por 0,6745 al dividir por MAD equivale a dividir por 1,4826·MAD: deja el z robusto <em>en las mismas unidades</em> que un z-score clásico, y por eso el umbral 3,5 se lee como «tres desviaciones y media».</p>
      <p><strong>Por qué mediana y MAD en vez de media y desviación.</strong> Porque la media y la desviación las arrastran justamente los valores atípicos que se quieren detectar: con un outlier suficientemente grande, el z clásico de ese outlier se achica y el detector se ciega a sí mismo. La mediana y el MAD tienen punto de ruptura 50 %.</p>
      <Table
        head={["Hallazgo", "Regla exacta", "Qué está diciendo"]}
        rows={[
          [<IC>outlier</IC>, <span className="mono">|z| &gt; 3,5 · requiere n ≥ 8</span>, "Un punto que no pertenece al comportamiento de la ventana."],
          [<IC>drift</IC>, <span className="mono">|m₂ − m₁| &gt; 3 · 1,4826 · MAD · requiere n ≥ 12</span>, <>Salto de nivel: m₁ y m₂ son las medianas de la primera y la segunda mitad de la ventana. El <IC>1,4826 · MAD</IC> es la σ robusta, así que el criterio es «se movió más de 3σ».</>],
          [<IC>sensor_plano</IC>, <span className="mono">desv(ventana) = 0 exacto · requiere n ≥ 5</span>, "Valor pegado (stuck), el patrón clásico del DS18B20 en 85 °C. Se evalúa sobre el crudo, no sobre kt*."],
          [<IC>fuera_de_rango</IC>, <span className="mono">[−50, 1500] W/m² · [0, 65535] ADC</span>, "El crudo se salió del rango físicamente plausible: es error de sensor, no meteorología."],
          [<IC>sin_datos_recientes</IC>, <span className="mono">now − última lectura &gt; 3600 s</span>, "Frescura: más de una hora sin dato nuevo = posible outage (el caso de San Carlos hoy)."],
        ]}
      />
      <p>El estado global se resuelve por prioridad, y el orden importa: <IC>frescura</IC> → <IC>plano</IC> → <IC>datos_insuficientes</IC> (n &lt; 5) → <IC>anomalias_detectadas</IC> → <IC>normal</IC>. Un sensor caído se reporta como caído aunque además tenga outliers, porque esa es la falla que hay que atender primero. Se devuelven como máximo 50 hallazgos.</p>
      <Note>
        <div><b>La ventana se ancla en la última lectura</b>, no en el reloj (<IC>desde = último_ts − ventana_min</IC>). Con la ingesta congelada eso siempre encuentra datos que analizar; quien delata el congelamiento es la <b>frescura</b>, que sí se mide contra el reloj real.</div>
      </Note>

      <h2>Las constantes, de un vistazo</h2>
      <Table
        head={["Constante", "Valor", "Dónde vive", "Qué gobierna"]}
        rows={[
          [<IC>UMBRAL_CS</IC>, "20 W/m²", <IC>config.py</IC>, "Frontera día/noche para kt*; evita dividir por ~0"],
          [<IC>MIN_MUESTRAS</IC>, "3", <IC>forecasters/persistence.py</IC>, "Mínimo de kt* útiles para animarse a pronosticar"],
          [<IC>MIN_MUESTRAS_HUM</IC>, "3", <IC>forecasters/humidity.py</IC>, "Lo mismo para humedad de suelo"],
          [<IC>_LOOKBACK_MIN</IC>, "60 min", <IC>tools/forecast_tool.py</IC>, "Ventana de la que sale el estado reciente"],
          [<><IC>_MIN_SEG</IC> / <IC>_MAX_SEG</IC></>, "60 s / 21 600 s", <IC>tools/forecast_tool.py</IC>, "Horizonte permitido (1 min – 6 h), acotado duro"],
          [<IC>_Z_OUTLIER</IC>, "3,5", <IC>anomalias.py</IC>, "Umbral del z robusto"],
          [<IC>_FRESCURA_MAX_SEG</IC>, "3600 s", <IC>anomalias.py</IC>, "Cuándo la última lectura pasa a ser «vieja»"],
          [<IC>_MAX_ANOM</IC>, "50", <IC>anomalias.py</IC>, "Cota de hallazgos devueltos"],
          [<><IC>LAT</IC> / <IC>LON</IC> / <IC>ALT</IC></>, "10,33 / −84,42 / 600 m", <IC>config.py</IC>, "Geografía que alimenta el cielo despejado"],
        ]}
      />
    </>
  );
}
