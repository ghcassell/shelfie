import { parseExpiryDates } from './dateParser';
import { gtinFromScan, isShopCode } from './off';
import { aliasKey, guessUnit, linesFromAi, matchProduct, parseReceipt, rowsFromOcr, rowsFromText } from './receipt';

const TODAY = '2026-11-14';

// Label corpus: [OCR text, expected date, expected Date kind, expected warning].
// PLACEHOLDER strings written in the style of UK packs. Replace/extend with real label
// strings as the household collects them (SPEC section 9).
const LABELS: [string, string | null, string | null, string | null][] = [
  ['USE BY 18/11/2026', '2026-11-18', 'use_by', null],
  ['USE BY\n18 NOV', '2026-11-18', 'use_by', null],
  ['Use by: 03.12.26', '2026-12-03', 'use_by', null],
  ['BEST BEFORE 25 DEC 2026', '2026-12-25', 'best_before', null],
  ['BEST BEFORE END: MAR 2028', '2028-03-31', 'best_before', null],
  ['BEST BEFORE END FEB 2028', '2028-02-29', 'best_before', null],
  ['BBE 06/2027', '2027-06-30', 'best_before', null],
  ['BB 12/27', '2027-12-31', 'best_before', null], // 27 is not a month, so MM/YY
  ['BB 10/11', '2026-11-10', 'best_before', 'past'], // day-first always: 10 Nov (4 days ago, flagged), never 11 Oct
  ['BEST BEFORE: 14-01-27 L2291B 09:41', '2027-01-14', 'best_before', null],
  ['Best before 1st January 2027', '2027-01-01', 'best_before', null],
  ['EXP 2027-03-15', '2027-03-15', null, null],
  ['04/05/27', '2027-05-04', null, null], // 4 May, never 5 April
  ['PACKED 01/11/26 USE BY 20/11/26', '2026-11-20', 'use_by', null],
  ['01/11/26\n20/11/26', '2026-11-20', null, null], // no keyword: the later date
  ['DISPLAY UNTIL 16 NOV USE BY 18 NOV', '2026-11-18', 'use_by', null],
  ['USE BY 10/11/2026', '2026-11-10', 'use_by', 'past'],
  ['BEST BEFORE 01/01/2040', '2040-01-01', 'best_before', 'far'],
  ['SEPT 27', '2027-09-30', null, null],
  ['USE BY 2O/l1/26', '2026-11-20', 'use_by', null], // OCR read 0 as O and 1 as l
  ['BBE 181127', '2027-11-18', 'best_before', null], // no separators
  ['L 031125 20/11/26', '2026-11-20', null, null], // lot code that looks like a past date is ignored
  ['Best before end NOU 2026 4310 20:33', '2026-11-30', 'best_before', null], // real pack: V read as U
  ['BBE 0CT 2027', '2027-10-31', 'best_before', null],
  ['Best before see () P.08. 06.\nE.08 08\n2026 UAD 202', '2026-08-08', 'best_before', 'past'], // real pack: date split over lines
  ['USE BY 31/02/2027', null, null, null], // not a real date
  ['Suitable for vegetarians 400g', null, null, null],
];

describe('UK expiry date parser', () => {
  test.each(LABELS)('%j', (text, date, kind, warning) => {
    const r = parseExpiryDates(text, TODAY)[0];
    if (date === null) return expect(r).toBeUndefined();
    expect(r).toEqual({ date, kind, warning });
  });
  test.each([
    ['BEST BEFORE 20/11/26 L 251226', ['2026-11-20', '2026-12-25']], // a code that could be a date is offered second
    ['DISPLAY UNTIL 16 NOV USE BY 18 NOV', ['2026-11-18', '2026-11-16']],
    ['PACKED 20/11/26 25/11/26', ['2026-11-25', '2026-11-20']],
    ['BB 10/11', ['2026-11-10']], // Oct 2011 is not worth offering
  ])('options for %j', (text, dates) => {
    expect(parseExpiryDates(text, TODAY).map((d) => d.date)).toEqual(dates);
  });
  test('a day and month long past rolls to next year', () => {
    expect(parseExpiryDates('BB 02 JAN', TODAY)[0]).toEqual({ date: '2027-01-02', kind: 'best_before', warning: null });
  });
});

describe('product number from a scan', () => {
  test.each([
    ['4006381333931', '4006381333931'], // EAN-13
    ['96385074', '96385074'], // EAN-8
    ['036000291452', '0036000291452'], // UPC-A: same product as its EAN-13 form
    ['https://id.gs1.org/01/04006381333931/10/ABC?17=270101', '4006381333931'], // GS1 QR link
    ['(01)04006381333931(17)270101', '4006381333931'], // GS1 DataMatrix
    ['010400638133393117270101', '4006381333931'],
    ['4006381333932', null], // check digit wrong
    ['https://example.com/win-a-holiday', null], // marketing QR
  ])('%j', (raw, gtin) => expect(gtinFromScan(raw)).toBe(gtin));
  test('shop codes', () => {
    expect(['2012345678901', '0212345678901', '20123456', '00123456'].map(isShopCode)).toEqual([true, true, true, true]);
    expect(['4006381333931', '5000112637922', '96385074'].map(isShopCode)).toEqual([false, false, false]);
  });
});

// Receipt corpus: PLACEHOLDER rows in the style of UK till receipts; replace with the ~10 real
// receipts from the household's usual shops (SPEC section 9).
describe('receipt parser', () => {
  test('items, quantities, ignore list', () => {
    const lines = parseReceipt([
      'TESCO Stores Ltd',
      'CHKN BRST 400G        £3.75',
      'HEINZ BEANZ 415G       1.40',
      '2 x £0.70',
      'BANANAS LOOSE          0.87',
      '0.456 kg @ £1.90/kg',
      'CARRIER BAG            0.30',
      'CC PRICE CUT          -0.50',
      'SUBTOTAL              6.02',
      'TOTAL                 £6.02',
      'VISA DEBIT             6.02',
      'CLUBCARD POINTS 6',
    ]);
    expect(lines.map((l) => [l.name, l.quantity, l.pricePence, l.ticked])).toEqual([
      ['CHKN BRST 400G', 1, 375, true],
      ['HEINZ BEANZ 415G', 2, 140, true],
      ['BANANAS LOOSE', 1, 87, true],
      ['CARRIER BAG', 1, 30, false],
      ['CC PRICE CUT', 1, 50, false],
      ['SUBTOTAL', 1, 602, false],
      ['TOTAL', 1, 602, false],
      ['VISA DEBIT', 1, 602, false],
    ]);
  });
  test('user ignore phrases match whole words', () => {
    const lines = parseReceipt(['MEAL DEAL SAVER 3.50', 'RUMP STEAK 4.00', 'PG TEA 80S 2.00'], ['MEAL DEAL', 'TEA']);
    expect(lines.map((l) => l.ticked)).toEqual([false, true, false]);
    expect(parseReceipt(['PRICE REDUCTION 0.50'])[0].ticked).toBe(false); // built in
  });
  test('trailing VAT letters and leading SKU codes', () => {
    expect(parseReceipt(['0123456 SS MILK 2L 1.65 A']).map((l) => [l.name, l.pricePence])).toEqual([['SS MILK 2L', 165]]);
  });
  test('OCR lines are rejoined into rows by position', () => {
    expect(rowsFromOcr([
      { text: '1.40', x: 300, y: 52, height: 20 },
      { text: 'CHKN BRST', x: 10, y: 20, height: 20 },
      { text: 'BEANS', x: 10, y: 50, height: 20 },
      { text: '3.75', x: 300, y: 22, height: 20 },
    ])).toEqual(['CHKN BRST 3.75', 'BEANS 1.40']);
  });
  test('pasted email text: one-line rows and one-cell-per-line tables', () => {
    const text = 'Your order\r\n\r\nSemi Skimmed Milk 2L\t£1.65\nHeinz Beanz 415g\n2\n£2.80\nBananas\nQty: 1\n£0.87\nTotal\n£5.32\n';
    expect(parseReceipt(rowsFromText(text)).map((l) => [l.name, l.quantity, l.pricePence, l.ticked])).toEqual([
      ['Semi Skimmed Milk 2L', 1, 165, true],
      ['Heinz Beanz 415g', 2, 280, true],
      ['Bananas', 1, 87, true],
      ['Total', 1, 532, false],
    ]);
  });
  test('AI lines are validated', () => {
    expect(linesFromAi({ items: [{ name: 'Milk', quantity: 2, price: 1.65, category: ' Dairy ' }, { name: '' }, { name: 'Total', price: 9 }, { name: 'Eggs' }] })).toEqual([
      { name: 'Milk', quantity: 2, pricePence: 165, ticked: true, category: 'Dairy' },
      { name: 'Total', quantity: 1, pricePence: 900, ticked: false },
      { name: 'Eggs', quantity: 1, pricePence: null, ticked: true },
    ]);
    expect(() => linesFromAi({ nope: 1 })).toThrow();
  });
});

describe('receipt matching', () => {
  const products = [
    { id: 'chicken', name: 'Chicken breast fillets', brand: 'Tesco' },
    { id: 'beans', name: 'Baked beans', brand: 'Heinz' },
    { id: 'milk', name: 'Semi-skimmed milk', brand: null },
  ];
  test('fuzzy-matches abbreviations against own Products', () => {
    expect(matchProduct('CHKN BRST 400G', products, [])).toBe('chicken');
    expect(matchProduct('HEINZ BEANS 415G', products, [])).toBe('beans');
    expect(matchProduct('KITCHEN FOIL', products, [])).toBeNull();
  });
  test('a remembered Receipt alias wins', () => {
    const aliases = [{ alias: aliasKey('ss milk 2l'), productId: 'milk' }];
    expect(matchProduct('SS MILK 2L', products, aliases)).toBe('milk');
    expect(matchProduct('SS MILK 2L', products, [])).toBeNull();
  });
  test('alias to a Product that no longer exists is ignored', () => {
    expect(matchProduct('SS MILK 2L', products, [{ alias: 'SS MILK 2L', productId: 'gone' }])).toBeNull();
  });
  test('Base unit guessed from a size in the name, else count', () => {
    expect(guessUnit('CHKN BRST 400G')).toEqual({ baseUnit: 'g', packAmount: 400, size: '400G' });
    expect(guessUnit('SS MILK 2L')).toEqual({ baseUnit: 'ml', packAmount: 2000, size: '2L' });
    expect(guessUnit('Rice 1.5 kg')).toMatchObject({ baseUnit: 'g', packAmount: 1500 });
    expect(guessUnit('Wine 75cl')).toMatchObject({ baseUnit: 'ml', packAmount: 750 });
    expect(guessUnit('EGGS LARGE X6')).toEqual({ baseUnit: 'count', packAmount: 1, size: null });
  });
});
