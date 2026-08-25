# Imagen del microservicio del historico (FastAPI exponiendo las tools de analisis).
# La DB se lee por DATABASE_URL / HISTORICO_DB_URL (env). Sin estado ni cache.
FROM python:3.12-slim

WORKDIR /app

# Deps primero (capa cacheable); el codigo despues.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir ".[service]"

# Sin privilegios: el servicio solo LEE la DB.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "historico.api:app", "--host", "0.0.0.0", "--port", "8000"]
