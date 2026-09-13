import { describe, expect, it } from "vitest";
import { estimateTotalCents, formatMoney, splitInstallments } from "./quote.js";

// Тести-специфікація: описують, що модуль МАЄ робити (гроші — цілі центи,
// жодна операція їх не губить і не створює), а не те, що він робить зараз.
// Червоний тест тут — це знахідка в продакшн-коді, а не привід послабити
// очікування.

const sumOf = (xs: number[]): number => xs.reduce((acc, x) => acc + x, 0);

/** Розбирає "-$1,234.50" назад у центи — для перевірки round-trip інваріанта. */
const parseMoney = (s: string): number => {
  const negative = s.startsWith("-");
  const digits = s.replace(/[-$,]/g, "");
  const [whole, frac] = digits.split(".");
  const cents = Number(whole) * 100 + Number(frac);
  return negative ? -cents : cents;
};

describe("estimateTotalCents", () => {
  // ІНВАРІАНТ: для будь-якого валідного входу (hours >= 0, rateCents >= 0,
  // discountPercent у 0..100) результат — ціле число центів у межах
  // [0, round(hours * rateCents)]. Кошторис не буває дробовим і не буває
  // від'ємним. Саме round: при дробових годинах half-up може дати на пів
  // цента більше за gross (1.5 * 4999 = 7498.5 → 7499).
  // Тест нижче бере цілий gross, тож ширшого твердження не доводить.

  it("рахує суму без знижки", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000 })).toBe(50000);
  });

  it("застосовує знижку", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 10 })).toBe(45000);
  });

  it("повертає ціле число центів для будь-якого валідного входу (інваріант)", () => {
    const inputs = [
      { hours: 10, rateCents: 5000 },
      { hours: 1.5, rateCents: 4999 },
      { hours: 0.25, rateCents: 12345, discountPercent: 17 },
      { hours: 33, rateCents: 7333, discountPercent: 33 },
      { hours: 7.75, rateCents: 8333, discountPercent: 5 },
    ];

    expect(inputs.map((i) => Number.isInteger(estimateTotalCents(i)))).toEqual(
      inputs.map(() => true),
    );
  });

  it("тримає підсумок у межах [0, години × ставка] для знижок 0..100 (інваріант)", () => {
    const gross = 10 * 5000;
    const totals = [0, 1, 25, 50, 99, 100].map((discountPercent) =>
      estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent }),
    );

    expect(totals.every((t) => t >= 0 && t <= gross)).toBe(true);
  });

  it("не збільшує підсумок, коли знижка більша (інваріант монотонності)", () => {
    const totals = [0, 10, 25, 50, 75, 100].map((discountPercent) =>
      estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent }),
    );

    expect(totals.every((t, i) => i === 0 || t <= totals[i - 1])).toBe(true);
  });

  it("обнуляє кошторис при знижці 100%", () => {
    expect(estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 100 })).toBe(0);
  });

  it("дає нуль, коли нуль годин або нульова ставка", () => {
    expect(estimateTotalCents({ hours: 0, rateCents: 5000 })).toBe(0);
    expect(estimateTotalCents({ hours: 10, rateCents: 0 })).toBe(0);
    expect(estimateTotalCents({ hours: 0, rateCents: 0, discountPercent: 20 })).toBe(0);
  });

  it("рахує дробові години без втрати пів цента", () => {
    // 1.5 × 4999 = 7498.5 цента → округлення half-up → 7499
    expect(estimateTotalCents({ hours: 1.5, rateCents: 4999 })).toBe(7499);
    // 0.25 × 12345 = 3086.25 → 3086
    expect(estimateTotalCents({ hours: 0.25, rateCents: 12345 })).toBe(3086);
  });

  // Рішення по класу (B) «невизначена специфікація»: контракт `QuoteInput`
  // (`hours`/`rateCents` >= 0, `discountPercent` 0..100) тепер виконується,
  // а не лише документується. Обрано throw, а не мовчазний кламп: 150%
  // знижки — це помилка введення, і рахунок, «виправлений» тихо, гірший за
  // рахунок, який не порахувався. Див. docs/prompt-runs.md#прогін-2.

  it("відхиляє від'ємні години або ставку замість від'ємного рахунку", () => {
    expect(() => estimateTotalCents({ hours: -5, rateCents: 5000 })).toThrow(RangeError);
    expect(() => estimateTotalCents({ hours: 10, rateCents: -5000 })).toThrow(RangeError);
  });

  it("відхиляє знижку більшу за 100% замість виплати клієнту", () => {
    expect(() =>
      estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: 150 }),
    ).toThrow(RangeError);
  });

  // Додано за результатами зовнішнього код-рев'ю: кожне значення окремо
  // скінченне, а їхній добуток — уже ні.

  it("відхиляє кошторис, що вийшов за межі безпечного цілого", () => {
    expect(() =>
      estimateTotalCents({ hours: Number.MAX_VALUE, rateCents: 2 }),
    ).toThrow(RangeError);
  });

  it("відхиляє нечислові значення замість тихого NaN", () => {
    expect(() => estimateTotalCents({ hours: NaN, rateCents: 5000 })).toThrow(RangeError);
    expect(() => estimateTotalCents({ hours: Infinity, rateCents: 5000 })).toThrow(RangeError);
  });

  it("відхиляє від'ємну знижку замість тихої націнки", () => {
    expect(() =>
      estimateTotalCents({ hours: 10, rateCents: 5000, discountPercent: -10 }),
    ).toThrow(RangeError);
  });
});

describe("splitInstallments", () => {
  // ІНВАРІАНТ (головний): сума всіх платежів дорівнює вхідній сумі рівно —
  // розбиття не губить і не створює жодного цента.
  // Похідні інваріанти: кожен платіж — ціле число центів; платежі
  // відрізняються між собою не більше ніж на 1 цент.
  // Конвенція для точних масивів нижче: залишок роздається першим платежам
  // (front-loaded). Порядок — предмет домовленості; інваріант суми від
  // порядку не залежить.

  const cases: Array<{ total: number; parts: number }> = [
    { total: 90000, parts: 3 },
    { total: 100, parts: 3 },
    { total: 10000, parts: 3 },
    { total: 100, parts: 6 },
    { total: 5, parts: 2 },
    { total: 1002, parts: 5 },
    { total: 999, parts: 4 },
    { total: 0, parts: 3 },
    { total: 123457, parts: 1 },
    { total: -100, parts: 3 },
  ];

  it("ділить суму, що ділиться націло", () => {
    expect(splitInstallments(90000, 3)).toEqual([30000, 30000, 30000]);
  });

  it("зберігає суму до цента при будь-якому розбитті (інваріант)", () => {
    expect(cases.map((c) => sumOf(splitInstallments(c.total, c.parts)))).toEqual(
      cases.map((c) => c.total),
    );
  });

  it("повертає рівно `parts` платежів, кожен — ціле число центів", () => {
    expect(
      cases.map((c) => {
        const result = splitInstallments(c.total, c.parts);
        return result.length === c.parts && result.every(Number.isInteger);
      }),
    ).toEqual(cases.map(() => true));
  });

  it("робить платежі максимально рівними: різниця між ними не більша за цент", () => {
    expect(
      cases.map((c) => {
        const result = splitInstallments(c.total, c.parts);
        return Math.max(...result) - Math.min(...result) <= 1;
      }),
    ).toEqual(cases.map(() => true));
  });

  it("ділить суму із залишком 1 цент без втрати цента", () => {
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
  });

  it("ділить $100.00 на 3 платежі без втрати цента", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("ділить суму із залишком 4 центи, не створюючи зайвих центів", () => {
    // 100 / 6 = 16 із залишком 4 → перші чотири платежі по 17
    expect(splitInstallments(100, 6)).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it("ділить суму із залишком 2 центи між п'ятьма платежами", () => {
    expect(splitInstallments(1002, 5)).toEqual([201, 201, 200, 200, 200]);
  });

  it("ділить непарну суму навпіл, віддаючи зайвий цент першому платежу", () => {
    expect(splitInstallments(5, 2)).toEqual([3, 2]);
  });

  it("ділить суму із залишком 3 центи між чотирма платежами", () => {
    expect(splitInstallments(999, 4)).toEqual([250, 250, 250, 249]);
  });

  it("повертає весь рахунок одним платежем, коли частина одна", () => {
    expect(splitInstallments(123457, 1)).toEqual([123457]);
  });

  it("розбиває нульову суму на нулі", () => {
    expect(splitInstallments(0, 3)).toEqual([0, 0, 0]);
  });

  // Додано за головною знахідкою рев'ю `prompts/review-tests.md`: клас входу
  // «невалідний parts» не покривався жодним тестом, і фактична поведінка
  // мовчки порушувала всі три задокументовані гарантії —
  // (100, 0) → [] (зникає вся сума), (100, 2.5) → [40, 40] (−20 центів).

  it("відхиляє нульову або від'ємну кількість платежів замість тихої втрати суми", () => {
    expect(() => splitInstallments(100, 0)).toThrow(RangeError);
    expect(() => splitInstallments(100, -3)).toThrow(RangeError);
  });

  it("відхиляє дробову кількість платежів замість часткового розбиття", () => {
    expect(() => splitInstallments(100, 2.5)).toThrow(RangeError);
    expect(() => splitInstallments(100, NaN)).toThrow(RangeError);
  });

  it("відхиляє надто велику кількість платежів доменною помилкою", () => {
    // 4_294_967_296 проходить «ціле > 0», а Array.from кидає сире
    // RangeError: Invalid array length — це не доменна помилка.
    expect(() => splitInstallments(100, 4_294_967_296)).toThrow(
      /від 1 до 1200/,
    );
  });

  it("відхиляє суму за межею безпечного цілого замість тихої втрати центів", () => {
    // Number.isInteger(2 ** 54) === true, але арифметика там уже неточна:
    // до фіксу splitInstallments(2 ** 54, 7) давав суму на 4 центи меншу.
    // Знайдено незалежним рев'ю, не власним прогоном.
    expect(() => splitInstallments(2 ** 54, 7)).toThrow(RangeError);
  });

  it("відхиляє неціле число центів на вході", () => {
    expect(() => splitInstallments(100.5, 3)).toThrow(RangeError);
  });

  it("розбиває від'ємну суму (повернення коштів) без втрати цента", () => {
    expect(splitInstallments(-100, 3)).toEqual([-34, -33, -33]);
  });
});

describe("formatMoney", () => {
  // ІНВАРІАНТ: форматування оборотне — розібравши рядок назад, отримуємо
  // рівно ті самі центи (жодного округлення чи втрати знаку).

  it("форматує центи", () => {
    expect(formatMoney(123450)).toBe("$1,234.50");
  });

  it("зберігає суму при зворотному розборі рядка (інваріант)", () => {
    const values = [0, 1, 5, 99, 100, 101, 999, 123450, 100000000, -1, -5, -99, -123450];

    expect(values.map((v) => parseMoney(formatMoney(v)))).toEqual(values);
  });

  it("показує нуль як $0.00", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("додає провідний нуль для сум менших за долар", () => {
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(99)).toBe("$0.99");
  });

  it("переходить через межу долара", () => {
    expect(formatMoney(100)).toBe("$1.00");
  });

  it("ставить мінус перед знаком долара для від'ємних сум", () => {
    expect(formatMoney(-123450)).toBe("-$1,234.50");
    expect(formatMoney(-5)).toBe("-$0.05");
  });

  // Остання з трьох функцій, що отримала контракт. До цього вона мовчки
  // видавала зламані рядки — єдиний дефект, який пережив усі прогони
  // промптів, бо його фікс змінює поведінку, а stop-правило refactor-safe
  // це забороняло. Рішення ухвалене окремо, як клас (B).

  it("відхиляє нецілі центи замість рядка з двома розділювачами", () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
    expect(() => formatMoney(1234.56)).toThrow(RangeError);
  });

  it("відхиляє NaN та Infinity замість валютного рядка з NaN", () => {
    expect(() => formatMoney(NaN)).toThrow(RangeError);
    expect(() => formatMoney(Infinity)).toThrow(RangeError);
  });

  it("розділяє тисячі комами у великих сумах", () => {
    expect(formatMoney(100000000)).toBe("$1,000,000.00");
  });
});
