# Cómo contribuir

1. Toma un issue del tablero (columna **Listo**) y asígnatelo.
2. Crea una rama desde `main`: `feat/HU-12-crear-reserva`, `fix/…`, `docs/…`.
3. Haz commits pequeños con [Conventional Commits](https://www.conventionalcommits.org/es/):
   `feat(reservations): bloqueo temporal de fechas`.
4. Antes de subir: `npm run check` (lint + formato + pruebas).
5. Abre un Pull Request con la plantilla, enlaza el issue (`Closes #12`) y pide una revisión.
6. Se integra con *squash merge* cuando el CI está en verde y hay una aprobación.

Reglas completas, convenciones de código y solución de problemas:
[docs/04-desarrollo/guia-de-desarrollo.md](docs/04-desarrollo/guia-de-desarrollo.md).
Definition of Done: [plan del proyecto § 4](docs/01-planificacion/plan-del-proyecto.md#4-definition-of-ready-y-definition-of-done).
