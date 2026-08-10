import Link from "next/link";
import { Health } from "@/app/components/Health";

export default function Home() {
  return (
    <div>
      <h1>Debugger de agentes AgroVoltaic</h1>
      <p className="muted">
        Panorama en vivo de los dos agentes: qué consulta cada uno, qué calcula y
        cómo redacta. Cada respuesta trae su <b>traza</b> (tools llamadas, inputs y
        salidas crudas) para verificar los números contra los datos reales.
      </p>

      <div className="panel">
        <h4>Estado de los servicios</h4>
        <Health servicio="analizador" nombre="Analizador PV (:8010)" />
        <Health servicio="pronostico" nombre="Pronóstico (:8000)" />
      </div>

      <div className="cards">
        <div className="bigcard">
          <h3>🔆 Analizador PV</h3>
          <p className="muted">
            Q&amp;A sobre el histórico fotovoltaico de San Carlos (Supabase). Energía
            por arreglo, Performance Ratio, irradiancia calibrada, temperatura,
            cobertura. El LLM orquesta; los números salen de tools SQL de solo lectura.
          </p>
          <p>
            <span className="tag">Haiku</span>
            <span className="tag">6 tools</span>
            <span className="tag">36k+ filas eléctricas</span>
            <span className="tag">95k filas radiación</span>
          </p>
          <Link href="/analizador" className="btn" style={{ display: "inline-block", marginTop: 8 }}>
            Abrir debugger →
          </Link>
        </div>

        <div className="bigcard">
          <h3>🌦️ Pronóstico ambiental</h3>
          <p className="muted">
            Pronostica irradiancia (GHI) y humedad de suelo a un horizonte dado, sobre
            el store de San Carlos. Física determinista (persistencia + clear-sky); el
            LLM traduce la pregunta y redacta. Incluye detección de anomalías.
          </p>
          <p>
            <span className="tag">Haiku</span>
            <span className="tag">tool forecast</span>
            <span className="tag">anomalías</span>
          </p>
          <Link href="/pronostico" className="btn" style={{ display: "inline-block", marginTop: 8 }}>
            Abrir debugger →
          </Link>
        </div>
      </div>

      <div className="panel">
        <h4>Cómo leer la traza</h4>
        <p className="muted small">
          🧠 <b>modelo</b> = un turno del LLM (su texto y las tools que decide llamar). 🔧{" "}
          <b>tool</b> = ejecución real de una tool con su <i>input</i> y su <i>salida cruda</i>{" "}
          (el número que el modelo NO inventa). La respuesta final se arma solo con esas
          salidas — si un número no aparece en una salida de tool, es una alerta.
        </p>
      </div>
    </div>
  );
}
