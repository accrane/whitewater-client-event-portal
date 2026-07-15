// Normalizing GHL custom-field values. Kept free of runtime imports so tests
// can exercise the conversions directly.

// GHL date fields arrive as epoch milliseconds at UTC midnight
// (`fieldValueDate`), occasionally as ISO strings. Returns yyyy-MM-dd or null.
export function ghlDateValueToIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  return null;
}

// Pulls one custom field's date value out of a GHL customFields array.
export function findDateOfInterest(
  customFields: unknown,
  fieldId: string,
): string | null {
  if (!Array.isArray(customFields)) return null;

  for (const field of customFields) {
    if (!field || typeof field !== "object") continue;
    const record = field as Record<string, unknown>;
    if (record.id !== fieldId) continue;
    return ghlDateValueToIso(
      record.fieldValueDate ?? record.fieldValueString ?? record.fieldValue,
    );
  }

  return null;
}
