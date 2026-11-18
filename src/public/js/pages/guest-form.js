/**
 * Formulario de huésped: adapta el campo del número al tipo de documento y muestra cuántos
 * caracteres quedan en las notas. La validación la hace src/public/js/forms.js.
 */
const form = document.querySelector('[data-guest-form]');

if (form) {
  const type = form.elements.namedItem('documentType');
  const number = form.elements.namedItem('documentNumber');

  const adaptDocumentField = () => {
    const isCedula = type.value === 'cedula';
    number.inputMode = isCedula ? 'numeric' : 'text';
    number.maxLength = isCedula ? 10 : 20;
    number.placeholder = isCedula ? 'Ej.: 1710034065' : 'Ej.: AB1234567';
    number.autocapitalize = isCedula ? 'off' : 'characters';
  };
  type.addEventListener('change', adaptDocumentField);
  adaptDocumentField();

  for (const field of form.querySelectorAll('[data-counter]')) {
    const counter = document.createElement('p');
    counter.className = 'field__counter';
    // Solo visual: el límite ya se anuncia en la ayuda del campo y maxlength impide pasarlo.
    counter.setAttribute('aria-hidden', 'true');
    const update = () => {
      const left = field.maxLength - field.value.length;
      counter.textContent = `${left} ${left === 1 ? 'carácter disponible' : 'caracteres disponibles'}`;
      counter.classList.toggle('is-low', left <= 20);
    };
    field.addEventListener('input', update);
    field.after(counter);
    update();
  }
}
