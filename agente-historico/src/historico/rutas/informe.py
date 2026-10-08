"""El informe del periodo en Excel: `GET /informe`.

El frontend no puede leer el cuerpo de un .xlsx para saber si trae lectura, y un
informe que sale sin ella tiene que decirlo en pantalla. Va en una cabecera.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response

from historico import informe, tools, uso
from historico.rutas.dependencias import _frenar_consumo, _verificar_api_key

CABECERA_LECTURA = "X-Informe-Lectura"
CON_LECTURA, SIN_LECTURA = "ok", "sin_lectura"

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


@router.get("/informe")
def informe_excel(desde: str | None = Query(None), hasta: str | None = Query(None),
                  foco: str | None = Query(None, max_length=tools.preparar_informe.MAX_FOCO),
                  lectura: bool = Query(True),
                  x_api_key: str | None = Header(default=None)) -> Response:
    """El informe del periodo [desde, hasta] (los dos dias incluidos) como .xlsx.

    Las tablas son deterministas; `lectura=true` agrega la redaccion del modelo,
    verificada cifra por cifra contra los hechos del propio libro. Si la lectura
    falla o no pasa la verificacion, el libro sale igual y lo dice.

    El freno de consumo se llama a mano y no como dependencia porque depende de un
    parametro: con `lectura=false` no se gasta un token y el informe tiene que
    seguir saliendo con el presupuesto agotado, como el resto de lo determinista.
    """
    if lectura:
        _frenar_consumo(x_api_key)
    resultado_ = informe.generar(desde, hasta, foco, con_lectura=lectura)
    if resultado_.lectura.get("intentos"):
        try:
            uso.registrar(resultado_.lectura)   # best-effort, igual que /preguntar
        except Exception:  # noqa: BLE001
            pass
    return Response(
        content=resultado_.cuerpo, media_type=informe.libro.MIME,
        headers={"Content-Disposition": f'attachment; filename="{resultado_.nombre}"',
                 CABECERA_LECTURA: (CON_LECTURA if resultado_.lectura["parrafos"]
                                    else SIN_LECTURA)},
    )
