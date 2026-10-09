"""Inventario de fuentes de datos: donde vive cada dato y que cobertura tiene hoy."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from historico import fuentes
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


@router.get("/fuentes")
def listar_fuentes() -> dict:
    """Supabase PV, store ambiental y AgroDash (San Carlos y Cartago), con cobertura viva."""
    return fuentes.inventario()
