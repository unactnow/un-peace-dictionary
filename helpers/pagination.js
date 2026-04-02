/**
 * Return pagination metadata for use in templates.
 * Apply LIMIT/OFFSET to your query separately.
 */
function getPagination(page, perPage, total) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    page,
    perPage,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

module.exports = { getPagination };
