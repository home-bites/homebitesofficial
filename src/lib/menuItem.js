/**
 * One definition of what a menu item is.
 *
 * The website had two independent parsers: `SignatureDishes` grew its own
 * when the rich fields arrived, and `useMenu` kept an older one. The same
 * dish was therefore orderable on one page and sold out on another, hidden in
 * one place and listed in the other, and only one of the two ever saw the
 * ingredients, allergens and add-ons an admin had entered. Two parsers over
 * one collection is not duplication you can leave alone — it is two different
 * answers to "what is on the menu".
 *
 * Everything that reads `menuItems` now goes through `normalizeMenuItem`.
 *
 * ## Missing is not empty
 *
 * A field the admin has never set and a field the admin has deliberately
 * cleared are different facts, and this layer keeps them apart:
 *
 *   absent            →  null
 *   present but empty →  [] or ''
 *
 * That matters because the alternative is fabrication. A dish with no
 * recorded calories must not read as zero calories; a dish with no allergen
 * list must not read as "no allergens", which is the one a customer could be
 * harmed by believing. `DishDetail` hides a section for either shape, so the
 * distinction costs the UI nothing and keeps the data honest for anything
 * that looks closer.
 *
 * ## Add-ons are passed through untouched
 *
 * Each add-on object is preserved exactly as stored. The website only reads
 * `name` and `price`, but the schema may carry an id, an availability flag, a
 * sort order or fields added later, and a parser that rebuilds objects from
 * the keys it happens to know about is how those get quietly dropped.
 */

/** A finite number, or null. Never 0 as a stand-in for "not set". */
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Absent → null. Present → the array (possibly empty). */
function arrOrNull(v) {
  return Array.isArray(v) ? v : null;
}

/** Absent → null. Present → the trimmed string (possibly ''). */
function strOrNull(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim();
}

/**
 * The effective price, mirroring `MenuItemModel` in the Flutter app tier for
 * tier: offerPrice, then discountAmount, then discountPercentage. A website
 * that prices a discounted dish differently from the app is a support call,
 * not a rounding difference.
 */
export function effectivePrice(d) {
  const base = Number(d.price) || 0;
  const offer = Number(d.offerPrice) || 0;
  const dAmt = Number(d.discountAmount) || 0;
  const dPct = Number(d.discountPercentage) || 0;
  if (offer > 0 && offer < base) return offer;
  if (dAmt > 0 && dAmt < base) return base - dAmt;
  if (dPct > 0 && dPct < 100) return base - (base * (dPct / 100));
  return base;
}

/** A dish an admin has deleted or hidden must not be listed or ordered. */
export function isListable(d) {
  return d.isDeleted !== true && d.isHidden !== true;
}

/**
 * Normalise one Firestore `menuItems` document.
 *
 * @param {string} id   the document id
 * @param {object} data the raw document
 * @param {Map|object} categoryNames  id → display name, for the label only
 */
export function normalizeMenuItem(id, data, categoryNames) {
  const d = data || {};
  const lookup = (key) => {
    if (!categoryNames) return '';
    const k = String(key || '');
    if (categoryNames instanceof Map) {
      return categoryNames.get(k) || categoryNames.get(k.trim().toLowerCase()) || '';
    }
    return categoryNames[k] || categoryNames[k.trim().toLowerCase()] || '';
  };

  const base = Number(d.price) || 0;
  const price = effectivePrice(d);
  const categoryId = String(d.categoryId || '');
  // The real category name, or '' when the dish has none. Kept separate from
  // the display label so a filter cannot match a dish on the fallback word
  // and invent a category nobody created.
  const categoryName = String(d.categoryName || lookup(categoryId) || '').trim();

  const available = d.isAvailable !== false
    && d.outOfStock !== true
    && d.isActive !== false;

  return {
    id,
    name: String(d.name || 'Dish'),
    description: String(d.description || ''),

    price: +price.toFixed(2),
    originalPrice: base,
    hasDiscount: price < base,

    categoryId,
    categoryName,
    // Display label only — never used for matching.
    categoryLabel: categoryName || 'Signature',

    // '' rather than a guess. An unclassified dish shows no veg/non-veg mark
    // at all; defaulting it to Veg would be a claim about the food.
    foodType: String(d.foodType || d.type || '').trim()
      || (d.isEgg === true ? 'Egg' : '')
      || (d.isVeg === true ? 'Veg' : '')
      || (d.isVeg === false ? 'Non-Veg' : ''),

    available,
    hidden: d.isHidden === true,
    deleted: d.isDeleted === true,

    // Images exactly as stored. No placeholder, no stock photograph, no
    // substitution — a dish with no picture is a dish with no picture.
    imageUrl: String(d.imageUrl || d.image || '').trim(),
    thumbnail: String(d.thumbnail || '').trim(),
    gallery: arrOrNull(d.gallery)?.filter(Boolean) ?? null,
    /** Best single image for a card. '' when there is none. */
    image: String(d.imageUrl || d.image || d.thumbnail || d.photo || '').trim(),

    tags: arrOrNull(d.tags),
    badges: arrOrNull(d.badges),
    ingredients: arrOrNull(d.ingredients),
    allergens: arrOrNull(d.allergens),

    // Verbatim. See the note above on why nothing is rebuilt here.
    addons: arrOrNull(d.addons),

    calories: numOrNull(d.nutrition?.calories),
    /** The whole nutrition object, for anything that grows more fields. */
    nutrition: d.nutrition && typeof d.nutrition === 'object' ? d.nutrition : null,

    cookingTime: strOrNull(d.cookingTime),
    spiceLevel: strOrNull(d.spiceLevel),
    prepTime: numOrNull(d.preparationTime),
    displayOrder: numOrNull(d.displayOrder),

    rating: numOrNull(d.rating) ?? 0,
    recommended: d.isRecommended === true,

    /** Compatibility alias — `useMenu`'s existing consumers read this name. */
    isAvailable: available,
  };
}

/**
 * Deterministic menu ordering.
 *
 * `displayOrder` ascending is what the admin sets and expects to see. Items
 * without a usable one sort after those that have one, rather than being
 * treated as order 0 and jumping to the front of a list the admin curated.
 *
 * Ties — including the common case of everything left at the default — break
 * on name and then on id. That last step is what makes this deterministic:
 * two dishes with the same order and the same name would otherwise swap
 * places between loads, because Firestore's snapshot order is not a
 * guarantee. Nothing here writes back to Firestore.
 */
export function compareMenuItems(a, b) {
  const ao = Number.isFinite(a.displayOrder) ? a.displayOrder : null;
  const bo = Number.isFinite(b.displayOrder) ? b.displayOrder : null;
  if (ao !== bo) {
    if (ao === null) return 1;
    if (bo === null) return -1;
    if (ao !== bo) return ao - bo;
  }
  const an = String(a.name || '').toLowerCase();
  const bn = String(b.name || '').toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}

/** Sorts a copy — callers hold React state and must not have it mutated. */
export function sortMenuItems(items) {
  return [...items].sort(compareMenuItems);
}

/** The same ordering rule for categories and banners, which share the field. */
export function compareByDisplayOrder(a, b) {
  const ao = numOrNull(a.displayOrder);
  const bo = numOrNull(b.displayOrder);
  if (ao !== bo) {
    if (ao === null) return 1;
    if (bo === null) return -1;
    return ao - bo;
  }
  const an = String(a.name || a.title || '').toLowerCase();
  const bn = String(b.name || b.title || '').toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}

export function sortByDisplayOrder(list) {
  return [...list].sort(compareByDisplayOrder);
}
