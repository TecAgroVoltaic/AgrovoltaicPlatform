"""Analizador — agente LLM de Q&A sobre los datos PV de San Carlos (Supabase).

El LLM SOLO orquesta: entiende la pregunta, elige una tool atomica, y redacta el
resultado en espanol. Los numeros salen SIEMPRE de una tool (SQL parametrizado de
solo-lectura sobre las vistas limpias); el LLM nunca calcula.

Diseno: responsabilidad simple. Una tool = un archivo = una pregunta especifica.
El LLM compone (llama varias) para preguntas compuestas.
"""

__version__ = "0.1.0"
