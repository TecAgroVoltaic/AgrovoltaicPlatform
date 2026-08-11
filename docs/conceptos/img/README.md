# Imágenes del diagrama `../proceso-datos-agrovoltaico.html`

Dejá aquí los PNG (o cambiá la extensión en el HTML) con **exactamente** estos nombres.
Mientras no exista el archivo, el diagrama muestra un placeholder con el nombre y la ruta.

| Archivo | Objeto | Sugerencia de imagen |
|---|---|---|
| `sol.png`          | Sol                         | sol / radiación solar |
| `array.png`        | Array fotovoltaico (PV1+PV2)| campo de paneles solares (vista isométrica) |
| `combinadoras.png` | Cajas combinadoras          | combiner box / caja de conexión DC |
| `ds18b20.png`      | Sensores DS18B20            | sensor de temperatura DS18B20 |
| `inversor.png`     | Inversor                    | inversor solar / string inverter |
| `bateria.png`      | Batería                     | batería / banco de baterías solar |
| `carga.png`        | Carga AC                    | casa / electrodomésticos |
| `red.png`          | Red eléctrica               | torre / poste de alta tensión |
| `piranometro.png`  | Piranómetro original        | piranómetro |
| `sp722.png`        | Piranómetro SP722           | piranómetro SP-722 / Apogee |
| `registro.png`     | Registro → CSV              | datalogger / archivos CSV / Google Drive |
| `supabase.png`     | Supabase                    | logo Supabase / cilindro de base de datos |

**Recomendaciones:**
- PNG con **fondo transparente** se ven mejor sobre el fondo oscuro.
- Proporción aproximada según el `w`/`h` de cada nodo en el HTML (no es crítico: la imagen se ajusta con `object-fit: contain`).
- Si usás otra extensión (`.svg`, `.webp`), cambiá `img/${n.img}.png` en la función `buildMap()` del HTML.
