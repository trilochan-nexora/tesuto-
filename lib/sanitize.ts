import sanitizeHtml from "sanitize-html"

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "div",
    "h2",
    "strong",
    "b",
    "em",
    "i",
    "s",
    "strike",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "br",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
  },
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Strict rich-text subset shared by API writes and UI rendering. */
export function sanitizeRichText(value: string) {
  if (!value) return ""
  const html = /<\/?[a-z][\s\S]*>/i.test(value)
    ? value
    : value
        .split(/\n{2,}/)
        .map((paragraph) =>
          `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
        )
        .join("")
  return sanitizeHtml(html, RICH_TEXT_OPTIONS)
}
