import { Page, Note, IC, Table, Meta } from "@/app/docs/ui";

export function DatosFuentes() {
  return (
    <Page
      crumb="Datos · Supabase PV"
      title="Fuentes físicas y geometría"
      lead="De qué sensores salen los datos crudos y cuál es la geometría real del sistema, el dato que desbloquea calibrar la irradiancia y calcular el Performance Ratio."
    >
      <h2>Tres fuentes físicas</h2>
      <p>Los CSV crudos combinan lecturas de tres fuentes que muestrean a intervalos distintos y a veces se intercalan mal en un mismo archivo.</p>
      <Table
        head={["Fuente", "Qué mide"]}
        rows={[
          [<><b>Inversor solar</b></>, "Dos strings PV1 y PV2: voltajes DC, corrientes DC, potencias DC. Salida AC (potencia total Wac, voltaje, corriente, frecuencia). Energía acumulada (día y total). Temperatura del inversor y código de error."],
          [<><b>Piranómetro / celda calibrada</b></>, <>Irradiancia incidente, reflejada y albedo (= reflejada/incidente). Desde <b>may-2026</b> se agrega un segundo sensor de referencia <IC>SP722</IC> (incidente/reflejada en W/m², detectores crudos en mV, albedo).</>],
          [<><b>Sensores DS18B20</b></>, <>Temperatura del panel en dos orientaciones: <IC>temp_inclinado</IC> (arreglo PV1) y <IC>temp_vertical</IC> (arreglo PV2).</>],
        ]}
      />
      <Note kind="warn">
        <div>La «celda calibrada» es un <b>nombre comercial</b> del sensor analógico: <b>no</b> viene ya escalado a W/m². Leo Cardinale confirmó que no se hizo ajuste. Por eso la irradiancia se calibra por modelo de cielo despejado, no con una constante guardada.</div>
      </Note>

      <h2>Geometría del sistema</h2>
      <p>Confirmada por Leo Cardinale el 2026-08-10 y codificada en <IC>src/agrovoltaic/config.py</IC>. Cierra los bloqueantes que impedían calibrar irradiancia y calcular PR.</p>
      <Table
        head={["String", "= Arreglo", "Geometría", "Potencia"]}
        rows={[
          [<IC>PV1</IC>, <><b>Inclinado</b></>, "tilt 20°, azimut 150° (≈ Sur-Sureste)", "4 × 355 Wp = 1420 Wp · bifacial"],
          [<IC>PV2</IC>, <><b>Vertical</b></>, "tilt 90°, azimut 50° (cara al norte)", "4 × 355 Wp = 1420 Wp · bifacial"],
        ]}
      />
      <Meta items={[
        ["Total instalado", "2840 Wp"],
        ["Latitud", "10.33"],
        ["Longitud", "−84.42"],
        ["Altitud", "600 m"],
        ["Azimut", "N=0°, horario+"],
        ["TZ", "America/Costa_Rica (UTC−6)"],
      ]} />
      <p>El total de 2840 Wp explica por qué los picos de «26,5 MW» en el crudo son físicamente imposibles: el sistema es de ~1–2 kW por string.</p>

      <Note kind="good">
        <div><b>Validación física del PR.</b> Con POA solo-frontal el arreglo vertical daba PR{">"}1 (imposible → es bifacial). Modelando la bifacialidad (dos planos, φ≈0,80), <b>ambos arreglos convergen a PR ≈ 0,62</b> (PV1=0,622 · PV2=0,626), prueba de que comparten paneles, inversor y sitio.</div>
      </Note>
    </Page>
  );
}
