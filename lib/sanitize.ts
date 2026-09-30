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

/** `$20^\circ$`-style degree markup pasted from chat/LLM text → `20°`. */
function degrees(text: string) {
  return text.replace(/\$([^$\n]{1,40}?)\$/g, (whole, inner: string) =>
    inner.includes("\\circ")
      ? inner.replace(/\s*\^?\s*\\circ/g, "°").replace(/\s+/g, " ")
      : whole,
  )
}

/** Inline markup on already-escaped text: `code`, **bold**, links, bare URLs. */
function inlineMarkup(escaped: string) {
  return degrees(escaped)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g,
      (
        _m,
        label: string | undefined,
        href: string | undefined,
        bare: string | undefined,
      ) => {
        if (href) return `<a href="${href}">${label}</a>`
        const url = (bare as string).replace(/[.,;:!?)]+$/, "")
        const tail = (bare as string).slice(url.length)
        return `<a href="${url}">${url}</a>${tail}`
      },
    )
}

/**
 * Plain-text / Markdown-ish body → the rich-text subset. Imported GitHub and
 * ClickUp issues arrive as Markdown, widget reports as plain text; both get
 * headings, numbered and bulleted lists, fenced code, links and paragraphs
 * instead of one flat run of <br>-joined lines.
 */
function plainToHtml(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n")
  const out: string[] = []
  let paragraph: string[] = []
  let list: { tag: "ol" | "ul"; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(
        `<p>${paragraph.map((l) => inlineMarkup(escapeHtml(l))).join("<br>")}</p>`,
      )
    }
    paragraph = []
  }
  const flushList = () => {
    if (list) {
      out.push(
        `<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`,
      )
    }
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flushParagraph()
      flushList()
      const code: string[] = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++)
        code.push(lines[i])
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      out.push(`<h2>${inlineMarkup(escapeHtml(heading[1]))}</h2>`)
      continue
    }
    const item = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*\S.*)$/.exec(line)
    if (item) {
      flushParagraph()
      const tag = item[2] ? "ol" : "ul"
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push(inlineMarkup(escapeHtml(item[3])))
      continue
    }
    // A bare "2." (the text after it was lost) is noise — drop it.
    if (/^\s*\d+[.)]\s*$/.test(line)) continue
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return out.join("")
}

/** Strict rich-text subset shared by API writes and UI rendering. */
export function sanitizeRichText(value: string) {
  if (!value) return ""
  const html = /<\/?[a-z][\s\S]*>/i.test(value) ? value : plainToHtml(value)
  return sanitizeHtml(html, RICH_TEXT_OPTIONS)
}
