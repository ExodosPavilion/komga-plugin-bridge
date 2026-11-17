// The logic of the settings form, free of the DOM so seam 2 can test it. The form itself is
// sections/30-settings.js. `fields` is what GET /api/plugin-settings returns; `inputs` maps a
// field name to what the admin entered: { text } for string and number, { checked } for boolean,
// and for a secret { text, clear }.

/**
 * The values to send for the fields the admin changed, and any problems found before sending.
 * A blank string or number goes back to the manifest default (null). A blank secret is left alone,
 * so saving the form never wipes a saved secret (tick "clear" for that) and never needs its value.
 */
export function buildValues(fields, inputs) {
  const values = {};
  const errors = [];
  for (const field of fields) {
    const input = inputs[field.name] ?? {};
    const text = input.text ?? "";
    if (field.secret) {
      if (input.clear) values[field.name] = null;
      else if (text !== "") values[field.name] = field.type === "number" ? toNumber(field, text, errors) : text;
    } else if (field.type === "boolean") {
      if ((input.checked === true) !== (field.value === true)) values[field.name] = input.checked === true;
    } else if (text.trim() === "") {
      if (field.isSet) values[field.name] = null;
    } else if (field.type === "number") {
      const n = toNumber(field, text, errors);
      if (n !== field.value) values[field.name] = n;
    } else if (text !== field.value) {
      values[field.name] = text;
    }
  }
  return { values, errors };
}

function toNumber(field, text, errors) {
  const n = Number(String(text).trim());
  if (!Number.isFinite(n)) errors.push(`Setting "${field.name}" must be a number.`);
  return n;
}

/** The text to show for a failed save: the host's validation messages, as sent. */
export function errorMessages(response) {
  if (Array.isArray(response?.errors) && response.errors.length > 0) return response.errors.map(String);
  return [response?.error ?? "The settings could not be saved."];
}

/** What to show next to a secret. Its value is never sent to the page, only whether it is set. */
export function secretHint(field) {
  return field.isSet ? "Saved. Leave blank to keep it." : "Not set.";
}
