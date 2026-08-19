"use client";
// Sección «Método y fórmulas»: la matemática del agente de pronóstico, cada
// expresión anclada al archivo del que sale. Es una página larga a propósito:
// el método solo se entiende leído de corrido (descomposición → kt* →
// persistencia → banda → evaluación); partirlo en varias secciones obligaría a
// saltar entre ellas para seguir un mismo hilo, que es peor que el largo.
import type { ReactNode } from "react";
import { Page, Note, IC, Table, Meta } from "../ui";

// Fórmula destacada. El proyecto no usa KaTeX ni MathJax y no hace falta: estas
// expresiones son de una línea, así que una librería de matemáticas sería una
// dependencia nueva a cambio de nada. `nota` lleva la definición de símbolos.
function Formula({ nota, children }: { nota?: ReactNode; children: ReactNode }) {
  return (
    <div className="dx-formula">
      <div className="expr mono">{children}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

export function Metodo() {
  return (
    <Page
      crumb="Método y fórmulas"
      title="Método y fórmulas"
      lead="La matemática del agente de pronóstico, fórmula por fórmula, con el archivo del que sale cada una. No hay machine learning: hay física de cielo despejado y estadística robusta."
    >
      <Meta items={[
        ["Sitio", "10,33°N · −84,42°O · 600 m"],
        ["Cielo despejado", "Ineichen (pvlib)"],
        ["UMBRAL_CS", "20 W/m²"],
        ["Lookback", "60 min"],
        ["MIN_MUESTRAS", "3"],
        ["Horizonte", "60 s – 21 600 s"],
      ]} />
      <Note>
        <div><b>Cómo leer esta página.</b> Cada fórmula corresponde a una línea de código real, citada al lado. <IC>UMBRAL_CS</IC>, <IC>MIN_MUESTRAS</IC> y compañía son los identificadores del repositorio, no notación inventada para el documento.</div>
      </Note>

      <h2>La descomposición por cielo despejado</h2>
      <p>Todo el método se apoya en partir la irradiancia medida en dos factores: uno determinista y otro estocástico.</p>
      <Formula nota={<>GHI = irradiancia global horizontal · kt* = índice de cielo despejado · GHI<sub>cs</sub> = irradiancia que habría con el cielo perfectamente limpio. Fuente: <IC>physics.py</IC>.</>}>
        GHI<sub>medida</sub>(t) = kt*(t) × GHI<sub>cs</sub>(t)
      </Formula>
      <p><strong>Por qué se pronostica kt* y no la GHI.</strong> La GHI mezcla dos cosas de naturaleza opuesta: la parábola solar del día —que ya conocemos con precisión de segundos— y las nubes, que son lo único realmente incierto. Pronosticar GHI directo obliga al modelo a adivinar algo que no hace falta adivinar, y encima cambia rápido: a las 6 de la mañana la irradiancia se multiplica en una hora, así que «lo mismo que hace un rato» es una predicción pésima aunque el cielo no se haya movido un centímetro.</p>
      <p>Al dividir por el techo de cielo despejado queda kt*: una señal acotada (típicamente 0–1,2), suave y aproximadamente estacionaria en la escala de una hora. Sobre eso <em>sí</em> tiene sentido persistir. Y al reconstruir, la geometría solar del futuro entra gratis: el pronóstico sube si el instante objetivo cae más cerca del mediodía y baja si cae al atardecer, sin que las nubes hayan cambiado. Eso es exactamente lo que la persistencia ingenua no sabe hacer.</p>

      <h2>El techo: cielo despejado con Ineichen</h2>
      <p><IC>clear_sky_ghi(times, lat, lon, alt, tz)</IC> delega en pvlib: <IC>Location(...).get_clearsky(idx)[&quot;ghi&quot;]</IC>. Sin argumento de modelo, pvlib usa <strong>Ineichen</strong> con <strong>turbidez Linke climatológica</strong> (tabla mensual interpolada por lat/lon).</p>
      <Formula nota={<>cg1 = 5,09·10<sup>−5</sup>·alt + 0,868 · cg2 = 3,92·10<sup>−5</sup>·alt + 0,0387 · fh1 = e<sup>−alt/8000</sup> · fh2 = e<sup>−alt/1250</sup> · θ<sub>z</sub> = zenit solar aparente · AM = masa de aire absoluta · I<sub>0</sub> = irradiancia extraterrestre del día · T<sub>L</sub> = turbidez Linke. Es la implementación de pvlib (<IC>clearsky.ineichen</IC>), no código nuestro.</>}>
        GHI<sub>cs</sub> = cg1 · I<sub>0</sub> · cos θ<sub>z</sub> · exp( −cg2 · AM · (fh1 + fh2·(T<sub>L</sub> − 1)) )
      </Formula>
      <p>Sus entradas son la fecha-hora y la posición del sitio, nada más: lat 10,33 · lon −84,42 · alt 600 m · <IC>America/Costa_Rica</IC> (todo en <IC>config.py</IC>, sobreescribible por <IC>SITE_*</IC>).</p>
      <Note kind="good">
        <div><b>Conocer el techo del futuro NO es fuga.</b> El cielo despejado es astronómico: depende de dónde está el sol, no de ningún dato medido. Calcularlo en <IC>now + h</IC> es tan lícito como saber a qué hora amanece mañana. La fuga sería usar una <em>medición</em> posterior a <IC>now</IC>, y eso lo corta la barrera de <IC>get_recent_data</IC>.</div>
      </Note>

      <h2>kt* — el índice de cielo despejado</h2>
      <Formula nota={<>Definido <b>solo</b> donde GHI<sub>cs</sub>(t) &gt; <IC>UMBRAL_CS</IC> = 20 W/m². Fuente: <IC>physics.clear_sky_index</IC>.</>}>
        kt*(t) = máx( 0 , GHI<sub>medida</sub>(t) / GHI<sub>cs</sub>(t) )
      </Formula>
      <ul>
        <li><strong>Por qué el umbral.</strong> Al amanecer, al atardecer y de noche el denominador tiende a cero y el cociente se dispara: una lectura de ruido de 3 W/m² sobre un techo de 0,4 da kt* = 7,5, un número sin ningún significado físico que además contaminaría la mediana. El umbral de 20 W/m² es la definición operativa de «hay sol suficiente como para que el cociente signifique algo».</li>
        <li><strong>Por qué el recorte inferior.</strong> El sensor tiene ruido nocturno negativo (mínimos de −0,3 W/m²). Una medida negativa por offset no debe producir un kt* negativo, así que se recorta a ≥ 0 (<IC>.clip(lower=0)</IC>).</li>
        <li><strong>Alineación.</strong> Medida y techo se cruzan con <IC>align(join=&quot;inner&quot;)</IC>: solo sobreviven los instantes presentes en ambas series.</li>
      </ul>
      <Note kind="warn">
        <div><b>No hay recorte superior.</b> El realce por nubes (reflexión en los bordes) puede dejar kt* &gt; 1: el máximo observado en la serie es <b>3,09</b>, en 2 puntos. La mediana lo amortigua, pero un tope en ~1,5 sigue anotado como mejora opcional pendiente.</div>
      </Note>

      <h2>Persistencia inteligente de kt* (irradiancia)</h2>
      <p>Tres pasos, en <IC>forecasters/persistence.py</IC>. La hipótesis física es «las nubes persisten»: lo que se asume constante es el estado del cielo, no la irradiancia.</p>
      <Formula nota={<>K = kt* útiles de la ventana · <IC>lookback_min</IC> = 60 · <IC>MIN_MUESTRAS</IC> = 3 · h = horizonte en segundos.</>}>
        K = {"{"} kt*(t) : now − 60 min ≤ t &lt; now {"}"}<br />
        kt*<sub>pred</sub> = mediana(K)  si |K| ≥ 3 ,  si no NaN<br />
        GHI<sub>pred</sub>(now + h) = kt*<sub>pred</sub> × GHI<sub>cs</sub>(now + h)
      </Formula>
      <p><strong>Mediana, no media.</strong> Es una decisión, no un detalle: la media tiene punto de ruptura 0 —un solo valor atípico la mueve tanto como se quiera—, mientras que la mediana aguanta hasta un 50 % de datos corruptos. En la última hora basta un reflejo, un realce por borde de nube o una lectura mala para inflar el promedio; con la mediana ese punto no arrastra el pronóstico.</p>
      <p><strong>MIN_MUESTRAS y el «no sé».</strong> Con menos de 3 kt* útiles la estimación queda a merced de una o dos lecturas, así que el forecaster devuelve <IC>NaN</IC> y la herramienta lo traduce a <IC>valor_esperado: null</IC> más una advertencia con el conteo. Es deliberado: preferimos decir «no sé» a fabricar un número. Ojo con qué se cuenta: son kt* <em>diurnos útiles</em>, no lecturas crudas — una ventana que cae sobre el atardecer puede tener 12 lecturas y 0 kt*.</p>
      <p><strong>De noche.</strong> <IC>forecast_tool</IC> evalúa <IC>es_noche = GHI_cs(now + h) ≤ 20</IC>; si se cumple, el valor y los dos extremos de la banda son exactamente <IC>0.0</IC>. Ese caso se distingue del anterior: de noche el 0 es la respuesta correcta; de día sin datos la respuesta es <IC>None</IC>.</p>
      <p>El rival de referencia es la persistencia ingenua, <IC>GHI_pred(now + h) = última GHI medida antes de now</IC>: ignora que el sol se mueve y por eso se degrada tanto en horizontes largos y cerca del amanecer y el atardecer.</p>

      <h2>Humedad de suelo: persistencia de la mediana</h2>
      <Formula nota={<>Ventana de 60 min, <IC>MIN_MUESTRAS_HUM</IC> = 3. Fuente: <IC>forecasters/humidity.py</IC>.</>}>
        H = {"{"} x(t) : now − 60 min ≤ t &lt; now {"}"}<br />
        valor<sub>pred</sub> = mediana(H)  si |H| ≥ 3 ,  si no NaN
      </Formula>
      <ul>
        <li><strong>Sin análogo de cielo despejado.</strong> El techo astronómico es un concepto solar; el suelo no tiene nada equivalente, así que no hay nada que factorizar.</li>
        <li><strong>Por qué persistir alcanza.</strong> La humedad de suelo cambia lento y es fuertemente autocorrelada a horizontes cortos: el baseline honesto es «lo mismo que ahora». Se persiste la mediana, no la última lectura, por robustez a un dato atípico.</li>
        <li><strong>El horizonte no cambia el valor.</strong> <IC>horizon_seconds</IC> se acepta por simetría de firma con los otros forecasters, pero ni el valor central ni la banda dependen de él.</li>
        <li><strong>El número es CRUDO.</strong> Es la cuenta del ADC de 16 bits (0–65535), sin curva de calibración: no es un porcentaje de humedad. El prompt del agente obliga a decirlo cada vez.</li>
      </ul>

      <h2>La banda de incertidumbre</h2>
      <p>Es ±1σ de <strong>kt*</strong> —no de la GHI— reexpandido con el techo del instante objetivo (<IC>forecasters/uncertainty.py</IC>).</p>
      <Formula nota={<>σ = desviación <b>poblacional</b> (<IC>ddof=0</IC>) de los kt* del lookback; vale 0 si hay una sola muestra. cs<sub>target</sub> = GHI<sub>cs</sub>(now + h).</>}>
        σ = desv(K)<br />
        bajo = máx( 0 , (kt*<sub>pred</sub> − σ) × cs<sub>target</sub> )<br />
        alto = (kt*<sub>pred</sub> + σ) × cs<sub>target</sub>
      </Formula>
      <p>La consecuencia útil: la banda se ensancha cuando la última hora fue variable (nubes rotas) y se angosta con cielo estable. Se calcula con <IC>ddof=0</IC> porque describe la dispersión de la muestra observada, no estima la de una población mayor. En GHI la banda puede quedar asimétrica, pero solo por el recorte en 0.</p>
      <p>En humedad de suelo es la misma idea sobre el valor crudo: σ = desviación poblacional de las lecturas recientes, <IC>bajo = valor − σ</IC>, <IC>alto = valor + σ</IC>, esta vez sin recorte inferior.</p>
      <Note kind="warn">
        <div><b>Es heurística, no un intervalo calibrado.</b> La respuesta la etiqueta <IC>&quot;nivel&quot;: &quot;±1σ&quot;</IC> y eso es literal: <b>no</b> hay garantía de que cubra el 68 % de los casos. Los intervalos con cobertura garantizada (conformal / MAPIE) están planificados para la fase 2.</div>
      </Note>

      <h2>La barrera anti-fuga</h2>
      <p>Toda la data que ve un forecaster pasa por una sola función, <IC>data.get_recent_data</IC>, y su filtro es estricto.</p>
      <Formula nota={<>El <IC>&lt;</IC> es estricto: jamás entra una lectura con <IC>timestamp == now</IC>, mucho menos posterior.</>}>
        ventana(now) = {"{"} x(t) : now − lookback ≤ t &lt; now {"}"}
      </Formula>
      <p>Está verificado por perturbación, con control negativo: corromper <em>todo</em> el futuro de la serie no mueve el pronóstico ni un decimal (invariante), y corromper el pasado sí lo mueve (o sea, la prueba es sensible y no está midiendo nada trivial).</p>
      <p>El campo <IC>medido</IC> que acompaña a un pronóstico anclado no rompe esto: <IC>valor_medido()</IC> se consulta <strong>después</strong> de calcular y nunca alimenta el cálculo. Es lo que permite contrastar un hindcast contra la realidad sin haberla mirado antes.</p>

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
      <p>El skill es la métrica que importa: un MAE de 30 W/m² no dice nada por sí solo —depende del sitio y del día—, mientras que «cuánto le gana al modelo ingenuo» sí compara métodos sobre el mismo problema.</p>
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
    </Page>
  );
}
