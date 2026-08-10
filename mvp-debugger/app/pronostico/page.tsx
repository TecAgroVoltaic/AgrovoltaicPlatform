import { Health } from "@/app/components/Health";
import { Ask } from "@/app/components/Ask";
import { PronosticoPanel } from "@/app/components/PronosticoPanel";
import { Uso } from "@/app/components/Uso";

const EJEMPLOS = [
  "¿Cuánta irradiancia se espera en dos horas?",
  "¿Qué irradiancia habrá en media hora?",
  "Pronostica la humedad de suelo para dentro de una hora.",
  "¿Cómo estará la radiación solar en 3 horas?",
  "¿Cuál es el pronóstico de irradiancia para dentro de 10 horas?",
  "¿Cuánto va a subir la bolsa mañana?",
];

export default function PronosticoPage() {
  return (
    <div>
      <h1>🌦️ Pronóstico ambiental · debugger</h1>
      <Health servicio="pronostico" nombre="Pronóstico (:8000)" />

      <h2>Preguntar al agente</h2>
      <p className="muted small">
        El agente traduce el horizonte, llama a <code>forecast</code> y redacta. La traza
        muestra el horizonte en segundos, el input a la tool y su salida (valor + banda + contexto).
      </p>
      <Ask endpoint="/api/pronostico/preguntar" ejemplos={EJEMPLOS} />

      <h2>Consumo / costo</h2>
      <p className="muted small">Tokens y USD por consulta (en la traza) y acumulado del agente.</p>
      <Uso servicio="pronostico" />

      <h2>Datos del store + anomalías</h2>
      <p className="muted small">
        Series reales (irradiancia + humedad de suelo) y detección determinista de anomalías.
        El pronóstico usa como “ahora” el último timestamp del store, no el reloj de pared.
      </p>
      <PronosticoPanel />
    </div>
  );
}
