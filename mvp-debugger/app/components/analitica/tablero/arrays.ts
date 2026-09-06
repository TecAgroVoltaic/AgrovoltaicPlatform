// Los dos arreglos, con el nombre que de verdad los distingue.
//
// «PV1» y «PV2» a secas no dicen nada y encima invitan a confundirlos: lo que
// cambia entre ellos es la GEOMETRÍA, y es justamente lo que explica que
// produzcan distinto. El código del inversor va entre paréntesis para poder
// cruzar la pantalla contra la base, no como nombre.
export type ArrayId = "tilted" | "vertical";

export type PhotovoltaicArray = {
  readonly id: ArrayId;
  readonly name: string;
  /** Inclinación y azimut, con Norte = 0 grados y sentido horario positivo. */
  readonly geometry: string;
};

/** Potencia pico de CADA arreglo: 4 módulos bifaciales de 355 Wp. */
export const ARRAY_PEAK_POWER_WP = 1420;

export const PHOTOVOLTAIC_ARRAYS: readonly PhotovoltaicArray[] = [
  {
    id: "tilted",
    name: "Inclinado (PV1)",
    geometry: "20° de inclinación, azimut 150°",
  },
  {
    id: "vertical",
    name: "Vertical (PV2)",
    geometry: "90° de inclinación, azimut 50°",
  },
];
