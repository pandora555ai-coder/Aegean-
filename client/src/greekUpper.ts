// Task 181 - CSS text-transform:uppercase does not drop the Greek tonos
// (accent): "παλαίστρα" renders as "ΠΑΛΑΊΣΤΡΑ", not the correct
// "ΠΑΛΑΙΣΤΡΑ" - Greek typographic convention drops the tonos entirely in
// capitals. NFD-decompose (splits an accented letter into base + combining
// mark), strip the combining marks (Unicode's Combining Diacritical Marks
// block), then uppercase - rather than relying on the browser's own
// uppercase mapping, which is what produced the bug.
const COMBINING_MARKS = new RegExp('[̀-ͯ]', 'g');

export function greekUpper(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .normalize('NFC')
    .toUpperCase();
}
