"""Herramientas que el LLM puede invocar. Hoy: la de pronostico de irradiancia."""
from predictivo.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast

__all__ = ["FORECAST_TOOL_SCHEMA", "run_forecast"]
