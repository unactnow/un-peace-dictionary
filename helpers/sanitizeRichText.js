const sanitizeHtml = require('sanitize-html');

const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'br', 'iframe'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'youtube.com'],
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const out = { ...attribs };
      if (/^https?:\/\//i.test(href)) {
        out.target = '_blank';
        out.rel = 'noopener noreferrer';
      }
      return { tagName: 'a', attribs: out };
    },
  },
};

function sanitizeRichText(input) {
  if (input == null || input === '') return '';
  return sanitizeHtml(String(input), SANITIZE_OPTIONS);
}

module.exports = { sanitizeRichText };
