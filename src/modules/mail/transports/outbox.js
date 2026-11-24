/**
 * Transporte simulado: el correo se queda en la bandeja de salida (`email_outbox`).
 *
 * Es el modo por defecto en desarrollo y en las pruebas: la fila de la bandeja *es* la entrega, y se
 * lee en `/dev/correos`. Existe por tres razones concretas, no por nostalgia:
 * - las pruebas de recuperación de clave obtienen el enlace de aquí, sin enviar correo real ni
 *   necesitar credenciales en el CI;
 * - permite enseñar el flujo completo a quien clona el proyecto sin pedirle una contraseña de Gmail;
 * - sirve de red de seguridad si el proveedor real bloquea la cuenta o vence la credencial.
 *
 * @returns {{ name: string, deliver: (email: object) => Promise<{ status: string, providerId: null }> }}
 */
export function createOutboxTransport() {
  return {
    name: 'outbox',
    async deliver() {
      // Nada que hacer: la fila ya está escrita y su estado queda como "simulated".
      return { status: 'simulated', providerId: null };
    },
  };
}
