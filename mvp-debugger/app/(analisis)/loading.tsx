// Mientras el servidor arma la sección. El rango y la navegación ya están
// pintados por el cascarón: acá solo falta el contenido.
export default function CargandoSeccion() {
  return (
    <div className="loading muted" role="status">
      Cargando la sección…
    </div>
  );
}
