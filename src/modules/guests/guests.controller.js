import { COUNTRY_OPTIONS } from '#src/core/countries.js';
import { todayIn } from '#src/core/dates.js';
import { ConflictError, NotFoundError, ValidationError } from '#src/core/errors.js';
import { parseInput } from '#src/core/validation.js';
import { fieldErrorsFrom, pickValues } from '#src/http/forms.js';
import { shiftYears } from '#src/public/js/lib/validators.js';
import {
  DOCUMENT_TYPES,
  GUEST_MAX_AGE,
  GUEST_MIN_AGE,
  guestIdSchema,
  guestListQuerySchema,
  guestSchema,
  NOTES_MAX_LENGTH,
  PAGE_SIZES,
  PERSON_NAME_PATTERN,
  versionSchema,
} from './guests.schemas.js';
import { EMPTY_FORM, pageWindow, toFormValues, toGuestView } from './guests.view-model.js';

const FORM_FIELDS = Object.keys(EMPTY_FORM);
const DOCUMENT_OPTIONS = Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label }));

/** Un id que no es un entero positivo equivale a un huésped inexistente (404, no 422). */
function parseGuestId(raw) {
  const parsed = guestIdSchema.safeParse(raw);
  if (!parsed.success) throw new NotFoundError('El huésped no existe o fue eliminado.');
  return parsed.data;
}

/** URL del listado conservando los filtros: /guests?q=ana&nationality=EC&page=2 */
function listHref({ q, nationality, perPage }, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (nationality) params.set('nationality', nationality);
  if (perPage !== PAGE_SIZES[0]) params.set('perPage', String(perPage));
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/guests?${query}` : '/guests';
}

/**
 * HU-41 · CRUD de huéspedes con páginas completas renderizadas en el servidor. Funciona sin
 * JavaScript (formularios + redirección 303 + mensaje flash).
 *
 * @param {{ guestsService: ReturnType<import('./guests.service.js').createGuestsService>,
 *           timezone: string }} deps
 */
export function createGuestsController({ guestsService, timezone }) {
  const today = () => todayIn(timezone);

  function renderForm(res, { status = 200, guest = null, values, errors = {}, notice = null }) {
    const now = today();
    res.status(status).renderPage('guests/form', {
      title: guest ? `Editar a ${guest.firstName} ${guest.lastName}` : 'Nuevo huésped',
      guest,
      values,
      errors,
      notice,
      documentTypes: DOCUMENT_OPTIONS,
      countries: COUNTRY_OPTIONS,
      namePattern: PERSON_NAME_PATTERN,
      birthDateMax: shiftYears(now, -GUEST_MIN_AGE),
      birthDateMin: shiftYears(now, -GUEST_MAX_AGE),
      minAge: GUEST_MIN_AGE,
      notesMax: NOTES_MAX_LENGTH,
      scripts: ['/js/forms.js', '/js/pages/guest-form.js'],
    });
  }

  /** Errores de un guardado: datos inválidos (422) o documento repetido (409). */
  function formErrorResponse(err) {
    if (err instanceof ValidationError) {
      return { status: 422, errors: fieldErrorsFrom(err) };
    }
    if (err instanceof ConflictError && err.code === 'DOCUMENT_TAKEN') {
      return {
        status: 409,
        errors: { documentNumber: err.message },
        duplicateId: err.details?.existingId ?? null,
      };
    }
    return null;
  }

  return {
    /** GET /guests — listado paginado con búsqueda y filtro por nacionalidad. */
    async index(req, res) {
      const filters = guestListQuerySchema.parse(req.query);
      const result = await guestsService.list(filters);
      if (result.total > 0 && filters.page > result.totalPages) {
        return res.redirect(303, listHref(filters, result.totalPages));
      }
      const now = today();
      res.renderPage('guests/index', {
        title: 'Huéspedes',
        ...result,
        guests: result.guests.map((guest) => toGuestView(guest, now)),
        filters,
        isFiltered: Boolean(filters.q || filters.nationality),
        countries: COUNTRY_OPTIONS,
        pageSizes: PAGE_SIZES,
        pages: pageWindow(result.page, result.totalPages).map((n) =>
          n === null ? null : { number: n, href: listHref(filters, n), current: n === result.page },
        ),
        prevHref: result.page > 1 ? listHref(filters, result.page - 1) : null,
        nextHref: result.page < result.totalPages ? listHref(filters, result.page + 1) : null,
      });
    },

    /** GET /guests/lookup?id=12 — consulta directa por identificador. */
    async lookup(req, res) {
      const parsed = guestIdSchema.safeParse(req.query.id);
      if (!parsed.success) {
        req.flash('error', 'Escribe un número de identificador válido (por ejemplo, 12).');
        return res.redirect(303, '/guests');
      }
      const guest = await guestsService.find(parsed.data);
      if (!guest) {
        req.flash('error', `No existe un huésped con el identificador ${parsed.data}.`);
        return res.redirect(303, '/guests');
      }
      res.redirect(303, `/guests/${guest.id}`);
    },

    /** GET /guests/:id — ficha del huésped. */
    async show(req, res) {
      const guest = await guestsService.get(parseGuestId(req.params.id));
      const view = toGuestView(guest, today());
      res.renderPage('guests/show', { title: view.fullName, guest: view });
    },

    /** GET /guests/new */
    newForm(req, res) {
      renderForm(res, { values: { ...EMPTY_FORM } });
    },

    /** POST /guests */
    async create(req, res) {
      const values = pickValues(req.body, FORM_FIELDS);
      try {
        const input = parseInput(guestSchema({ today: today() }), req.body);
        const guest = await guestsService.create(input, req.user);
        req.flash('success', `Se registró a ${guest.firstName} ${guest.lastName}.`);
        res.redirect(303, `/guests/${guest.id}`);
      } catch (err) {
        const failure = formErrorResponse(err);
        if (!failure) throw err;
        renderForm(res, {
          status: failure.status,
          values,
          errors: failure.errors,
          notice: failure,
        });
      }
    },

    /** GET /guests/:id/edit */
    async editForm(req, res) {
      const guest = await guestsService.get(parseGuestId(req.params.id));
      renderForm(res, { guest, values: toFormValues(guest) });
    },

    /** POST /guests/:id — actualizar (los formularios HTML solo envían GET y POST). */
    async update(req, res) {
      const id = parseGuestId(req.params.id);
      const guest = await guestsService.get(id);
      const values = { ...pickValues(req.body, FORM_FIELDS), version: req.body?.version };
      try {
        const { version } = parseInput(versionSchema, req.body);
        const input = parseInput(guestSchema({ today: today() }), req.body);
        const updated = await guestsService.update(id, version, input, req.user);
        req.flash(
          'success',
          `Se guardaron los cambios de ${updated.firstName} ${updated.lastName}.`,
        );
        res.redirect(303, `/guests/${id}`);
      } catch (err) {
        if (err instanceof ConflictError && err.code === 'VERSION_CONFLICT') {
          // Se muestran los datos actuales: guardar a ciegas borraría el trabajo de la otra persona.
          const current = err.details.current;
          return renderForm(res, {
            status: 409,
            guest: current,
            values: toFormValues(current),
            notice: { conflict: err.message },
          });
        }
        const failure = formErrorResponse(err);
        if (!failure) throw err;
        renderForm(res, {
          status: failure.status,
          guest,
          values,
          errors: failure.errors,
          notice: failure,
        });
      }
    },

    /** GET /guests/:id/delete — confirmación antes de eliminar. */
    async confirmDelete(req, res) {
      const guest = await guestsService.get(parseGuestId(req.params.id));
      res.renderPage('guests/delete', {
        title: `Eliminar a ${guest.firstName} ${guest.lastName}`,
        guest: toGuestView(guest, today()),
      });
    },

    /** POST /guests/:id/delete */
    async destroy(req, res) {
      const removed = await guestsService.remove(parseGuestId(req.params.id), req.user);
      req.flash('success', `Se eliminó a ${removed.firstName} ${removed.lastName}.`);
      res.redirect(303, '/guests');
    },
  };
}
