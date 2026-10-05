// Descargas: un rango de fechas de un dataset (Supabase PV o API de AgroDash)
// en .csv, .dat o .mat.
//
// La página es de servidor y solo monta la vista de cliente, que trae su propia
// cabecera y todo el estado (fuente, dataset, filtros, rango, columnas, formato).
import type { Metadata } from "next";

import { DescargasView } from "@/app/components/analitica/descargas/DescargasView";

export const metadata: Metadata = { title: "Descargas · AgroVoltaic" };

export default function DescargasPage() {
  return (
    <div className="vista">
      <DescargasView />
    </div>
  );
}
