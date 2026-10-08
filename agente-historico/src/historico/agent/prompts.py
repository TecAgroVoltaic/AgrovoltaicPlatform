"""System prompts del historico. Codifican las reglas que lo hacen un ORQUESTADOR.

Fachada: `SYSTEM_PROMPT` (el de `/preguntar`) vive en `prompt_preguntar` y
`CHAT_SYSTEM` (el del chat) se compone por bloques en `prompt_chat`.
"""
from __future__ import annotations

from historico.agent.prompt_chat import CHAT_SYSTEM  # noqa: F401
from historico.agent.prompt_preguntar import SYSTEM_PROMPT  # noqa: F401
