/**
 * Normalizes list fields from multipart/form-data (multer) where every value is a string.
 * Matches JSON bodies when the client sends a real array, and the frontend guide pattern
 * `formData.append('whatsappNumbers', JSON.stringify(['...']))`.
 */
export function parseStringArrayFromBody(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    const out = value
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((s) => s.length > 0);
    return out.length > 0 ? out : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const out = parsed
            .map((v) => (v == null ? '' : String(v).trim()))
            .filter((s) => s.length > 0);
          return out.length > 0 ? out : null;
        }
      } catch {
        return null;
      }
      return null;
    }
    return [trimmed];
  }

  return null;
}
