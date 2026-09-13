/**
 * Розрахунок кошторису для проєкту автоматизації.
 * Усі суми — у центах (цілі числа), щоб уникнути похибок float.
 *
 * Це навчальний модуль-ціль для промптів з `prompts/`.
 * Він НАВМИСНЕ недосконалий — саме це ви і знайдете добре сформульованим
 * промптом з acceptance criteria (Task A).
 */

export interface QuoteInput {
  /** Оцінка робіт у годинах */
  hours: number;
  /** Ставка за годину, у центах (напр. 5000 = $50.00) */
  rateCents: number;
  /** Знижка у відсотках, 0..100 */
  discountPercent?: number;
}

/**
 * Помилка порушеного контракту в єдиній формі «X має бути ..., отримано: Y».
 * Модуль-приватна: формат повідомлення задається тут і ніде більше.
 */
function rangeError(name: string, expectation: string, value: number): RangeError {
  return new RangeError(`${name} має бути ${expectation}, отримано: ${value}`);
}

/**
 * Верхня межа кількості платежів — 100 років щомісяця. Потрібна не для краси:
 * `4_294_967_296` проходить перевірку «ціле > 0», а далі `Array.from` кидає
 * сире `RangeError: Invalid array length` замість доменної помилки.
 */
const MAX_INSTALLMENTS = 1200;

/**
 * Контрактна точність входу. Години — до сотої (0.01 год = 36 секунд),
 * відсоток знижки — до сотої відсотка. Дрібніше не приймаємо: для кошторису
 * така точність не має сенсу, а спроба її підтримати означає або плаваючу
 * кому з її похибками, або десяткову бібліотеку заради 36 секунд.
 */
const HOURS_SCALE = 100;
const PERCENT_SCALE = 100;

/**
 * Переводить дробове значення в ціле за заданим масштабом і **відхиляє**
 * вхід, точніший за контракт. Тут ловляться обидва класи:
 * `hours: 0.4999996` (`* 100 = 49.99996` — не ціле) і `hours: 1e-12`
 * (`* 100 = 1e-10` — теж не ціле, хоч і мікроскопічне).
 */
function toScaled(name: string, value: number, scale: number): number {
  const product = value * scale;
  const scaled = Math.round(product);

  // Допуск **відносний**, а не фіксований. Абсолютний `1e-9` пропускав усе
  // менше за 1e-11 години: `hours: 1e-12` давало `product = 1e-10 < 1e-9`,
  // округлювалось до 0 і тихо проходило — попри контракт, що точніше за
  // 0.01 год треба відхиляти. `Number.EPSILON` масштабується разом зі
  // значенням, тож допускає лише похибку представлення IEEE 754 і нічого
  // понад неї.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(product));
  if (!(Math.abs(product - scaled) <= tolerance)) {
    throw rangeError(name, `числом з точністю не дрібніше за 1/${scale}`, value);
  }
  return scaled;
}

/** Контракт «скінченне число >= 0»: перевірка і її текст живуть разом. */
function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw rangeError(name, "скінченним числом >= 0", value);
  }
}

/**
 * Ціна проєкту в центах з урахуванням знижки.
 *
 * Контракт (`QuoteInput`) виконується, а не лише документується: вхід поза
 * діапазоном — це помилка введення, і вона має бути гучною. Тихо клампити
 * означало б виставити клієнту рахунок, якого ніхто не замовляв.
 *
 * **Контрактна точність:** `hours` — до сотої години (36 секунд),
 * `discountPercent` — до сотої відсотка, `rateCents` — ціле число центів.
 * Точніший вхід відхиляється, а не округлюється тихо: інакше
 * `hours: 0.4999996` дало б 1 цент замість 0.
 *
 * @throws {RangeError} якщо `hours` або `rateCents` від'ємні чи не скінченні;
 *   якщо `rateCents` не ціле; якщо `hours` або `discountPercent` точніші за
 *   контракт; якщо `discountPercent` поза `0..100`; або якщо проміжний
 *   добуток чи підсумок вийшли за межі безпечного цілого.
 */
export function estimateTotalCents(input: QuoteInput): number {
  const { hours, rateCents, discountPercent = 0 } = input;

  // Асиметрія навмисна: 1.5 години роботи — нормально, 0.5 цента ставки — ні.
  // `rateCents` задокументовано як суму **в центах**, тож дробове значення
  // тут означає, що хтось передав долари або неокруглену ставку; воно тихо
  // зникало в `Math.round` нижче.
  assertFiniteNonNegative("hours", hours);
  assertFiniteNonNegative("rateCents", rateCents);
  if (!Number.isInteger(rateCents)) {
    throw rangeError("rateCents", "цілим числом центів", rateCents);
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw rangeError("discountPercent", "в діапазоні 0..100", discountPercent);
  }

  // Уся арифметика — в цілих. Спроба «погасити похибку IEEE 754» округленням
  // проміжних сум до 1e-6 була гіршою за проблему: вона тихо змінювала
  // результат для входів із більшою точністю (`hours: 0.4999996` давало 1
  // замість 0). Замість підчищання плаваючої коми тут зафіксована **контрактна
  // точність** — і далі множення цілих, без жодного дробу до фінального
  // ділення.
  const centiHours = toScaled("hours", hours, HOURS_SCALE);
  const centiPercent = toScaled("discountPercent", discountPercent, PERCENT_SCALE);

  // Одиниці: сотi цента. Обидва множники цілі, тож добуток точний.
  const grossCenti = centiHours * rateCents;

  // Перевіряти треба **обидва** добутки окремо. Перевірка самого `numerator`
  // недостатня: при `discountPercent: 100` множник `remaining` дорівнює нулю,
  // тож `numerator` виходить 0 — безпечний — навіть коли `grossCenti` уже
  // вискочив за межу. Відповідь для 100% знижки випадково правильна (нуль),
  // але контракт «проміжні добутки безпечні» при цьому порушено мовчки.
  if (!Number.isSafeInteger(grossCenti)) {
    throw rangeError("недисконтована сума", "у межах безпечного цілого", grossCenti);
  }

  const remaining = PERCENT_SCALE * 100 - centiPercent; // частка, що лишається
  const numerator = grossCenti * remaining;

  if (!Number.isSafeInteger(numerator)) {
    throw rangeError("проміжний добуток", "у межах безпечного цілого", numerator);
  }

  const total = Math.round(numerator / (HOURS_SCALE * PERCENT_SCALE * 100));

  // Четверта сітка — запобіжник на сам результат. Порядок спрацювання
  // перевірено, а не припущено:
  //   hours: MAX_VALUE          → `toScaled` (MAX_VALUE * 100 = Infinity)
  //   hours: 1e10, r: 1e7, 100% → перевірка `grossCenti`
  //   hours: 1e7,  r: 1e7       → перевірка `numerator`
  // Входу, який дійшов би сюди повз усі три, я не знайшов — тому ця перевірка
  // лишається як страховка, а не як робочий шлях.
  if (!Number.isSafeInteger(total)) {
    throw rangeError("підсумок", "у межах безпечного цілого", total);
  }

  return total;
}

/**
 * Розбити суму на `parts` платежів (у центах).
 *
 * Гарантії:
 * - довжина результату дорівнює `parts`;
 * - сума всіх платежів **точно** дорівнює `totalCents` — залишок від ділення
 *   не губиться і не створюється;
 * - платежі відрізняються між собою не більше ніж на 1 цент;
 * - залишок роздається **першим** платежам (front-loaded);
 * - для від'ємних сум (повернення коштів) працює симетрично.
 *
 * @throws {RangeError} якщо `totalCents` не є безпечним цілим, або `parts`
 *   не ціле в межах `1..MAX_INSTALLMENTS`.
 */
export function splitInstallments(totalCents: number, parts: number): number[] {
  // Саме isSafeInteger, а не isInteger: останній повертає true для будь-якого
  // float >= 2^53, де цілочисельна арифметика вже неточна. Тоді головна
  // гарантія нижче тихо ламається — splitInstallments(2 ** 54, 7) губив
  // 4 центи при формально «цілому» вході.
  if (!Number.isSafeInteger(totalCents)) {
    throw rangeError("totalCents", "цілим числом центів у межах безпечного цілого", totalCents);
  }
  if (!Number.isInteger(parts) || parts <= 0 || parts > MAX_INSTALLMENTS) {
    throw rangeError("parts", `цілим числом від 1 до ${MAX_INSTALLMENTS}`, parts);
  }

  const base = Math.trunc(totalCents / parts);
  const remainder = totalCents - base * parts;
  const step = totalCents < 0 ? -1 : 1;
  return Array.from({ length: parts }, (_, i) =>
    i < Math.abs(remainder) ? base + step : base,
  );
}

/**
 * Форматування центів у рядок на кшталт `"$1,234.50"`.
 *
 * Приймає **цілі** центи. До цього контракту не було, і функція мовчки
 * видавала зламані рядки: `formatMoney(1.5)` → `"$0.1.5"` (два розділювачі),
 * `formatMoney(NaN)` → `"$NaN.NaN"`. Дві сусідні функції свій контракт
 * виконують — ця лишалась єдиною без нього.
 *
 * @throws {RangeError} якщо `cents` не є безпечним цілим.
 */
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw rangeError("cents", "цілим числом центів у межах безпечного цілого", cents);
  }

  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}
