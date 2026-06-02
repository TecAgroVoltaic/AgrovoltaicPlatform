---
name: agrodash
description: API de sensores de suelo (sistema aparte en producción); NO se combina con la data fotovoltaica
categoria: contexto-externo
---

# AgroDash — sistema APARTE (no combinar)

`docs/referencia_api_agrodash.pdf` documenta **AgroDash**: un dashboard ya en producción
(Rust + Axum + PostgreSQL) de **sensores agronómicos/de suelo** (tipos: calibrada, ec,
humedad, p/potencial, polinomial, temperatura; cajas A, S, O, Hum_Suelo SC).

- **Sistema hermano pero completamente separado.** NO se fusiona con la data fotovoltaica
  (los CSV). El PDF es **solo contexto general de referencia**, NO una guía a seguir.
- Único aporte útil: su endpoint `/environment/temperature` filtra a −10…60 °C → respalda
  tratar temp=85.0 como inválido (ver [[temperatura-85]]).
- El timezone que menciona (UTC−6, Costa Rica) es de AgroDash, **no resuelve** el de
  nuestros CSV (ver [[bloqueantes]]).

Relacionado: [[bloqueantes]], [[temperatura-85]].
