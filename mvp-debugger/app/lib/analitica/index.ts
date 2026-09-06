// Barril público de la capa de análisis.
//
// No reexporta `useDateRange` a propósito: es un hook de cliente, y arrastrarlo
// acá metería la frontera cliente/servidor en cualquier import de un tipo.
export * from "@/app/lib/analitica/granularity";
export * from "@/app/lib/analitica/dateRange";
export * from "@/app/lib/analitica/coverage";
export * from "@/app/lib/analitica/urlRange";
export * from "@/app/lib/analitica/errors";
export * from "@/app/lib/analitica/variableCatalog";
export * from "@/app/lib/analitica/contracts/metric";
export * from "@/app/lib/analitica/contracts/envelope";
export * from "@/app/lib/analitica/contracts/variables";
