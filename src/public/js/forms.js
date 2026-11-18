/**
 * Validación en el navegador para los formularios con `[data-validate]`.
 *
 * - Sin JavaScript, el navegador ya valida con los atributos HTML (required, maxlength, pattern…).
 * - Con JavaScript, este módulo reemplaza los globos del navegador por mensajes claros en español
 *   junto a cada campo, y agrega reglas que el HTML no puede expresar (dígito verificador de la
 *   cédula, coincidencia de contraseñas…) usando las MISMAS funciones que el servidor.
 * - El servidor vuelve a validar todo: esto solo ahorra un viaje y orienta a la persona.
 */
import {
  isValidCedula,
  isValidPassport,
  normalizeDocument,
  normalizePhone,
  passwordProblem,
} from './lib/validators.js';

const FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea';

/** Mensaje según el problema que detectó la validación nativa del navegador. */
function nativeMessage(field) {
  const { validity, dataset } = field;
  if (validity.valueMissing) return dataset.msgRequired ?? 'Este campo es obligatorio.';
  if (validity.typeMismatch) {
    return field.type === 'email'
      ? 'Escribe un correo válido, por ejemplo ana@hotel.com.'
      : 'El formato no es válido.';
  }
  if (validity.tooShort) {
    return `Debe tener al menos ${field.minLength} caracteres (ahora tiene ${field.value.length}).`;
  }
  if (validity.tooLong) return `Debe tener como máximo ${field.maxLength} caracteres.`;
  if (validity.patternMismatch) return dataset.msgPattern ?? 'El formato no es válido.';
  if (validity.rangeUnderflow) return dataset.msgMin ?? `El valor mínimo es ${field.min}.`;
  if (validity.rangeOverflow) return dataset.msgMax ?? `El valor máximo es ${field.max}.`;
  if (validity.badInput) return 'Escribe un valor válido.';
  return field.validationMessage;
}

/** Reglas propias (`data-validate-*`). Devuelven el problema o una cadena vacía. */
function customProblem(field, form) {
  const { value, dataset } = field;
  if (!value) return '';

  if (dataset.validateWords && value.trim().split(/\s+/).length < Number(dataset.validateWords)) {
    return 'Escribe tu nombre y tu apellido.';
  }
  if ('validatePassword' in dataset) return passwordProblem(value) ?? '';
  if (dataset.validateMatch) {
    const other = form.elements.namedItem(dataset.validateMatch);
    if (other && other.value !== value) return 'Las contraseñas no coinciden.';
  }
  if ('validatePhone' in dataset && !normalizePhone(value)) {
    return 'Escribe un teléfono válido, por ejemplo 0991234567 o +593 99 123 4567.';
  }
  if (dataset.validateDocument) {
    const type = form.elements.namedItem(dataset.validateDocument)?.value;
    const documentNumber = normalizeDocument(value);
    if (type === 'cedula') {
      if (!/^\d{10}$/.test(documentNumber)) return 'La cédula tiene 10 dígitos, sin guiones.';
      if (!isValidCedula(documentNumber)) return 'La cédula no es válida: revisa los dígitos.';
    }
    if (type === 'passport' && !isValidPassport(documentNumber)) {
      return 'El pasaporte debe tener de 5 a 20 letras o números.';
    }
  }
  return '';
}

function showError(field, message) {
  const container = field.closest('.field');
  const output = container?.querySelector('[data-field-error]');
  container?.classList.toggle('field--invalid', Boolean(message));
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  if (output) {
    output.textContent = message;
    output.hidden = !message;
  }
}

/** Valida un campo, muestra u oculta su mensaje y devuelve si es válido. */
export function validateField(field, form = field.form) {
  field.setCustomValidity('');
  if (field.validity.valid) {
    const problem = customProblem(field, form);
    if (problem) field.setCustomValidity(problem);
  }
  const message = field.validity.valid ? '' : nativeMessage(field);
  showError(field, message);
  return !message;
}

/** Campos que dependen de otro: la confirmación depende de la contraseña, el número del tipo. */
function revalidateDependents(form, changed) {
  if (!changed.name) return;
  const selector = `[data-validate-match="${changed.name}"], [data-validate-document="${changed.name}"]`;
  for (const dependent of form.querySelectorAll(selector)) {
    if (dependent.value) validateField(dependent, form);
  }
}

function enhance(form) {
  // Desde aquí mostramos nuestros propios mensajes en lugar de los globos del navegador.
  form.noValidate = true;

  form.addEventListener('focusout', (event) => {
    const field = event.target;
    if (!(field instanceof Element) || !field.matches(FIELD_SELECTOR)) return;
    // Al salir de un campo vacío que aún no tocaste no se muestra nada: sería regañar antes de tiempo.
    if (field.value || field.closest('.field--invalid')) {
      field.dataset.touched = 'true';
      validateField(field, form);
    }
  });

  const onEdit = (event) => {
    const field = event.target;
    if (!(field instanceof Element) || !field.matches(FIELD_SELECTOR)) return;
    if (field.dataset.touched || field.closest('.field--invalid')) validateField(field, form);
    revalidateDependents(form, field);
  };
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);

  form.addEventListener('submit', (event) => {
    const fields = [...form.querySelectorAll(FIELD_SELECTOR)].filter((field) => !field.disabled);
    const invalid = fields.filter((field) => !validateField(field, form));
    if (invalid.length === 0) return;
    event.preventDefault();
    // Que ningún otro manejador (por ejemplo, el envío por fetch) procese un formulario inválido.
    event.stopImmediatePropagation();
    invalid[0].focus();
  });
}

for (const form of document.querySelectorAll('form[data-validate]')) enhance(form);
