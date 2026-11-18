/**
 * Mensajes "flash": se guardan en la sesión y se muestran una sola vez en la siguiente página
 * completa (patrón Post/Redirect/Get para formularios sin JavaScript).
 *
 * - `req.flash('success' | 'error' | 'info', mensaje)` agrega un mensaje.
 * - El layout llama a `consumeFlash()`; los fragmentos no lo hacen, así no "se comen" mensajes.
 */
export function flash() {
  return (req, res, next) => {
    req.flash = (type, message) => {
      req.session.flash = [...(req.session.flash ?? []), { type, message }];
    };
    res.locals.consumeFlash = () => {
      const messages = req.session?.flash ?? [];
      if (req.session) delete req.session.flash;
      return messages;
    };
    next();
  };
}
