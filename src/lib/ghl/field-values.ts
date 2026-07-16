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
  return ghlDateValueToIso(findFieldRawValue(customFields, fieldId));
}

// Pulls one custom field's string value out of a GHL customFields array.
export function findFieldString(
  customFields: unknown,
  fieldId: string,
): string | null {
  const value = findFieldRawValue(customFields, fieldId);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Pulls one custom field's numeric value out of a GHL customFields array.
// NUMERICAL fields usually arrive as numbers but occasionally as strings.
export function findFieldNumber(
  customFields: unknown,
  fieldId: string,
): number | null {
  const value = findFieldRawValue(customFields, fieldId);

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function findFieldRawValue(customFields: unknown, fieldId: string): unknown {
  if (!Array.isArray(customFields)) return undefined;

  for (const field of customFields) {
    if (!field || typeof field !== "object") continue;
    const record = field as Record<string, unknown>;
    if (record.id !== fieldId) continue;
    return record.fieldValueDate ?? record.fieldValueString ?? record.fieldValue;
  }

  return undefined;
}
