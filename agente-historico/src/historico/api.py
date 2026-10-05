"""API HTTP del Historico — expone cada tool atomica como endpoint para VisioneFlow.

Patron "cerebro vs manos" (igual que el forecaster): el LLM lo orquesta el nodo
`aiAgent` de VisioneFlow; los numeros salen de AQUI. Cada tool atomica es un endpoint
`POST /tool/<nombre>`, que se cablea como una instancia del nodo generico
`httpRequestTool`. Transporte puro: valida en el borde, delega en la tool, responde
su dict (ya JSON-serializable).

Seguridad: si HISTORICO_API_KEY esta en el entorno, /tool exige el header
`x-api-key` (comparacion en tiempo constante). /health y /tools quedan abiertos.
"""
from __future__ import annotations

import os
import secrets

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel

from historico import datos, db, errores, limites, tools, uso
from historico.analitica import (
    carpeta, catalogo, comparativa, completitud, correlacion, crestas,
    distribucion, fuente, rendimiento, resumen, series, ventana,
)
from historico.calidad import corrida

ENV_API_KEY = "HISTORICO_API_KEY"
# Nombre anterior. Se sigue leyendo porque el contenedor desplegado tiene el viejo
# en su entorno, y aca la ausencia de clave no falla: DESACTIVA la verificacion.
# O sea que un renombre sin respaldo no rompe el servicio, lo deja abierto.
ENV_API_KEY_PREVIO = "HISTORICO_API_KEY"

app = FastAPI(
    title="agente Historico San Carlos",
    description="Tools de analisis del historico fotovoltaico como endpoints HTTP.",
    version="1.1.0",
)

# Todo error de parametro (fecha ilegible, variable desconocida, ventana imposible)
# sale 400 o 422 con su `codigo`, en vez de 500. Ver historico.errores.
errores.registrar(app)

# Agente perezoso: solo se construye al primer /preguntar (anthropic.Anthropic()
# exige ANTHROPIC_API_KEY al crear el cliente; /health y /tool no deben depender
# de esa clave). Se cachea para no releer el entorno en cada request.
_AGENTE = None


def _agente():
    global _AGENTE
    if _AGENTE is None:
        from historico.agent.agent import Historico
        _AGENTE = Historico()
    return _AGENTE


class Pregunta(BaseModel):
    """Cuerpo de POST /preguntar."""

    pregunta: str


class ChatMsg(BaseModel):
    """Un turno del historial de chat (texto limpio)."""

    rol: str  # "user" | "assistant"
    texto: str


class ChatBody(BaseModel):
    """Cuerpo de POST /chat: historial + contexto de la vista."""

    mensajes: list[ChatMsg]
    contexto: str | None = None


def _identidad(x_api_key: str | None) -> str:
    """Con quien se lleva la cuenta del ritmo. La clave se hashea: el limitador
    guarda identidades en memoria y no tiene por que tener el secreto en claro."""
    import hashlib
    return hashlib.sha256((x_api_key or "anonimo").encode()).hexdigest()[:16]


def _frenar_consumo(x_api_key: str | None = Header(default=None)) -> None:
    """Los dos frenos de los endpoints que gastan tokens del LLM.

    Va como dependencia y no dentro del handler para que sea imposible agregar
    una ruta conversacional sin freno: se ve en la firma del endpoint.
    """
    if not limites.LIMITADOR_LLM.permitir(_identidad(x_api_key)):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"limite de {limites.LIMITE_LLM_POR_MIN} consultas por minuto. "
                    f"Reintenta en unos segundos."),
            headers={"Retry-After": str(limites.LIMITADOR_LLM.espera_seg())},
        )
    agotado, gastado, tope = limites.presupuesto_agotado()
    if agotado:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"presupuesto diario agotado: US$ {gastado:.4f} de US$ {tope:.2f}. "
                    f"Las vistas deterministas siguen funcionando."),
        )


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key SOLO si esta configurada. Comparacion en tiempo constante."""
    esperada = os.environ.get(ENV_API_KEY) or os.environ.get(ENV_API_KEY_PREVIO)
    if not esperada:
        return
    if not secrets.compare_digest(esperada, x_api_key or ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="API key invalida")


@app.get("/health")
def health() -> dict:
    """Ping para monitoreo. No toca datos ni exige clave."""
    return {"status": "ok", "tools": [s["name"] for s in tools.SCHEMAS]}


@app.get("/tools")
def listar_tools() -> dict:
    """Esquemas de las tools (para configurar los httpRequestTool en VisioneFlow)."""
    return {"tools": tools.SCHEMAS}


@app.post("/tool/{nombre}", dependencies=[Depends(_verificar_api_key)])
def ejecutar_tool(nombre: str, params: dict = Body(default={})) -> dict:
    """Ejecuta la tool `nombre` con el body JSON como parametros. `def` -> threadpool
    (las tools hacen I/O de DB sincrono)."""
    fn = tools.DISPATCH.get(nombre)
    if fn is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"tool desconocida: {nombre!r} ({', '.join(tools.DISPATCH)})",
        )
    try:
        return fn(**(params or {}))
    except TypeError as exc:
        # Parametro que la tool no acepta: es el mismo caso que un ValueError (quien
        # llamo se equivoco), asi que se traduce para que lo atienda el manejador
        # compartido y responda con `codigo` como todos los demas.
        raise errores.ParametroInvalido(str(exc)) from exc


# ── Agente completo (con TRAZA) — para el debugger ────────────────────────────
@app.post("/preguntar", dependencies=[Depends(_verificar_api_key), Depends(_frenar_consumo)])
def preguntar(cuerpo: Pregunta) -> dict:
    """Corre el lazo LLM completo y devuelve la TRAZA (pasos + tools + respuesta + costo).

    Es la vista que consume el debugger: se ve que tool eligio el agente, con que
    parametros, la salida cruda de cada una, la respuesta final y el costo USD.
    `def` -> el lazo (I/O de red al LLM + DB) corre en el threadpool de FastAPI.

    La acumulacion de uso/costo se hace ACA (no en conversar()): el lazo del agente
    queda puro y el servicio es el que lleva la cuenta general."""
    traza = _agente().conversar(cuerpo.pregunta)
    try:
        uso.registrar(traza)  # best-effort: un fallo de disco no debe tumbar la respuesta
    except Exception:
        pass
    return traza


@app.post("/chat", dependencies=[Depends(_verificar_api_key), Depends(_frenar_consumo)])
def chat(cuerpo: ChatBody) -> dict:
    """Turno de CHAT multi-turno (para el widget). Recibe el historial de texto y el
    contexto de la vista; devuelve la respuesta + traza (tools/web) + costo."""
    traza = _agente().chat([m.model_dump() for m in cuerpo.mensajes], cuerpo.contexto)
    try:
        uso.registrar(traza)
    except Exception:
        pass
    return traza


@app.get("/uso", dependencies=[Depends(_verificar_api_key)])
def consumo() -> dict:
    """Consumo acumulado del agente (tokens + costo USD + nº consultas, por modelo).

    Incluye el estado del tope diario: de nada sirve saber cuanto se gasto si no
    se ve contra que se compara.
    """
    agotado, gastado, tope = limites.presupuesto_agotado()
    return {**uso.resumen(),
            "hoy": {"usd": round(gastado, 6), "tope_usd": tope, "agotado": agotado}}


# ── Peek de datos read-only — para cruzar lo que el agente calculo ────────────
# Sin `try/except`: una tabla o columna fuera de la allowlist levanta ValueError
# y el manejador compartido lo traduce a 400 con `codigo`, igual que en el resto
# de la API. Tres bloques identicos eran tres lugares donde el codigo podia faltar.
@app.get("/datos/tablas", dependencies=[Depends(_verificar_api_key)])
def datos_tablas() -> dict:
    """Panorama de cobertura de todas las relaciones (conteo + rango temporal)."""
    return datos.tablas()


@app.get("/datos/columnas", dependencies=[Depends(_verificar_api_key)])
def datos_columnas(tabla: str = Query(...)) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    return datos.columnas(tabla)


@app.get("/datos/muestra", dependencies=[Depends(_verificar_api_key)])
def datos_muestra(tabla: str = Query(...), limit: int = Query(20),
                  orden: str = Query("desc")) -> dict:
    """Ultimas/primeras filas crudas de una relacion (allowlist)."""
    return datos.muestra(tabla, limit, orden)


@app.get("/datos/serie", dependencies=[Depends(_verificar_api_key)])
def datos_serie(tabla: str = Query(...), columna: str = Query(...),
                bucket: str = Query("day"), agg: str = Query("avg"),
                desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Serie temporal agregada (para graficar) de una columna de la allowlist."""
    return datos.serie(tabla, columna, bucket, agg, desde, hasta)


# ── Arquitectura y calidad ───────────────────────────────────────────────────
# /arquitectura va SIN clave, igual que /health y /tools: es la descripcion del
# agente, no sus datos. Que se pueda leer sin credencial es el punto (la consola
# la dibuja), y no expone ni una lectura del sistema.
@app.get("/arquitectura")
def arquitectura_agente() -> dict:
    """El agente como estructura, derivado de las tools reales. Ver arquitectura.py."""
    from historico.arquitectura import mapa
    return mapa()


# Los tres de abajo son lecturas directas del store para las VISTAS de la consola.
# No son tools: una tool esta redactada para que un LLM la elija y devuelve lo
# justo; una vista necesita el detalle completo y paginado. Mezclarlas obligaria
# a que la descripcion que lee el modelo hable de paginacion, que no le importa.
# ── Quien vigila que: el matiz entre "salio limpia" y "nadie la miro" ────────
# Las relaciones cuyos hallazgos SI llegan al veredicto del dia. NO es una lista a
# mano: es el conjunto de `fuente_calidad` del catalogo, que por construccion son
# las dos tablas que el CTE `filas_dia` de `calidad.contexto` sabe contar (esa es
# literalmente la condicion 2 para entrar en `catalogo._VIGILADAS`). Derivarlo en
# vez de copiar los dos nombres es lo que hace que, si algun dia `contexto` aprende
# a contar una tercera tabla, esta respuesta no se quede vieja en silencio.
def _fuentes_del_veredicto() -> list[str]:
    return sorted({var.fuente_calidad for var in catalogo.CATALOGO.values()
                   if var.fuente_calidad})


_NOTA_VIGILANCIA = (
    "`sin_vigilancia` NO significa `sin hallazgos`, y la respuesta separa las dos "
    "cosas a proposito porque confundirlas hace afirmar algo falso. "
    "`hallazgos_en_el_periodo` cuenta los que SI existen para esa clave (la POA "
    "tiene, y aun asi nadie la barre), y `cuentan_para_el_veredicto` dice si "
    "`confianza` puede verlos: solo llegan los que traen una de las "
    "`fuentes_del_veredicto`, las unicas relaciones con denominador de filas por "
    "dia. Los motivos: `columna_no_barrida` = su tabla si se cuenta, pero el barrido "
    "no mira esa columna; `fuente_sin_denominador` = puede acumular hallazgos y "
    "ninguno pesara jamas en el veredicto; `variable_derivada` = no existe cruda, "
    "ningun detector puede escribirla; `sin_fuente_en_la_base` = ninguna tabla la "
    "contiene. En los cuatro, cero hallazgos no es un aprobado: es un examen en blanco. "
    "`hallazgos_sin_peso` es el TOTAL de los que no pesan en el veredicto (la suma de "
    "`hallazgos_en_el_periodo` de las que tienen `cuentan_para_el_veredicto` en false), "
    "y viaja sumado porque el que lo lee no puede sumarlo: son casi uno de cada cinco "
    "y el titular de esa advertencia es el total, no la mayor de las partes."
)


def _motivo_sin_vigilancia(var, fuentes: list[str]) -> str:
    """Por que el barrido no revisa esta variable. Cuatro casos, todos distintos."""
    if not var.disponible:
        return "sin_fuente_en_la_base"
    if var.relacion_cruda is None:
        return "variable_derivada"
    if var.relacion_cruda not in fuentes:
        return "fuente_sin_denominador"
    return "columna_no_barrida"


_SQL_VIGILANCIA = ("SELECT variable, count(*) AS n FROM hallazgos_calidad "
                   "WHERE fecha >= %s AND fecha < %s GROUP BY variable")


def _vigilancia(conteo: dict[str, int]) -> dict:
    """Que variables reviso el barrido en el periodo y cuales no las miro NADIE.

    Sin esto, un examen en blanco se lee como un aprobado: `confianza` responde
    "cero hallazgos" tanto para una variable sana como para una que nadie abrio.
    Vivia solo por variable en `/calidad/pruebas` y dentro de `confianza` en
    analitica, asi que la vista de calidad lo reconstruia a mano.

    PURA: recibe el conteo por variable ya consultado (`_SQL_VIGILANCIA`). La
    consulta se hace afuera para que el endpoint la pueda mandar junto con las otras
    cuatro en un solo viaje al pooler; ver `calidad_resumen`.
    """
    fuentes = _fuentes_del_veredicto()
    vigiladas, ciegas = [], []
    for var in catalogo.CATALOGO.values():
        if var.clave_calidad:
            vigiladas.append(var.clave)
            continue
        crudo = var.origen_crudo
        cruda = crudo[1] if crudo else None
        ciegas.append({
            "clave": var.clave,
            "familia": var.familia,
            "fuente": var.relacion_cruda,
            "motivo": _motivo_sin_vigilancia(var, fuentes),
            "hallazgos_en_el_periodo": (
                conteo.get(var.clave, 0)
                + (conteo.get(cruda, 0) if cruda and cruda != var.clave else 0)),
            "cuentan_para_el_veredicto": var.relacion_cruda in fuentes,
        })
    return {
        "vigiladas": vigiladas,
        "sin_vigilancia": ciegas,
        # El TITULAR de la advertencia, sumado aca. La consola no puede sumarlo (no
        # se calcula en el navegador), asi que sin este total mostraba el corte y la
        # mayor de las partes en vez del numero que hace pesar la advertencia.
        "hallazgos_sin_peso": sum(c["hallazgos_en_el_periodo"] for c in ciegas
                                  if not c["cuentan_para_el_veredicto"]),
        "fuentes_del_veredicto": fuentes,
        "nota": _NOTA_VIGILANCIA,
    }


@app.get("/calidad/resumen", dependencies=[Depends(_verificar_api_key)])
def calidad_resumen(desde: str | None = Query(None),
                    hasta: str | None = Query(None)) -> dict:
    """Cobertura, cielo, desglose de hallazgos y VIGILANCIA. La cabecera de la vista.

    `calidad` y `cielo` son lo mismo que ven las tools (y por lo tanto el LLM).
    `tipos` es el desglose COMPLETO por fuente, con las fechas extremas: la tabla
    de la consola lo necesita y el resumen de la tool no lo trae, porque para
    narrar alcanzan los cinco problemas mas frecuentes. `vigilancia` dice a que
    variables no las miro nadie, que es lo que separa "se reviso y salio limpia"
    de "nadie la abrio": ver `_vigilancia`.
    """
    from historico.calidad import reporte
    from historico.periodo import rango
    from historico.tools import calidad_periodo, cielo_periodo
    d, h = rango(desde, hasta)
    # ESTE endpoint es el unico que bloquea la primera pintura de `/calidad`, asi
    # que su reloj es el de la vista. Son cinco consultas y NINGUNA depende de otra:
    # en fila costaban siete viajes al pooler (~1,8 s medidos a 30 dias, mas con
    # rangos largos) para un armado que despues tarda milisegundos.
    #
    # Las cinco van en UNA sola tanda, PLANA. Anidar (`calidad_periodo.run` dentro
    # de esta tanda) no serviria: un `en_paralelo` dentro de otro corre en fila para
    # no colgar el ejecutor, asi que ese bloque volvia a costar dos viajes en serie
    # y era el que marcaba el reloj. Por eso se piden sus dos consultas sueltas
    # (`calidad_periodo.tareas`) y se arma su cuerpo despues, con la misma funcion
    # que usa la tool. Ver la nota de anidamiento en `db.en_paralelo`.
    veredicto_calidad, frecuentes = calidad_periodo.tareas(d, h)
    resumen_veredicto, problemas, cielo, tipos, conteo = db.en_paralelo(
        veredicto_calidad,
        frecuentes,
        lambda: cielo_periodo.run(desde, hasta),
        lambda: reporte.hallazgos_por_tipo(d, h),
        lambda: db.query(_SQL_VIGILANCIA, (d, h)),
    )
    return {
        "calidad": calidad_periodo.componer(d, h, resumen_veredicto, problemas),
        "cielo": cielo,
        "tipos": tipos,
        "vigilancia": _vigilancia({f["variable"]: f["n"] for f in conteo}),
    }


@app.get("/calidad/dias", dependencies=[Depends(_verificar_api_key)])
def calidad_dias(desde: str | None = Query(None),
                 hasta: str | None = Query(None)) -> dict:
    """Un renglon por dia de CALENDARIO con su veredicto, para el mapa de dias."""
    from historico.calidad import contexto
    from historico.periodo import rango
    d, h = rango(desde, hasta)
    return {"periodo": {"desde": d, "hasta": h}, "dias": contexto.dias(d, h)}


# ── Paginacion de hallazgos: el orden tiene que ser TOTAL ────────────────────
# Con 26.023 hallazgos en el store, la vista tiene que poder recorrer y no solo
# filtrar. Y paginar sobre un orden AMBIGUO miente en silencio: si dos filas empatan
# en la clave de orden, la base puede devolverlas en distinto orden en dos consultas
# seguidas, y entre pagina y pagina una se repite y otra se pierde sin ningun error.
#
# El desempate es la PRIMARY KEY de `hallazgos_calidad` (fecha, fuente, variable,
# tipo): por definicion no hay dos filas que la compartan, asi que incluirla entera
# hace el orden TOTAL. Se conserva el criterio de la tool (graves primero, luego
# fecha descendente) y solo se COMPLETA con `fuente`, que era lo unico que faltaba
# de la PK. No es teorico: `dia_incompleto` del mismo dia lo escriben las dos
# fuentes, y esas dos filas empataban en los cuatro campos del orden viejo.
_ORDEN_HALLAZGOS = "(severidad = 'grave') DESC, fecha DESC, tipo, variable, fuente"

# Los tres filtros opcionales. Nombres LITERALES de este modulo, nunca entrada del
# usuario: los valores viajan como parametros.
_CAMPOS_FILTRO = ("tipo", "severidad", "variable")


def _filtro_hallazgos(desde, hasta, tipo: str | None, severidad: str | None,
                      variable: str | None) -> tuple[str, list]:
    """El WHERE que comparten el CONTEO y la PAGINA.

    Uno solo para los dos a proposito: un total calculado sobre un filtro distinto
    del de la pagina es peor que no dar total, porque se lee como si fuera cierto.
    """
    cond = ["fecha >= %s", "fecha < %s"]
    params: list = [desde, hasta]
    for campo, valor in zip(_CAMPOS_FILTRO, (tipo, severidad, variable)):
        if valor:
            cond.append(f"{campo} = %s")
            params.append(valor)
    return " AND ".join(cond), params


@app.get("/calidad/hallazgos", dependencies=[Depends(_verificar_api_key)])
def calidad_hallazgos(fecha: str | None = Query(None), tipo: str | None = Query(None),
                      severidad: str | None = Query(None), variable: str | None = Query(None),
                      desde: str | None = Query(None), hasta: str | None = Query(None),
                      limite: int = Query(50, ge=1, le=200),
                      offset: int = Query(0, ge=0)) -> dict:
    """El detalle, PAGINADO. `fecha` es un atajo para pedir un solo dia.

    `total` es el del FILTRO y no el de la pagina: sin el, la vista corta el listado
    en silencio y el usuario no puede saber que hay mas, que es la version de
    interfaz del mismo problema que perseguimos en los datos. `pagina.hay_mas` y
    `pagina.siguiente_offset` lo dejan recorrer sin tener que hacer la cuenta.

    No delega en la tool `hallazgos_calidad` porque esa no pagina (su `limite` tiene
    techo 200 y no acepta `offset`): lo que si se comparte es `QUE_ES`, para que la
    traduccion de cada tipo no se bifurque en dos diccionarios.
    """
    from datetime import date, timedelta

    from historico.periodo import rango
    from historico.tools import hallazgos
    if fecha:
        try:
            d0 = date.fromisoformat(fecha)
        except ValueError as exc:
            # Mismo error tipado que usa el resto de la API para una fecha ilegible:
            # dos codigos distintos para el mismo problema obligan al cliente a
            # tratar cada ruta como un caso aparte.
            raise ventana.VentanaInvalida(
                "fecha_ilegible", f"fecha no es una fecha ISO (aaaa-mm-dd): {fecha!r}"
            ) from exc
        desde, hasta = d0.isoformat(), (d0 + timedelta(days=1)).isoformat()
    d, h = rango(desde, hasta)
    donde, params = _filtro_hallazgos(d, h, tipo, severidad, variable)
    # El conteo del filtro y la pagina se piden a la vez: dos viajes al pooler en
    # fila (~450 ms) para dos consultas que no se deben nada. Comparten el MISMO
    # `donde`, que es lo que garantiza que el total describa la pagina que se
    # devuelve. Ver `db.en_paralelo`.
    conteo, filas = db.en_paralelo(
        lambda: db.uno(f"SELECT count(*) AS n FROM hallazgos_calidad WHERE {donde}",
                       tuple(params)),
        lambda: db.query(
            f"""SELECT fecha, fuente, variable, tipo, severidad, n_afectadas, detalle
                  FROM hallazgos_calidad WHERE {donde}
                 ORDER BY {_ORDEN_HALLAZGOS}
                 LIMIT %s OFFSET %s""",
            tuple(params) + (limite, offset),
        ),
    )
    total = conteo.get("n", 0)
    for f in filas:
        f["que_es"] = hallazgos.QUE_ES.get(f["tipo"], "")
    hay_mas = offset + len(filas) < total
    return {
        "periodo": {"desde": d, "hasta": h},
        "total": total,
        "devueltos": len(filas),
        # Mismo significado que en la tool ("queda algo fuera de lo devuelto"),
        # contado desde donde arranca la pagina. En `offset=0` da lo mismo que antes.
        "truncado": hay_mas,
        "pagina": {"offset": offset, "limite": limite, "hay_mas": hay_mas,
                   "siguiente_offset": offset + len(filas) if hay_mas else None},
        "orden": _ORDEN_HALLAZGOS,
        "hallazgos": filas,
    }


# ── Analitica: un endpoint GET por ALGORITMO, no por vista ───────────────────
# Granulares a proposito. La consola compone cada pantalla desde Server Components
# con `Promise.all`, asi que un endpoint por vista solo acoplaria la API a un
# layout que va a cambiar, y obligaria a recalcular cosas que la pantalla de al
# lado ya pidio. Cada uno devuelve el sobre completo de `analitica.resultado`
# (ventana + confianza + payload), arrays incluidos: aca SI viajan, porque el que
# consume es el que dibuja. La version recortada para el LLM esta en `tools`.
#
# Todos son de SOLO LECTURA y comparten el mismo par de parametros de rango. Los
# errores de parametro los traduce `historico.errores`, no un try/except por ruta.
_SEPARADOR_LISTA = ","


def _lista(texto: str) -> list[str]:
    """'a,b' -> ['a', 'b']. Las listas viajan separadas por coma en la query."""
    return [pieza.strip() for pieza in texto.split(_SEPARADOR_LISTA) if pieza.strip()]


# Los campos del catalogo que la consola necesita para OFRECER una variable, y no
# mas: los limites fisicos, la relacion y las columnas crudas son interior del
# analisis, y publicarlos ataria la API al esquema de la base.
_CAMPOS_VARIABLE = ("clave", "etiqueta", "unidad", "familia",
                    "dato_desde", "dato_hasta", "hueco", "fuente_ausente")

_NOTA_VARIABLES = (
    "`graficable` dice si `/analitica/series` acepta esa clave, y se resuelve por la "
    "MISMA puerta que usa ese endpoint: no hay que deducirlo de `fuente_ausente`, que "
    "es el porque en prosa. `dato_desde`/`dato_hasta` acotan el tramo en que la "
    "variable EXISTE (fuera de el no es que falte el dato: el sensor no estaba, o la "
    "vista lo anula), y `hueco` cuenta el agujero INTERIOR, que un par de fechas no "
    "puede expresar. Con los tres, una vista vacia puede decir 'todavia no existia' en "
    "vez de 'no hay datos'. Esta es la lista buena: la tool `catalogo_variables` lee "
    "`diccionario_variables`, que trae nombres de COLUMNA CRUDA y no claves del "
    "catalogo."
)


def _graficable(clave: str) -> bool:
    """Si `/analitica/series` acepta esta clave. Se PREGUNTA, no se deduce.

    Se resuelve con `fuente.origen`, que es exactamente el gate que corre
    `analitica_series`. Deducirlo de `fuente_ausente` seria una segunda copia de la
    condicion, y la segunda copia es la que se queda vieja sin que nadie lo note.

    Solo se atrapa `ValueError`, que es el fallo DECLARADO (`FuenteAusente`). Si
    alguna vez una variable del catalogo apuntara a una relacion sin filtro en
    `fuente`, eso es un defecto de este repo: tiene que reventar aca y no disfrazarse
    de `graficable: false`, que lo dejaria escondido justo donde nadie mira.
    """
    try:
        fuente.origen(clave)
        return True
    except ValueError:
        return False


@app.get("/analitica/variables", dependencies=[Depends(_verificar_api_key)])
def analitica_variables() -> dict:
    """El CATALOGO: que variables se pueden pedir, desde cuando y con que huecos.

    Sin parametros y sin ventana: es metadato, no una lectura del periodo, asi que no
    lleva el sobre de `resultado` (no habria sobre que llenar).

    ## Por que no alcanza la tool `catalogo_variables`

    Esa tool lee `diccionario_variables`, que guarda nombres de COLUMNA CRUDA, no
    claves del catalogo, y la diferencia se mide en errores de la consola: seis de sus
    nombres (`irradiancia_incidente`, `irradiancia_reflejada`, los dos del SP722 y los
    dos detectores en mV) hacen que `/analitica/series` responda 400, y le faltan las
    cuatro POA, `cs_ghi_wm2` y `kt_star`, que si se pueden graficar. Guiarse por ella
    es ofrecer lo que no se puede dibujar y esconder lo que si. La fuente de verdad de
    lo que la API acepta es `analitica.catalogo`, que es de donde sale esto.
    """
    return {
        "variables": [{**{campo: getattr(var, campo) for campo in _CAMPOS_VARIABLE},
                       "graficable": _graficable(var.clave)}
                      for var in catalogo.CATALOGO.values()],
        "familias": sorted({var.familia for var in catalogo.CATALOGO.values()}),
        "nota": _NOTA_VARIABLES,
    }


@app.get("/analitica/resumen", dependencies=[Depends(_verificar_api_key)])
def analitica_resumen(desde: str | None = Query(None),
                      hasta: str | None = Query(None)) -> dict:
    """Los 9 KPIs de cabecera del documento (Fig. 2)."""
    return resumen.calcular(ventana.crear(desde, hasta))


@app.get("/analitica/completitud", dependencies=[Depends(_verificar_api_key)])
def analitica_completitud(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          granularidad: str | None = Query(None)) -> dict:
    """Puntos reales contra esperados por periodo, y los tramos sin datos (Fig. 4)."""
    return completitud.calcular(ventana.crear(desde, hasta, granularidad))


@app.get("/analitica/series", dependencies=[Depends(_verificar_api_key)])
def analitica_series(variables: str = Query(...), desde: str | None = Query(None),
                     hasta: str | None = Query(None),
                     granularidad: str | None = Query(None),
                     media_movil: int = Query(series.BUCKETS_MEDIA_MOVIL)) -> dict:
    """Serie temporal con banda, media movil y recta de tendencia (Fig. 5)."""
    return series.serie_temporal(ventana.crear(desde, hasta, granularidad),
                                 _lista(variables), media_movil)


@app.get("/analitica/distribucion", dependencies=[Depends(_verificar_api_key)])
def analitica_distribucion(variable: str = Query(...), desde: str | None = Query(None),
                           hasta: str | None = Query(None)) -> dict:
    """Box plot por mes con el criterio IQR de outliers (Fig. 6, panel superior)."""
    return distribucion.cajas_mensuales(ventana.crear(desde, hasta), variable)


@app.get("/analitica/irradiacion", dependencies=[Depends(_verificar_api_key)])
def analitica_irradiacion(
        variable: str = Query(distribucion.IRRADIANCIA_POR_DEFECTO),
        desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Irradiacion acumulada por mes en kWh/m2 (Fig. 6, panel GHI)."""
    return distribucion.irradiacion_mensual(ventana.crear(desde, hasta), variable)


@app.get("/analitica/carpeta", dependencies=[Depends(_verificar_api_key)])
def analitica_carpeta(variable: str = Query(...), desde: str | None = Query(None),
                      hasta: str | None = Query(None),
                      agregacion: str = Query(carpeta.PROMEDIO)) -> dict:
    """Matriz dia x hora LOCAL, con los huecos marcados (Fig. 8 bis)."""
    return carpeta.diagrama(ventana.crear(desde, hasta), variable, agregacion)


@app.get("/analitica/correlacion", dependencies=[Depends(_verificar_api_key)])
def analitica_correlacion(x: str = Query(...), y: str = Query(...),
                          desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          techo_puntos: int = Query(correlacion.TECHO_PUNTOS)) -> dict:
    """Nube de puntos con ajuste OLS: ecuacion y R2 (Fig. 8)."""
    return correlacion.dispersion(ventana.crear(desde, hasta), x, y, techo_puntos)


@app.get("/analitica/crestas", dependencies=[Depends(_verificar_api_key)])
def analitica_crestas(grupos: str = Query(...), desde: str | None = Query(None),
                      hasta: str | None = Query(None),
                      umbral: float | None = Query(None),
                      cola: str = Query(crestas.SUPERIOR)) -> dict:
    """Densidades apiladas por grupo con probabilidad de cola (Fig. 7)."""
    return crestas.densidades(ventana.crear(desde, hasta), _lista(grupos), umbral, cola)


@app.get("/analitica/comparativa", dependencies=[Depends(_verificar_api_key)])
def analitica_comparativa(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          granularidad: str | None = Query(None)) -> dict:
    """Inclinado contra vertical: energia, curva horaria, PR y estacionalidad."""
    return comparativa.arreglos(ventana.crear(desde, hasta, granularidad))


# Los dos arreglos, en el orden en que los nombra el documento. Publicos los dos:
# el orden de las claves del payload no puede depender de un detalle de `tools`.
_ARREGLOS_PR = (rendimiento.INCLINADO, rendimiento.VERTICAL)

# Lo que se dice cuando los arrays NO viajan, para que quien lea la respuesta sepa
# que existen y como pedirlos. Reemplaza al recorte que la tool pega en su `nota`,
# que apunta a la API y aca ya seria un circulo.
_SIN_DETALLE = (" Esta respuesta trae los totales, los meses y el criterio; el "
                "renglon dia a dia y el detalle de cada dia descartado se piden "
                "con `detalle=true`.")


@app.get("/analitica/rendimiento", dependencies=[Depends(_verificar_api_key)])
def analitica_rendimiento(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          insumo: str = Query(rendimiento.GHI),
                          detalle: bool = Query(False)) -> dict:
    """Performance Ratio DIARIO Y MENSUAL (R1), con las seis variantes del insumo.

    `insumo` elige cual de las tres irradiancias se detalla dia a dia; los meses y el
    total llevan siempre las seis combinaciones, igual que en el modulo.

    ## Por que `detalle` y no siempre

    Los dos arrays que la tool recorta son el renglon dia a dia (228 dias del
    historico, ~11 KB) y el anexo de dias descartados con su motivo. El tablero
    dibuja el total y los meses, y no tiene por que pagar el peso de un anexo que no
    muestra; la vista comparativa si lo necesita y lo pide con `detalle=true`. Por
    defecto va en `false`: el que no sabe que existe recibe la respuesta liviana.

    ## Por que se reusan las reducciones de la tool

    Cuatro consolas derivan su esquema del payload de `performance_ratio`, asi que
    el cuerpo tiene que ser EL MISMO mas los arrays. Reescribir aca `_pr` y `_mes`
    seria la forma segura de que las dos formas se separen sin que nadie lo note:
    llamandolas, un cambio en la tool llega solo. Se usan sus nombres privados a
    conciencia; el acoplamiento es justo el que se busca.
    """
    completo = rendimiento.calcular(ventana.crear(desde, hasta), insumo)
    reducir_arreglo, reducir_mes = tools.performance._pr, tools.performance._mes
    cuerpo = {
        **completo,
        "total": {fuente: {ins: {arr: reducir_arreglo(completo["total"][fuente][ins][arr])
                                 for arr in _ARREGLOS_PR}
                           for ins in rendimiento.INSUMOS}
                  for fuente in rendimiento.FUENTES_ENERGIA},
        "por_mes": [reducir_mes(mes) for mes in completo["por_mes"]],
    }
    if detalle:
        return cuerpo
    return {**{k: v for k, v in cuerpo.items() if k != "por_dia"},
            "dias": {k: v for k, v in completo["dias"].items()
                     if k != "detalle_descartados"},
            "nota": completo["nota"] + _SIN_DETALLE}


@app.get("/analitica/energia", dependencies=[Depends(_verificar_api_key)])
def analitica_energia(desde: str | None = Query(None),
                      hasta: str | None = Query(None)) -> dict:
    """Energia AC del tablero (contadores del inversor) y DC por arreglo (R7).

    El cuerpo es el mismo que devuelve la tool `energia_por_arreglo`, y por eso se
    la llama en vez de recomponerla: dos composiciones de la misma respuesta son dos
    respuestas que se separan. Aca no hay nada que recortar, la tool ya manda el
    detalle entero.

    Se agrega `ventana`, que es lo que devuelven los otros nueve endpoints de
    `/analitica` (la tool llama `periodo` a ese mismo bloque). Van las dos claves con
    el mismo contenido: agregar una clave no rompe a ningun cliente, renombrarla si.
    """
    v = ventana.crear(desde, hasta)
    return {"ventana": v.como_dict(), **tools.energia.run(*v.sql)}


@app.get("/calidad/pruebas", dependencies=[Depends(_verificar_api_key)])
def calidad_pruebas(variable: str = Query(...), desde: str | None = Query(None),
                    hasta: str | None = Query(None)) -> dict:
    """Las cuatro familias de pruebas del documento, corridas ahora sobre una variable.

    Devuelve UNA evaluacion por prueba, corra o no: una prueba ausente del informe
    se lee como una prueba que paso, y cuatro de las nueve de validez fisica no
    tienen fuente en la base.
    """
    v = ventana.crear(desde, hasta)
    return corrida.como_dict(v, variable, corrida.evaluar(v, variable))
