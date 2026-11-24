# Mantenimiento

## 1. Versionado

[Versionado semántico](https://semver.org/lang/es/) `MAYOR.MENOR.PARCHE`:

- **PARCHE** (`0.1.1`): corrección de errores sin cambios de comportamiento esperado.
- **MENOR** (`0.2.0`): funcionalidad nueva compatible; una por sprint cerrado.
- **MAYOR** (`1.0.0`): la entrega final del curso.

Cada versión se etiqueta en Git (`git tag v0.1.0`) y se documenta en el [CHANGELOG](../../CHANGELOG.md)
con el formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## 2. Tipos de mantenimiento y cómo se gestionan

| Tipo | Ejemplo | Cómo entra al trabajo |
| --- | --- | --- |
| Correctivo | Un botón no aparece para el rol correcto | Issue "Reporte de error" con severidad; crítica y alta entran al sprint en curso |
| Adaptativo | Nueva versión de Node o de PostgreSQL | Dependabot abre un PR; el CI decide |
| Perfectivo | Mejorar la velocidad del tablero | Historia de usuario normal en el backlog |
| Preventivo | Pagar deuda técnica, subir cobertura | Ítem `deuda-tecnica` en el backlog; 10–20 % de cada sprint |

## 3. Dependencias

- **Dependabot** (`.github/dependabot.yml`) propone actualizaciones semanales de npm y mensuales de
  GitHub Actions.
- El CI ejecuta `npm audit --omit=dev --audit-level=high` en cada PR.
- Las actualizaciones *mayores* (por ejemplo, Express 6) se evalúan con un ADR.

### Cambiar el transporte de correo

`nodemailer` es la única dependencia nueva de la entrega real, y no arrastra subdependencias.

| `MAIL_TRANSPORT` | Qué hace | Cuándo usarlo |
| --- | --- | --- |
| `outbox` (por defecto) | El correo queda en `email_outbox`; se lee en `/dev/correos` | Desarrollo, pruebas y CI: no necesita credenciales |
| `smtp` | Envío real; exige `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS` | Demos y producción |

Para volver al modo simulado basta cambiar `MAIL_TRANSPORT=outbox` y reiniciar: no hay que tocar
código ni base de datos. Si el proveedor empieza a rechazar envíos, la bandeja muestra `failed` con
el motivo en la columna `error`, y el enlace de recuperación sigue siendo válido.

## 4. Deuda técnica conocida

| ID | Descripción | Impacto | Plan |
| --- | --- | --- | --- |
| DT-01 | El bus de eventos es en memoria: si el proceso cae entre el COMMIT y la publicación, se pierde el aviso (no los datos) | Bajo: los clientes se resincronizan al reconectar | Patrón *outbox* si se necesitara garantía |
| DT-02 | El limitador de intentos de login guarda los contadores en memoria | Con varias instancias, cada una cuenta por separado | Almacén compartido (PostgreSQL) si se escala |
| DT-03 | El CRUD de tipos de habitación y habitaciones (HU-05, HU-06) aún no tiene pantallas | El inventario se carga con el seed | Sprint 1 |
| DT-04 | El límite de solicitudes de recuperación es por IP, no por cuenta | Con varias IPs se puede llenar la bandeja de una persona | Tope por destinatario además del de IP |
| DT-05 | Un rebote del proveedor no vuelve a la aplicación | La bandeja dice `sent` aunque la dirección no exista | Webhook de rebotes del proveedor |

## 5. Monitoreo

- `GET /health` para el proveedor de despliegue.
- Logs JSON con `X-Request-Id`: un usuario que reporta un error puede dar ese id para encontrar la
  petición exacta.
- La bitácora (`audit_events`) responde "quién hizo qué y cuándo" sin revisar logs.

## 6. Plantilla de post-mortem (incidentes en la demo o en producción)

```markdown
## Incidente: <título>
- Fecha y duración:
- Impacto (qué no pudieron hacer los usuarios):
- Línea de tiempo:
- Causa raíz (5 porqués):
- Qué funcionó bien:
- Acciones (con responsable y fecha):
```
