import { Page, Note, IC, Table, Meta, Diagram } from "@/app/docs/ui";

export function Predictivo() {
  return (
    <Page
      crumb="Agente Predictivo"
      title="Agente Predictivo"
      lead="Agente que pronostica irradiancia y humedad de suelo a corto plazo, y reconstruye honestamente el pasado (backtest). No usa machine learning: usa física del cielo despejado."
    >
      <Meta items={[
        ["Framework", "FastAPI"],
        ["Puerto", "8000"],
        ["Modelo", "claude-haiku-4-5"],
        ["Horizonte", "1 min – 6 h"],
        ["Fuente", "AgroDash → store Supabase"],
      ]} />

      <Note>
        <div><b>Vale más verlo que leerlo.</b> La consola tiene una <a href="/">vista de
        arquitectura</a> que dibuja este agente como un grafo: sus herramientas, qué recibe
        y devuelve cada una, y el interruptor de modo que apaga <IC>backtest</IC> cuando el
        agente tiene que predecir sin ver la medición. Se lee del servicio (<IC>GET /arquitectura</IC>),
        así que muestra el agente como está hoy, no como estaba cuando se escribió esta página.</div>
      </Note>

      <h2>Qué pronostica</h2>
      <Table
        head={["Variable", "Unidad", "Modelo"]}
        rows={[
          [<IC>irradiancia</IC>, "W/m²", "Persistencia inteligente de kt* × cielo despejado"],
          [<IC>humedad_suelo</IC>, "crudo (ADC 16-bit, 0–65535)", "Persistencia de la mediana reciente"],
        ]}
      />

      <h2>Método: persistencia de kt* (no es ML)</h2>
      <p>Se apoya en la descomposición física <IC>GHI_medida = kt* × GHI_cielo-despejado</IC>, donde <IC>kt*</IC> (índice de claridad) aísla el efecto de las nubes de la geometría solar, que es astronómica y perfectamente predecible.</p>
      <Diagram>{`  1. kt* de los últimos 60 min   (solo lecturas con timestamp < now → sin fuga)
  2. kt*_pred = MEDIANA de esos kt*   (robusta; las nubes «persisten»)
  3. GHI_pred(now+h) = kt*_pred × GHI_cielo-despejado(now+h)
                                      └─ geometría solar FUTURA (lícita)`}</Diagram>
      <ul>
        <li>Cielo despejado: modelo <strong>Ineichen</strong> de pvlib con turbidez Linke climatológica.</li>
        <li>De noche (cielo despejado ≤ 20 W/m²) el valor es exactamente <IC>0.0</IC>.</li>
        <li>Banda de incertidumbre: ±1σ de kt* reciente reconstruido a GHI.</li>
        <li>El «ahora» por defecto es el <strong>último timestamp del store</strong>, no el reloj de pared. Se puede <strong>anclar en otro instante</strong> (campo <IC>ahora</IC> de <IC>POST /forecast</IC>): el forecaster sigue viendo solo datos anteriores a ese momento.</li>
        <li><IC>parse_horizon("dos horas") → 7200</IC> es determinista (sin LLM) y es la fuente de verdad del horizonte.</li>
      </ul>
      <p>La humedad de suelo persiste la <strong>mediana</strong> de lecturas recientes (el suelo cambia lento y es muy autocorrelacionado); no tiene análogo de cielo despejado.</p>
      <Note>
        <div><b>La matemática completa está en <a href="#metodo">Método y fórmulas</a>:</b> la ecuación de Ineichen, por qué el umbral de 20 W/m², por qué mediana y no media, cómo se arma la banda, las cuatro métricas del backtest y el z-score robusto de anomalías.</div>
      </Note>

      <h2>Dos modalidades: pronóstico vs. backtest</h2>
      <Table
        head={["", "Pronóstico a futuro", "Backtest histórico"]}
        rows={[
          ["Qué es", "Desde el «ahora» hacia adelante (≤ 6 h)", "«Cómo habría predicho» una fecha pasada vs. lo medido"]        ,
          ["Dispara", <><IC>POST /forecast</IC> o la tool forecast</>, <><IC>GET /backtest</IC> o la tool backtest (solo en /chat)</>],
          ["Datos", "get_recent_data(now, 60min), barrera timestamp < now", "la MISMA serie del store, remuestreada, con .shift(1)"],
          ["Es predicción real", "sí (salvo si se ancla en el pasado)", "no: evalúa el método"],
        ]}
      />
      <h3>Instante de referencia</h3>
      <p>Con la ingesta congelada desde el 23-jul-2026, el último dato cae de madrugada: pronosticar «desde el último dato» da irradiancia 0 siempre, porque de noche <em>es</em> 0. Por eso <IC>POST /forecast</IC> acepta <IC>ahora</IC> (ISO): ancla el pronóstico en un instante del histórico (p. ej. con sol) y devuelve un número real. Como ese momento ya pasó, la respuesta adjunta <IC>medido</IC> con lo que registró el sensor y el error.</p>
      <Note kind="warn">
        <div>Un pronóstico anclado es un <b>hindcast</b>, no una predicción en vivo. La barrera anti-fuga es la misma (<IC>get_recent_data</IC> devuelve solo <IC>timestamp &lt; ahora</IC>) y el valor medido se consulta <b>después</b>, sin entrar al cálculo. Se audita en <IC>predicciones</IC> con el origen sufijado <IC>:instante-referencia</IC> para no mezclarlo con predicciones reales.</div>
      </Note>
      <Note kind="warn">
        <div>El backtest <b>reaplica el método</b> sobre el histórico real; por eso la vista «Predicción vs Real» de la consola aclara que <b>no son predicciones en vivo</b>. Las métricas: <IC>mae</IC>, <IC>bias</IC>, <IC>error_rel_pct</IC> y <IC>skill_pct</IC> (mejora sobre el baseline «igual que antes»).</div>
      </Note>

      <h2>Herramientas</h2>
      <Table
        head={["Tool", "Disponible en", "Notas"]}
        rows={[
          [<IC>forecast</IC>, "/preguntar y /chat", "run_forecast(variable, horizon_seconds, horizonte_texto?, now?)"],
          [<IC>backtest</IC>, "solo /chat", <>Genera <IC>_grafico</IC> (Real vs Reconstrucción) para pintar inline</>],
          [<IC>web_search</IC>, "solo /chat", "Server-tool de Anthropic (máx. 3 usos), para conocimiento externo con cita"],
        ]}
      />

      <h2>Endpoints HTTP</h2>
      <Table
        head={["Método · Path", "Qué hace"]}
        rows={[
          [<IC>GET /health</IC>, "Ping (abierto, sin key)"],
          [<IC>POST /forecast</IC>, <>Pronóstico directo (opcional <IC>ahora</IC> = instante de referencia). Hace write-back a la tabla predicciones (auditoría)</>],
          [<IC>GET /backtest</IC>, "Reconstrucción honesta (variable, dias, bucket, desde/hasta)"],
          [<IC>POST /anomalias</IC>, "Detección determinista (outliers, drift, stuck, outage, fuera_rango)"],
          [<IC>GET /serie</IC>, "Peek de una serie del store para graficar"],
          [<IC>POST /preguntar</IC>, "Lazo LLM (solo tool forecast) → traza"],
          [<IC>POST /chat</IC>, "Turno multi-turno del widget (forecast + backtest + web) → traza"],
          [<IC>GET /uso</IC>, "Consumo acumulado"],
        ]}
      />
      <p>Todo (salvo <IC>/health</IC>) exige <IC>x-api-key</IC> solo si <IC>FORECAST_API_KEY</IC> está definida. Límites del horizonte: 60 s – 21600 s.</p>

      <h2>Fuentes de datos</h2>
      <p>Arquitectura de dos DBs: una <strong>fuente</strong> que el ETL lee y un <strong>store</strong> donde el forecaster lee/escribe.</p>
      <Table
        head={["Rol", "Base", "Qué"]}
        rows={[
          ["Fuente", "AgroDash (réplica Cartago, Tailscale, RO)", "readings ⋈ sensors ⋈ boxes. Cajas SC = San Carlos. Irradiancia y humedad de suelo salen de acá."],
          ["Store", "Supabase AgroVoltaic (jijklguopafevyucogro)", "lecturas_ambientales_sc (el ETL escribe, data.py lee); predicciones (audit); agente_log"],
        ]}
      />
      <Note>
        <div>El forecaster <b>no toca</b> la tabla fotovoltaica del analizador: convive con ella sin fusionarse. Lee de un caché parquet; solo <IC>cargar_serie(forzar=True)</IC> golpea la DB. <b>NASA POWER no se usa</b> en el código (es solo referencia paralela para los gaps largos).</div>
      </Note>
    </Page>
  );
}
