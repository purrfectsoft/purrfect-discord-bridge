const EMAIL_REGEX = /([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
const PHONE_REGEX = /\b(?:\+?\d[\s-]?){7,15}\b/g; // naive, but works
const LONG_NUMBER_REGEX = /\b\d{16,}\b/g; // likely cards or IDs


export function redact(text) {
if (process.env.REDACT_PII !== "true") return text;
return text
.replace(EMAIL_REGEX, "[redacted-email]")
.replace(PHONE_REGEX, "[redacted-phone]")
.replace(LONG_NUMBER_REGEX, "[redacted-number]");
}


export function shouldSkip(text) {
const kw = (process.env.OPT_OUT_KEYWORD || "#noai").toLowerCase();
return text.toLowerCase().includes(kw);
}
