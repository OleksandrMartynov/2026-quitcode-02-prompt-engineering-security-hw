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

  if (!Number.isFinite(hours) || hours < 0) {
    throw new RangeError(`hours має бути скінченним числом >= 0, отримано: ${hours}`);
  }
  if (!Number.isFinite(rateCents) || rateCents < 0) {
    throw new RangeError(`rateCents має бути скінченним числом >= 0, отримано: ${rateCents}`);
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError(
      `discountPercent має бути в діапазоні 0..100, отримано: ${discountPercent}`,
    );
  }

  const gross = hours * rateCents;
  const discount = (gross * discountPercent) / 100;
  return Math.round(gross - discount);
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
 */
export function splitInstallments(totalCents: number, parts: number): number[] {
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
