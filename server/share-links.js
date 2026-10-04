const arabicLetters = {
  'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ء': '', 'ؤ': 'w', 'ئ': 'y', 'ب': 'b',
  'ة': 'h', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd',
  'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ى': 'a', 'ي': 'y'
};

export function shareSlug(value, fallback = 'share') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[ء-ي]/g, character => arabicLetters[character] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || fallback;
}
