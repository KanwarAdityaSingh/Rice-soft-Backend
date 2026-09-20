-- 216 copied invoice/product display fields onto existing credit note lines.
-- Aliases are per-note edits only; clear that one-time copy.
-- Preview still falls back to invoice alias / product master when these are null.

UPDATE credit_note_lines
SET product_alias = NULL,
    brand = NULL,
    hsn_code = NULL;
