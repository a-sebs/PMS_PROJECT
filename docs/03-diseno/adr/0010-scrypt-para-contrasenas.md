# ADR-0010: `scrypt` nativo para contraseñas

- Estado: Aceptado
- Fecha: 2026-10-22

## Contexto

Las contraseñas deben guardarse con una función de derivación lenta y con sal. Las opciones más
comunes en Node (`bcrypt`, `argon2`) son paquetes con código nativo que a veces fallan al
instalarse en Windows o en imágenes Docker mínimas.

## Decisión

Usar **`crypto.scrypt`** de Node.js con una de las configuraciones que recomienda la
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
para scrypt: `N = 2^15, r = 8, p = 3` (≈ 32 MiB de memoria por cálculo, equivalente en costo al
mínimo `N = 2^17, p = 1` pero más amable con servidores pequeños). Además:

- Sal aleatoria de 16 bytes y clave de 64 bytes.
- Comparación con `crypto.timingSafeEqual`.
- Formato autodescriptivo que guarda los parámetros:

  ```text
  scrypt$32768$8$3$<sal base64url>$<hash base64url>
  ```

## Alternativas consideradas

- **Argon2id**: primera opción de OWASP, pero requiere un paquete nativo.
- **bcrypt**: OWASP lo reserva para sistemas heredados; limita la contraseña a 72 bytes.
- **PBKDF2**: solo es la preferida cuando se exige cumplimiento FIPS-140.

## Consecuencias

- ✅ Sin dependencias nativas: `npm install` funciona igual en todos los sistemas.
- ✅ Como el formato guarda los parámetros, se puede subir el costo más adelante sin invalidar
  contraseñas existentes (se recalcula el hash al iniciar sesión).
- ⚠️ Cada inicio de sesión cuesta ~100–200 ms de CPU: es intencional y por eso el login tiene
  limitación de intentos.
- ⚠️ Si el proyecto pasara a producción real, conviene evaluar Argon2id.
