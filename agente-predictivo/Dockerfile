# Imagen del microservicio /forecast (FastAPI envolviendo run_forecast).
# La DB se lee por DATABASE_URL (env); sin ella usa el cache parquet si existe.
FROM python:3.12-slim

WORKDIR /app

# Deps primero (capa cacheable); el codigo despues.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir ".[service]"

# Sin privilegios: el servicio solo lee la DB y escribe su cache en /app/data.
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app

# Obligatorio en la imagen: instalado con pip, el paquete vive en site-packages y
# config.ROOT (parents[2]) apuntaria a la raiz del interprete, no al proyecto.
ENV DATA_DIR=/app/data

USER appuser

EXPOSE 8000
CMD ["uvicorn", "pronostico.api:app", "--host", "0.0.0.0", "--port", "8000"]
