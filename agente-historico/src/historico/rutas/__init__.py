"""Routers HTTP del Historico, uno por dominio. `historico.api` los monta en `app`.

Transporte puro: cada router valida en el borde, delega y responde. Las
dependencias compartidas (API key, freno de consumo, agente perezoso) viven en
`historico.rutas.dependencias`.
"""
