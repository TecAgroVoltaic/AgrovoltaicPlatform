# Guia editorial de las vistas

Feedback directo de Izack el 2026-09-01, mirando las cinco vistas en pantalla.
Vale para las cinco. **La queja no es que falte informacion: es que sobra prosa.**

## 1. La regla

**Borra toda frase que explique lo que el numero ya muestra.** Si el lector puede
verlo mirando, la frase es ruido.

Lo que Izack marco como MAL, textual:

> "Hay dos respuestas y las dos son correctas: contestan preguntas distintas."

Es informal, conversacional y no aporta un dato. Lo que marco como BIEN, textual,
y es una frase que **manda el backend**:

> "las variables NO van juntas: la peor tiene 13 dias utilizables y la mejor 20 de
> 30. Mira `por_variable` antes de leer cada numero"

La diferencia no es la longitud: es que la segunda **trae numeros y dice que
hacer**. Es tecnica, especifica y accionable.

**Preferi siempre la frase del backend a una tuya.** El servicio ya redacta avisos
con esa voz. Si el backend manda `advertencia`, mostrala tal cual y no escribas una
version propia al lado.

## 2. Que se borra y que se queda

**Se borra:**
- La frase que describe el grafico que esta justo arriba ("cada punto es un dia...").
  El eje ya lo dice.
- La explicacion metodologica larga en medio del flujo de lectura.
- El parrafo que justifica una decision de implementacion. Eso va en el codigo, no
  en la pantalla. **Es el caso mas grave hoy en `/series`**: hay un bloque entero
  explicando como se mide la cadencia, que es una nota de diseño puesta en la UI.
- Cualquier texto que repita lo que dice el aviso del backend inmediatamente al lado.

**Se queda:**
- Todo aviso que traiga un numero que el grafico no muestra.
- Todo lo que distinga "no hay dato" de "el dato es cero".
- La separacion entre averia del equipo y calidad del dato.
- El aval pendiente de Hugo sobre la POA.

## 3. Donde va lo que no se borra pero estorba

Lo metodologico largo **no se elimina, se esconde detras de un gesto**: un
`<details>`, un icono de informacion con popover, un tooltip. Que este a un clic
para quien lo necesite y fuera del camino para quien no.

Elegi UN patron y usalo igual en las cinco vistas: si en una es un `<details>` y en
otra un popover, el producto se siente hecho por cinco personas distintas, que es
exactamente lo que paso.

## 4. Ritmo visual

Izack: *"hay algunos cards que si estan bien pero al ser tanto y todo igual es
aburrido"*.

El problema no es cada tarjeta, es que **todas pesan lo mismo**. Una pantalla donde
todo grita no deja nada destacado. Que la jerarquia se vea: lo importante grande,
el contexto chico, el detalle escondido. Un numero clave puede ocupar una tarjeta
entera y tres secundarios compartir una fila.

**Donde haya un parrafo, evalua si un grafico chico lo dice mejor**: una sparkline,
una barra de progreso, un indicador. Un parrafo de tres lineas describiendo una
tendencia casi siempre se reemplaza por una linea de treinta pixeles.

## 5. Rendimiento (medido el 2026-09-01, no es opinion)

| | |
|---|---|
| `SELECT 1` contra el pooler | **225 ms** |
| `analitica/energia` | 4 viajes, 0,924 s |
| `analitica/rendimiento` | 4 viajes, 1,014 s |
| `contexto.confianza` (bloque comun) | 0,595 s |

**Casi todo el tiempo es LATENCIA DE RED, no trabajo de SQL.** La base esta en
us-east-1 y cada ida y vuelta cuesta 225 ms pase lo que pase. Cuatro consultas
secuenciales son 900 ms garantizados antes de calcular nada.

**La consecuencia para el frontend:** no sirve optimizar el render. Lo que se puede
hacer aca es **no pedir lo que no se muestra**, no pedir dos veces lo mismo, y no
encadenar peticiones (una espera, nunca una cascada).

## 6. Reglas que siguen mandando

- **El navegador NO calcula.** Dar forma, formatear, ordenar: si. Promediar,
  integrar, derivar un ratio: no.
- **Los cuatro estados** (`loading`, `error`, `empty` con motivo, `ready`).
  `empty` EXIGE motivo.
- **No toques `app/globals.css`.** Lo nuevo va en el CSS Module de tu vista.
- Identificadores en ingles; prosa y UI en español. **Sin rayas em (`—`).**
- 150 lineas de referencia por archivo.
- `npm test` en verde, `npm run lint --max-warnings 0` y `npx tsc --noEmit` limpios.
- **Los tests que fijan una garantia no se borran para simplificar la vista.** Si un
  texto que un test afirma se va a esconder detras de un `<details>`, el test se
  ajusta al gesto nuevo, no se elimina.
