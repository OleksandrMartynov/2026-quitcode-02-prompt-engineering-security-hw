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
 * @throws {RangeError} якщо `hours` або `rateCents` від'ємні чи не скінченні,
 *   або якщо `discountPercent` поза діапазоном `0..100`.
 */
export function estimateTotalCents(input: QuoteInput): number {
  const { hours, rateCents, discountPercent = 0 } = input;

  assertFiniteNonNegative("hours", hours);
  assertFiniteNonNegative("rateCents", rateCents);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw rangeError("discountPercent", "в діапазоні 0..100", discountPercent);
  }

  const gross = hours * rateCents;
  const discount = (gross * discountPercent) / 100;
  const total = Math.round(gross - discount);

  // Перевірки вище пропускають `hours: Number.MAX_VALUE` — кожне значення
  // окремо скінченне, а їхній добуток уже ні. Без цієї перевірки функція
  // повертає `Infinity`, і кошторис тихо стає безглуздим.
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
 * @throws {RangeError} якщо `totalCents` не ціле, або `parts` не ціле > 0.
 */
export function splitInstallments(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw rangeError("totalCents", "цілим числом центів", totalCents);
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

/** Форматування центів у рядок на кшталт "$1,234.50". */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}
