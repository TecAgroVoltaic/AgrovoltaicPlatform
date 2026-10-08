import { Page, Note, IC } from "@/app/docs/ui";

export function WebConsola() {
  return (
    <Page
      crumb="La web · mvp-debugger"
      title="Vistas de la consola"
      lead="Qué muestra cada sección de la consola (ruta /), y de qué endpoint sale cada dato."
    >
      <p>La consola (<IC>components/console/Console.tsx</IC>) es un shell con barra lateral: selector de agente (Histórico / Predictivo), navegación en dos mitades (las vistas del agente elegido y las fijas, que se ven siempre), indicador de salud de la DB (ping a <IC>/health</IC> cada 15 s) y toggle de tema. Abajo a la derecha, el chat flotante.</p>

      <h2>1 · Reconciliación</h2>
      <p>La vista por defecto del analizador. Muestra los <strong>datos crudos en vivo</strong> (tabla <IC>electrico_corregido</IC>: timestamp, potencias PV1/PV2/AC, temperaturas) buscables y con «cargar más», más tres tarjetas de <strong>cobertura</strong> (eléctrica, radiación 15 s, performance). La idea: preguntale al chat y cruzá cada número de su respuesta contra estos datos. Sale de <IC>/api/historico/datos/muestra</IC> y <IC>/datos/tablas</IC>.</p>

      <h2>2 · Predicción vs Real</h2>
      <p>La vista del pronóstico. Pinta un <strong>backtest</strong> (<IC>/api/predictivo/backtest?variable=&dias=&bucket=h</IC>) con tres series: Real (medido), Reconstrucción del método y Cielo despejado (techo). Controles: variable (irradiancia / humedad de suelo) y ventana (3/7/14 días). Debajo, KPIs de error (MAE, sesgo, error relativo, skill) y el desglose de mayores desvíos.</p>
      <Note kind="warn">
        <div>El banner lo deja explícito: <b>es un backtest, no predicciones en vivo</b>. El agente no pronostica de forma continua: predice solo cuando se le llama.</div>
      </Note>

      <h2>3 · Rendimiento</h2>
      <p>KPIs reales del sistema (energía por arreglo, PR, GHI media/kt*) llamando las tools <IC>energia_por_arreglo</IC>, <IC>performance_ratio</IC>, <IC>irradiancia_resumen</IC>, <IC>temperatura_por_arreglo</IC>. Series graficadas por período (todo / 2026 / mayo) y variable (potencia, irradiancia, kt*, PR), con comparación PV1 vs PV2. Incluye un scatter <strong>irradiancia → potencia PV1</strong>. Las series salen de <IC>/api/historico/datos/serie</IC>.</p>
      <Note>
        <div>Honestidad sobre la cadencia variable: el gráfico de «potencia» es <b>potencia media por bucket</b> (robusta al muestreo que cambia de 2 s a 5 min); la energía real en kWh vive en el KPI.</div>
      </Note>

      <h2>4 · Arquitectura del agente</h2>
      <p>El agente de pronóstico dibujado como grafo, leído en vivo de <IC>GET /arquitectura</IC>: sus herramientas con el <IC>input_schema</IC> completo, los frenos y el interruptor de <strong>modo</strong>. Los dos modos se distinguen por una sola cosa: si el agente puede ver la medición del sensor. Con <strong>medición visible</strong> conserva <IC>backtest</IC> y juzga el método; con <strong>medición oculta</strong> el servicio se la quita, que es la única garantía real de que predice sin conocer el resultado. Cada nodo abre una ficha con «Qué hace» y «En qué ayuda».</p>

      <h2>5 · Base de datos</h2>
      <p>Qué se le hizo al crudo. El recorrido en cinco actos con el dato a la vista en cada paso, partido por la línea que separa lo que se decide <strong>al cargar</strong> (irreversible) de lo que se decide <strong>al consultar</strong> (una vista SQL, reescribible). Debajo, once tratamientos numerados como en el documento que revisó Leo Cardinale. Es un corte fechado, no una lectura viva: el servicio del pronóstico no lee las tablas fotovoltaicas.</p>

      <h2>6 · Costo y uso</h2>
      <p>Cuánto cuesta operar el agente. El <strong>acumulado real</strong> (<IC>GET /uso</IC>, persistido: tokens, USD, nº consultas) y el <strong>gasto de la sesión</strong>: cada pregunta que hacés suma su costo, con gráfico acumulado, split entrada/salida y proyección. Tarifa del modelo <IC>claude-haiku-4-5</IC> ($1 in / $5 out por millón de tokens).</p>

      <h2>7 · Salud del sistema</h2>
      <p>Diagnóstico del servicio y de la cobertura de datos: qué variables tiene el store, hasta cuándo llegan, cuál fue la última predicción guardada y si algo dejó de responder.</p>

      <h2>8 · Descargas</h2>
      <p>Exportar un <strong>rango de fechas</strong> como <strong>CSV</strong>, <strong>DAT</strong> (texto tabulado, nulo = NaN, con columna <IC>*_unix</IC>) o <strong>MAT</strong> (MATLAB: una variable por columna + <IC>*_unix</IC>, <IC>*_datenum</IC> y struct <IC>meta</IC>), desde <strong>dos fuentes</strong>: la Supabase PV de San Carlos (eléctrico crudo/corregido, radiación 15 s cruda/corregida/calibrada, clear-sky, POA, performance, diccionario, store ambiental) y la <strong>API pública de AgroDash</strong> (lecturas de sensores de Cartago y San Carlos, filtrables por caja y tipo de sensor, con resolución elegible: crudo, 1 min, 5 min, 15 min, 1 h, 1 día; más el catálogo de cajas). Formulario a la izquierda (fuente → datos → filtros → rango con barra de cobertura → formato → columnas) y a la derecha el resumen fijo: nombre del archivo, filas estimadas, tamaño aproximado, <strong>vista previa real</strong> de las primeras filas y el botón.</p>
      <p>Endpoints del Agente Histórico: <IC>/datos/exportables</IC> (catálogo por fuente), <IC>/datos/exportar/estimar</IC>, <IC>/datos/exportar/previa</IC> y <IC>/datos/exportar</IC>. La descarga es un GET que el proxy reenvía <strong>como stream de bytes</strong> (CSV y DAT por lotes, leyendo la base en streaming; MAT en memoria con tope de 500.000 filas). AgroDash se lee por su API HTTP (<IC>agrodash_api.py</IC>, sin credenciales, header Origin); si no responde, la fuente aparece como no disponible y el resto funciona. Como la API no cuenta filas, la estimación para AgroDash es una cota (sensores × intervalos).</p>
      <Note>
        <div><b>Horas.</b> Todo sale en hora local de Costa Rica (UTC−6) sin sufijo, aunque las fuentes mezclan convenciones (PV: reloj local etiquetado +00; store ambiental: UTC real; API de AgroDash: hora local naive). Solo lectura; una descarga grande cuenta como <b>egress</b> de Supabase.</div>
      </Note>
    </Page>
  );
}
