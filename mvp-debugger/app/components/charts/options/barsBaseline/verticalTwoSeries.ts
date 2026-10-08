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
