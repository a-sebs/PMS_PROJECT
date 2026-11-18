/**
 * Agrega `res.renderPage(view, data)`: renderiza una vista y la envuelve en un layout.
 *
 * - `data.layout` elige el layout (por defecto `layouts/main`); `false` lo omite.
 * - Con la cabecera `X-Partial: main` se devuelve solo la vista (el contenido de <main>), que el
 *   cliente usa para resincronizarse sin recargar la página. Ver ADR-0003 y ADR-0006.
 *
 * @param {{ defaultLayout?: string }} [options]
 */
export function renderPage({ defaultLayout = 'layouts/main' } = {}) {
  return (req, res, next) => {
    res.vary('X-Partial');

    res.renderPage = (view, data = {}) => {
      const { layout = defaultLayout, ...locals } = data;
      res.render(view, locals, (err, body) => {
        if (err) return next(err);
        if (layout === false || req.get('X-Partial') === 'main') return res.send(body);
        res.render(layout, { ...locals, body }, (layoutErr, html) => {
          if (layoutErr) return next(layoutErr);
          res.send(html);
        });
      });
    };
    next();
  };
}
