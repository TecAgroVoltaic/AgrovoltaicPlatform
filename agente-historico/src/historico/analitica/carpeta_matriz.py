"""La matriz dia x hora del diagrama de carpeta, con los huecos marcados. PURA, sin DB."""
from __future__ import annotations

from datetime import datetime

from historico.analitica import resultado

HORAS_DEL_DIA = 24
FORMATO_DIA = "%Y-%m-%d"


def reducir(dias: list[datetime], celdas: dict[tuple[str, int], dict],
            unidad: str) -> dict:
    """La matriz completa, con los huecos marcados. Pura: se prueba sin base de datos.

    `matriz[i][h]` es el valor de la hora `h` del dia `i`, o `None` si no hay dato.
    `conteo[i][h]` dice cuantas lecturas lo sostienen, que es lo que distingue un
    cero medido (de noche) de un dia que el logger no grabo.
    """
    matriz: list[list[float | None]] = []
    conteo: list[list[int]] = []
    valores: list[float] = []
    lecturas = 0
    for t in dias:
        dia = t.strftime(FORMATO_DIA)
        fila_valor: list[float | None] = []
        fila_n: list[int] = []
        for hora in range(HORAS_DEL_DIA):
            celda = celdas.get((dia, hora), {})
            valor, n = celda.get("valor"), int(celda.get("n") or 0)
            fila_valor.append(valor)
            fila_n.append(n)
            lecturas += n
            if valor is not None:
                valores.append(valor)
        matriz.append(fila_valor)
        conteo.append(fila_n)
    return {
        "dias": [t.strftime(FORMATO_DIA) for t in dias],
        "horas": list(range(HORAS_DEL_DIA)),
        "matriz": matriz,
        "conteo": conteo,
        # El rango es para la escala de color. Va como metrica para que una carpeta
        # sin una sola lectura devuelva None y no un cero que pintaria todo igual.
        "rango": {
            "minimo": resultado.metrica(min(valores) if valores else None, lecturas, unidad),
            "maximo": resultado.metrica(max(valores) if valores else None, lecturas, unidad),
        },
        "celdas_con_dato": len(valores),
        "celdas_totales": len(dias) * HORAS_DEL_DIA,
    }
