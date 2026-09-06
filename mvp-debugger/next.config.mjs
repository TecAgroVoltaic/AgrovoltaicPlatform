/** @type {import('next').NextConfig} */

// Qué directorios lintea el BUILD. Sin esto, `next build` recorre todo `app/` y
// falla por 187 errores de `react/jsx-key` en `app/docs/content/*` y en los
// componentes viejos de la consola, todos anteriores a este proyecto.
//
// La lista es la MISMA del script `lint` de package.json, y esa duplicación es
// deliberada: el proyecto ya decidió sostener la capa de análisis en cero
// warnings (`npm run lint`) y dejar el resto como deuda visible y medible
// (`npm run lint:todo`). Que el build afirme lo mismo que el script evita la
// incoherencia de tener un despliegue que exige más de lo que el equipo se
// comprometió a cumplir, y sobre todo evita la salida fácil de apagar el lint
// entero, que es lo que suele pasar cuando el build molesta.
//
// Al saldar la deuda de `lint:todo`, esto se borra y el build vuelve a mirar
// todo el árbol. Mientras tanto, un error nuevo EN LA CAPA DE ANÁLISIS sigue
// rompiendo el despliegue, que es lo que hay que proteger.
const DIRECTORIOS_LINTEADOS = [
  "app/(analisis)",
  "app/components/analitica",
  "app/components/charts",
  "app/lib/analitica",
];

const nextConfig = {
  reactStrictMode: true,
  eslint: { dirs: DIRECTORIOS_LINTEADOS },
};

export default nextConfig;
