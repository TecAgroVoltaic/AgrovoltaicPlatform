// Barril de los contratos de calidad. Los esquemas viven en un archivo por
// endpoint porque cubrir cuatro respuestas en uno solo lo había llevado a 297
// líneas; quien consume importa siempre de acá, así que partirlo no cambió ni un
// `import` de la vista.
//
// Se traduce a inglés en la frontera, una vez, igual que `envelope.ts`. Lo que
// NO se traduce y viaja literal: `warning`, `note` y `whatItIs`, textos que el
// servicio redactó junto a la medición que los produce.
export * from "@/app/lib/analitica/contracts/calidadCommon";
export * from "@/app/lib/analitica/contracts/calidadVerdict";
export * from "@/app/lib/analitica/contracts/calidadSummary";
export * from "@/app/lib/analitica/contracts/calidadDetail";
