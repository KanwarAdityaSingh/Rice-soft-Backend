/**
 * Cheap gibberish checks for credit-note `reason` (all types).
 * Not an LLM: length, words, letters, repeated chars, keyboard smash.
 */
const MIN_CHARS = 6;
const MIN_WORDS = 2;

const SMASH =
  /\b(asdf+|qwer+|zxcv+|qwerty|asdfghjkl|zxcvbnm|lorem|ipsum|test123|xxxxxx+|zzzzzz+)\b/i;

export function creditNoteReasonProblem(reason: string): string | null {
  const text = reason.trim().replace(/\s+/g, ' ');
  if (!text) return 'Reason is required';
  if (text.length < MIN_CHARS) {
    return `Reason must be at least ${MIN_CHARS} characters`;
  }
  const words = text.split(' ').filter(Boolean);
  if (words.length < MIN_WORDS) {
    return `Reason must contain at least ${MIN_WORDS} words`;
  }
  if (!/\p{L}/u.test(text)) {
    return 'Reason must include letters';
  }
  if (/(.)\1{5,}/u.test(text)) {
    return 'Provide a real business reason, not placeholder text';
  }
  const compact = text.replace(/\s+/g, '');
  if (SMASH.test(text) || SMASH.test(compact)) {
    return 'Provide a real business reason, not placeholder text';
  }
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length >= 8) {
    const unique = new Set(letters.map((ch) => ch.toLowerCase())).size;
    if (unique / letters.length < 0.35) {
      return 'Provide a real business reason, not placeholder text';
    }
  }
  return null;
}
