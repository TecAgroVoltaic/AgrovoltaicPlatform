"""API HTTP del Historico — expone cada tool atomica como endpoint para VisioneFlow.

Patron "cerebro vs manos" (igual que el forecaster): el LLM lo orquesta el nodo
`aiAgent` de VisioneFlow; los numeros salen de AQUI. Cada tool atomica es un endpoint
`POST /tool/<nombre>`, que se cablea como una instancia del nodo generico
`httpRequestTool`. Transporte puro: valida en el borde, delega en la tool, responde
su dict (ya JSON-serializable).

Este modulo solo crea `app`, registra el manejador de errores y monta los routers
de `historico.rutas`, uno por dominio. Reexporta los nombres que antes vivian aca
(dependencias, constantes, helpers) para que `historico.api:app`, los tests y el
debugger sigan importando lo mismo. `_agente` y `_asistente` son ademas el punto de
sustitucion: las rutas del agente los buscan aca en cada llamada.

Seguridad: si HISTORICO_API_KEY esta en el entorno, las rutas protegidas exigen el
header `x-api-key` (comparacion en tiempo constante). /health y /tools quedan abiertos.
"""
from __future__ import annotations

from fastapi import Depends, FastAPI

from historico import datos, db, errores, exportar, informe, limites, tools, uso  # noqa: F401
from historico.alertas import api as alertas_api
from historico.rutas import (
    agente, analitica, calidad, datos as rutas_datos, exportacion, fuentes, hallazgos,
    informe as rutas_informe, rendimiento, salud, variables,
)
from historico.rutas.agente import (  # noqa: F401
    ChatBody, ChatMsg, Pregunta, chat, chat_stream, consumo, preguntar,
)
from historico.rutas.analitica import (  # noqa: F401
    _SEPARADOR_LISTA, _lista, analitica_carpeta, analitica_comparativa,
    analitica_completitud, analitica_correlacion, analitica_crestas,
    analitica_dias_con_datos, analitica_distribucion, analitica_energia,
    analitica_irradiacion, analitica_resumen, analitica_series,
)
from historico.rutas.calidad import calidad_dias, calidad_pruebas, calidad_resumen  # noqa: F401
from historico.rutas.datos import (  # noqa: F401
    datos_columnas, datos_muestra, datos_serie, datos_tablas,
)
from historico.rutas.dependencias import (  # noqa: F401
    ENV_API_KEY, ENV_API_KEY_PREVIO, _agente, _asistente, _frenar_consumo, _identidad,
    _verificar_api_key,
)
from historico.rutas.informe import (  # noqa: F401
    CABECERA_LECTURA, CON_LECTURA, SIN_LECTURA, informe_excel,
)
from historico.rutas.exportacion import (  # noqa: F401
    MAX_EXPORTACIONES, _con_cupo, _exportaciones, _filtros_exportar, _http_exportar,
    _lista_csv, datos_exportables, datos_exportar, datos_exportar_estimar,
    datos_exportar_previa,
)
from historico.rutas.hallazgos import (  # noqa: F401
    _CAMPOS_FILTRO, _ORDEN_HALLAZGOS, _filtro_hallazgos, calidad_hallazgos,
)
from historico.rutas.rendimiento import _ARREGLOS_PR, _SIN_DETALLE, analitica_rendimiento  # noqa: F401
from historico.rutas.salud import arquitectura_agente, ejecutar_tool, health, listar_tools  # noqa: F401
from historico.rutas.variables import (  # noqa: F401
    _CAMPOS_VARIABLE, _NOTA_VARIABLES, _graficable, analitica_variables,
)
from historico.rutas.vigilancia import (  # noqa: F401
    _NOTA_VIGILANCIA, _SQL_VIGILANCIA, _fuentes_del_veredicto, _motivo_sin_vigilancia,
    _vigilancia,
)

app = FastAPI(
    title="agente Historico San Carlos",
    description="Tools de analisis del historico fotovoltaico como endpoints HTTP.",
    version="1.1.0",
)

# Todo error de parametro (fecha ilegible, variable desconocida, ventana imposible)
# sale 400 o 422 con su `codigo`, en vez de 500. Ver historico.errores.
errores.registrar(app)

for _modulo in (salud, agente, rutas_datos, exportacion, calidad, hallazgos,
                variables, analitica, rendimiento, rutas_informe, fuentes):
    app.include_router(_modulo.router)

app.include_router(alertas_api.router, dependencies=[Depends(_verificar_api_key)])
