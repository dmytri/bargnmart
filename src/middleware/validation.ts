const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 500;

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidOptionalUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  return isValidUrl(url);
}

export function isValidText(
  text: string,
  maxLength: number = MAX_TEXT_LENGTH
): boolean {
  if (typeof text !== "string") return false;
  if (text.length > maxLength) return false;
  try {
    new TextEncoder().encode(text);
    return true;
  } catch {
    return false;
  }
}

export function isValidTitle(title: string): boolean {
  return isValidText(title, MAX_TITLE_LENGTH);
}

export function isValidJsonArray(json: string | undefined | null): boolean {
  if (!json) return true;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function isValidJsonObject(json: string | undefined | null): boolean {
  if (!json) return true;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateProductInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.external_id || typeof body.external_id !== "string") {
    errors.push({ field: "external_id", message: "external_id is required" });
  }

  if (!body.title || !isValidTitle(body.title as string)) {
    errors.push({ field: "title", message: "title is required and must be <= 500 chars" });
  }

  if (body.description && !isValidText(body.description as string)) {
    errors.push({ field: "description", message: "description must be <= 10000 chars" });
  }

  if (body.image_url && !isValidOptionalUrl(body.image_url as string)) {
    errors.push({ field: "image_url", message: "image_url must be https://" });
  }

  if (body.product_url && !isValidOptionalUrl(body.product_url as string)) {
    errors.push({ field: "product_url", message: "product_url must be https://" });
  }

  if (body.tags && !isValidJsonArray(body.tags as string)) {
    errors.push({ field: "tags", message: "tags must be a valid JSON array" });
  }

  if (body.metadata && !isValidJsonObject(body.metadata as string)) {
    errors.push({ field: "metadata", message: "metadata must be a valid JSON object" });
  }

  return errors;
}

export function validateRequestInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.text || !isValidText(body.text as string)) {
    errors.push({ field: "text", message: "text is required and must be <= 10000 chars" });
  }

  if (body.tags && !isValidJsonArray(body.tags as string)) {
    errors.push({ field: "tags", message: "tags must be a valid JSON array" });
  }

  return errors;
}

export function validatePitchInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.request_id || !isValidUUID(body.request_id as string)) {
    errors.push({ field: "request_id", message: "valid request_id UUID is required" });
  }

  if (!body.pitch_text || !isValidText(body.pitch_text as string)) {
    errors.push({ field: "pitch_text", message: "pitch_text is required and must be <= 10000 chars" });
  }

  if (body.product_id && !isValidUUID(body.product_id as string)) {
    errors.push({ field: "product_id", message: "product_id must be a valid UUID" });
  }

  return errors;
}
