"""La ventana de analisis [desde, hasta) con su granularidad. Contrato compartido.

TODO algoritmo de `analitica` recibe una Ventana y nada mas para acotar el tiempo.
Existe como modulo propio porque es la entrada de TODAS las metricas del documento
de evaluacion, y si cada una la parseara por su cuenta terminariamos con cuatro
criterios distintos de "que significa marzo".

## LA REGLA QUE NO SE PUEDE ROMPER: los timestamps NO son UTC

Las columnas son `timestamptz` y los valores vienen etiquetados `+00`, pero lo que
se guardo es la HORA LOCAL DE COSTA RICA (UTC-6) con esa etiqueta puesta encima.
Esta verificado contra el dato, no supuesto: en marzo-junio 2026 la irradiancia
media pico cae en la hora 11-12 y se anula en la 5 y la 17, y `ventana_solar` da
amanecer 05:26 y atardecer 17:20 para esas mismas fechas. Si el valor fuera UTC de
verdad, el mediodia solar caeria a las 17-18 y el sol saldria de noche.

Consecuencia practica, y es la que importa: **nunca conviertas de zona horaria.**
`extract(hour from timestamp)` YA devuelve la hora local, y filtrar por una fecha
ISO YA filtra por fecha local. Meter un `AT TIME ZONE` corre seis horas todos los
perfiles diarios, el heatmap de carpeta y la comparacion contra la altura solar.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

# Toda la data PV vive aca dentro. Fuera de este rango la ventana es un error del
# que pregunta, no un periodo vacio, y conviene decirlo distinto.
PRIMER_DIA = date(2024, 11, 10)
# Holgado a proposito: acota entradas absurdas sin caducar cuando entre data nueva.
ULTIMO_DIA = date(2100, 1, 1)

HORA, DIA, SEMANA, MES = "hora", "dia", "semana", "mes"
GRANULARIDADES = (HORA, DIA, SEMANA, MES)

# Hasta cuantos dias de ventana sigue teniendo sentido cada granularidad. Es lo que
# evita que "todo el historico por hora" devuelva 13.000 puntos que ni el navegador
# dibuja ni el ojo lee. Ordenado de mas fina a mas gruesa.
_TECHO_DIAS = {HORA: 14, DIA: 120, SEMANA: 730}

# Traduccion a `date_trunc`. Unico lugar donde se escribe: la granularidad llega
# validada contra GRANULARIDADES, asi que interpolarla en el SQL es seguro.
TRUNC = {HORA: "hour", DIA: "day", SEMANA: "week", MES: "month"}


class VentanaInvalida(ValueError):
    """Ventana que no se puede analizar. `codigo` la identifica sin leer el texto."""

    def __init__(self, codigo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo


@dataclass(frozen=True)
class Ventana:
    """Periodo cerrado por la izquierda y abierto por la derecha, en fecha LOCAL."""

    desde: date
    hasta: date
    granularidad: str

    @property
    def dias(self) -> int:
        return (self.hasta - self.desde).days

    @property
    def trunc(self) -> str:
        """El argumento de `date_trunc` para agrupar a esta granularidad."""
        return TRUNC[self.granularidad]

    @property
    def sql(self) -> tuple[str, str]:
        """El par de parametros del `WHERE ts >= %s AND ts < %s`."""
        return (self.desde.isoformat(), self.hasta.isoformat())

    def como_dict(self) -> dict:
        """Lo que viaja al cliente y al agente dentro de cada respuesta."""
        return {"desde": self.desde.isoformat(), "hasta": self.hasta.isoformat(),
                "dias": self.dias, "granularidad": self.granularidad}


def _fecha(valor: str | date | None, defecto: date, campo: str) -> date:
    if valor is None:
        return defecto
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError as exc:
        raise VentanaInvalida(
            "fecha_ilegible",
            f"{campo} no es una fecha ISO (aaaa-mm-dd): {valor!r}",
        ) from exc


def granularidad_sugerida(dias: int) -> str:
    """La granularidad mas fina que no ahoga al lector para una ventana de N dias."""
    for nivel in (HORA, DIA, SEMANA):
        if dias <= _TECHO_DIAS[nivel]:
            return nivel
    return MES


def crear(desde: str | date | None = None, hasta: str | date | None = None,
          granularidad: str | None = None) -> Ventana:
    """Normaliza y VALIDA la ventana. Es la unica puerta de entrada a `Ventana`.

    Omitir `desde`/`hasta` abre ese extremo a todo el historico. Omitir la
    granularidad la elige segun el largo del periodo (ver `granularidad_sugerida`).
    """
    d = _fecha(desde, PRIMER_DIA, "desde")
    h = _fecha(hasta, ULTIMO_DIA, "hasta")
    if h <= d:
        raise VentanaInvalida(
            "rango_vacio",
            f"`hasta` ({h}) tiene que ser posterior a `desde` ({d}); el fin es exclusivo",
        )
    if granularidad is None:
        return Ventana(d, h, granularidad_sugerida((h - d).days))
    if granularidad not in GRANULARIDADES:
        raise VentanaInvalida(
            "granularidad_desconocida",
            f"granularidad {granularidad!r}; validas: {', '.join(GRANULARIDADES)}",
        )
    return Ventana(d, h, granularidad)


def ultimos_dias(n: int, hasta: date) -> Ventana:
    """Ventana de los ultimos `n` dias contados hacia atras desde `hasta` (exclusivo).

    La usan los KPIs de "ultimos 7 dias" del dashboard, que el documento define
    contra el ULTIMO DIA CON DATOS DE LA VENTANA y no contra hoy: si la ventana no
    llega hasta hoy, o el logger se atraso, contra hoy esos KPIs saldrian todos en
    cero. Ojo: ese ultimo dia es el de la VENTANA. La frescura del sistema (si la
    planta sigue reportando) es otra pregunta y se mide sobre toda la base; vive en
    `analitica.resumen.evaluar_frescura` y no se acota al rango.
    """
    return Ventana(hasta - timedelta(days=n), hasta, DIA)
