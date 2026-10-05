// La opción que `buildBarsOption` emite por el camino por defecto (vertical).
//
// No está escrita a mano: se captura del builder y se congela acá. Es la
// referencia contra la que se comprueba que ese camino sigue dibujando
// exactamente lo mismo para las seis figuras que lo usan (completitud, energía
// mensual, método, PR estacional, perfil horario, irradiación). Si algo de esto
// cambia sin querer, cambió una vista ajena.
//
// Las funciones (los formateadores del tooltip) no aparecen: se comparan por su
// comportamiento en la prueba, no por igualdad estructural.
//
// Está capturada con `PHONE_CANVAS` (286 px), porque desde que los gráficos
// responden al ancho del contenedor la opción DEPENDE de ese ancho: el tope del
// texto de la leyenda sale de ahí.
//
// REGENERADA a propósito dos veces, y las dos quedan anotadas.
//
// 1) Al arreglar el desborde del nombre del eje. Cambiaron CUATRO rutas:
//
//      grid.containLabel: true            -> ausente
//      grid.outerBoundsMode:     ausente  -> "same"
//      grid.outerBoundsContain:  ausente  -> "all"
//      yAxis.nameTextStyle.align: "left"  -> "right"
//
//    Las tres primeras son la MISMA decisión escrita como la escribe ECharts 6:
//    `containLabel` equivale a `{outerBoundsMode: "same", outerBoundsContain:
//    "axisLabel"}`, o sea reservar sitio para las etiquetas y para nada más. Con
//    `"all"` entran también los NOMBRES de los ejes, que antes quedaban fuera de
//    la cuenta y por eso la unidad se salía del lienzo. La cuarta hace que el
//    nombre termine en el extremo del eje en vez de arrancar ahí.
//
// 2) Al hacer que la leyenda y el tooltip respondan al ancho. Cambian CUATRO
//    rutas más, todas nuevas, ninguna existente:
//
//      legend.type:               ausente -> "scroll"
//      legend.textStyle.width:    ausente -> 190  (286 − 96 de muestra y flechas)
//      legend.textStyle.overflow: ausente -> "truncate"
//      tooltip.confine:           ausente -> true
//
//    Más las tres del paginador (`pageIconColor`, `pageIconInactiveColor`,
//    `pageTextStyle`), que solo le dan color a unas flechas que antes no
//    existían. El motivo de cada una está en `legendBase` y en `tooltipBase`.
//
// Lo que NO cambió en ninguna de las dos, y se verificó ruta por ruta: series,
// tooltip (salvo `confine`), eje de categorías y los cuatro márgenes de la
// rejilla.

/** Una serie: sin leyenda, con el margen superior de siempre y un hueco nulo. */
export const VERTICAL_ONE_SERIES = {
  "useUTC": true,
  "animation": false,
  "backgroundColor": "transparent",
  "textStyle": {
    "color": "#222",
    "fontSize": 11
  },
  "grid": {
    "left": 8,
    "right": 16,
    "top": 26,
    "bottom": 8,
    "outerBoundsMode": "same",
    "outerBoundsContain": "all"
  },
  "legend": {
    "type": "scroll",
    "top": 0,
    "textStyle": {
      "color": "#222",
      "width": 190,
      "overflow": "truncate"
    },
    "icon": "roundRect",
    "pageIconColor": "#222",
    "pageIconInactiveColor": "#333",
    "pageTextStyle": {
      "color": "#333"
    },
    "show": false
  },
  "tooltip": {
    "backgroundColor": "#777",
    "borderColor": "#555",
    "borderWidth": 1,
    "textStyle": {
      "color": "#111",
      "fontSize": 12
    },
    "confine": true,
    "extraCssText": "box-shadow:0 4px 14px #0000001f;",
    "trigger": "axis",
    "axisPointer": {
      "type": "shadow"
    }
  },
  "xAxis": {
    "type": "category",
    "data": [
      "2026-01",
      "2026-02"
    ],
    "boundaryGap": true,
    "axisLine": {
      "lineStyle": {
        "color": "#555"
      }
    },
    "axisTick": {
      "show": false
    },
    "axisLabel": {
      "color": "#333",
      "fontSize": 11,
      "hideOverlap": true
    }
  },
  "yAxis": {
    "type": "value",
    "name": "kWh",
    "nameGap": 12,
    "nameTextStyle": {
      "color": "#333",
      "fontSize": 11,
      "align": "right"
    },
    "scale": true,
    "axisLine": {
      "lineStyle": {
        "color": "#555"
      }
    },
    "axisTick": {
      "show": false
    },
    "axisLabel": {
      "color": "#333",
      "fontSize": 11,
      "hideOverlap": true
    },
    "splitLine": {
      "lineStyle": {
        "color": "#444",
        "type": "solid"
      }
    }
  },
  "series": [
    {
      "name": "Registradas",
      "type": "bar",
      "data": [
        10,
        null
      ],
      "itemStyle": {
        "color": "#a",
        "borderRadius": [
          3,
          3,
          0,
          0
        ]
      }
    }
  ]
} as const;

/** Dos series: la leyenda se enciende y el margen superior se agranda. */
export const VERTICAL_TWO_SERIES = {
  "useUTC": true,
  "animation": false,
  "backgroundColor": "transparent",
  "textStyle": {
    "color": "#222",
    "fontSize": 11
  },
  "grid": {
    "left": 8,
    "right": 16,
    "top": 34,
    "bottom": 8,
    "outerBoundsMode": "same",
    "outerBoundsContain": "all"
  },
  "legend": {
    "type": "scroll",
    "top": 0,
    "textStyle": {
      "color": "#222",
      "width": 190,
      "overflow": "truncate"
    },
    "icon": "roundRect",
    "pageIconColor": "#222",
    "pageIconInactiveColor": "#333",
    "pageTextStyle": {
      "color": "#333"
    },
    "show": true
  },
  "tooltip": {
    "backgroundColor": "#777",
    "borderColor": "#555",
    "borderWidth": 1,
    "textStyle": {
      "color": "#111",
      "fontSize": 12
    },
    "confine": true,
    "extraCssText": "box-shadow:0 4px 14px #0000001f;",
    "trigger": "axis",
    "axisPointer": {
      "type": "shadow"
    }
  },
  "xAxis": {
    "type": "category",
    "data": [
      "2026-01",
      "2026-02"
    ],
    "boundaryGap": true,
    "axisLine": {
      "lineStyle": {
        "color": "#555"
      }
    },
    "axisTick": {
      "show": false
    },
    "axisLabel": {
      "color": "#333",
      "fontSize": 11,
      "hideOverlap": true
    }
  },
  "yAxis": {
    "type": "value",
    "name": "lecturas",
    "nameGap": 12,
    "nameTextStyle": {
      "color": "#333",
      "fontSize": 11,
      "align": "right"
    },
    "scale": true,
    "axisLine": {
      "lineStyle": {
        "color": "#555"
      }
    },
    "axisTick": {
      "show": false
    },
    "axisLabel": {
      "color": "#333",
      "fontSize": 11,
      "hideOverlap": true
    },
    "splitLine": {
      "lineStyle": {
        "color": "#444",
        "type": "solid"
      }
    }
  },
  "series": [
    {
      "name": "Registradas",
      "type": "bar",
      "data": [
        10,
        0
      ],
      "itemStyle": {
        "color": "#a",
        "borderRadius": [
          3,
          3,
          0,
          0
        ]
      }
    },
    {
      "name": "Esperadas",
      "type": "bar",
      "data": [
        20,
        30
      ],
      "itemStyle": {
        "color": "#d",
        "borderRadius": [
          3,
          3,
          0,
          0
        ]
      }
    }
  ]
} as const;
