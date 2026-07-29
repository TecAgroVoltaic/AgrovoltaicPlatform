"""Herramientas que el LLM puede invocar. Hoy: la de pronostico de irradiancia."""
from pronostico.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast

__all__ = ["FORECAST_TOOL_SCHEMA", "run_forecast"]
