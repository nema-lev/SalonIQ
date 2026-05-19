export type CalendarV2ActionErrorCategory =
  | 'past_time'
  | 'conflict'
  | 'unavailable'
  | 'stale'
  | 'already_cancelled'
  | 'already_confirmed'
  | 'terminal'
  | 'request_already_handled'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'server'
  | 'unknown'
  | 'refresh_warning';

export type CalendarV2ActionErrorContext =
  | 'manual_booking'
  | 'request_placement'
  | 'cancel_booking'
  | 'confirm_booking'
  | 'reschedule_booking'
  | 'board_load';

export type CalendarV2NormalizedActionError = {
  category: CalendarV2ActionErrorCategory;
  status?: number;
  code?: string;
};

export const CALENDAR_V2_REFRESH_WARNING_MESSAGE =
  'Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.';

const GENERAL_ERROR_COPY: Partial<Record<CalendarV2ActionErrorCategory, string>> = {
  network: 'Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.',
  server: 'Възникна проблем със сървъра. Опитайте отново след малко.',
  unauthorized: 'Сесията е изтекла. Влезте отново.',
  forbidden: 'Нямате права за това действие.',
  stale: 'Часът е променен. Обновете календара и опитайте отново.',
  refresh_warning: CALENDAR_V2_REFRESH_WARNING_MESSAGE,
};

const ACTION_ERROR_COPY: Record<CalendarV2ActionErrorContext, Partial<Record<CalendarV2ActionErrorCategory, string>>> = {
  manual_booking: {
    past_time: 'Не може да запишете час в миналото.',
    conflict: 'Този час вече е зает.',
    unavailable: 'Този час не е наличен.',
    unknown: 'Не успяхме да създадем часа. Опитайте отново.',
  },
  request_placement: {
    request_already_handled: 'Заявката вече е обработена.',
    past_time: 'Не може да поставите заявка в миналото.',
    conflict: 'Този час вече е зает.',
    unavailable: 'Този час не е наличен.',
    unknown: 'Не успяхме да поставим заявката. Опитайте отново.',
  },
  cancel_booking: {
    already_cancelled: 'Този час вече не може да бъде отказан.',
    terminal: 'Този час вече не може да бъде отказан.',
    unknown: 'Не успяхме да откажем часа. Опитайте отново.',
  },
  confirm_booking: {
    already_confirmed: 'Този час вече е потвърден.',
    terminal: 'Този час вече не може да бъде потвърден.',
    unknown: 'Не успяхме да потвърдим часа. Опитайте отново.',
  },
  reschedule_booking: {
    past_time: 'Не може да преместите час в миналото.',
    conflict: 'Този час вече е зает.',
    unavailable: 'Този час не е наличен.',
    terminal: 'Часът е променен. Обновете календара и опитайте отново.',
    unknown: 'Не успяхме да преместим часа. Опитайте отново.',
  },
  board_load: {
    unknown: 'Възникна неочаквана грешка при зареждането.',
  },
};

export function getCalendarV2ActionErrorMessage(error: unknown, context: CalendarV2ActionErrorContext) {
  const normalized = normalizeCalendarV2ActionError(error, context);
  return getCalendarV2ActionErrorMessageForCategory(normalized.category, context);
}

export function getCalendarV2ActionErrorMessageForCategory(
  category: CalendarV2ActionErrorCategory,
  context: CalendarV2ActionErrorContext,
) {
  return ACTION_ERROR_COPY[context][category] ?? GENERAL_ERROR_COPY[category] ?? ACTION_ERROR_COPY[context].unknown!;
}

export function normalizeCalendarV2ActionError(
  error: unknown,
  context: CalendarV2ActionErrorContext,
): CalendarV2NormalizedActionError {
  const status = extractHttpStatus(error);
  const code = extractApiCode(error);
  const message = extractApiMessage(error);
  const normalizedCode = normalizeText(code);
  const normalizedMessage = normalizeText(message);

  if (status === 401 || includesAny(normalizedCode, ['unauthorized', 'auth_required', 'token_expired'])) {
    return { category: 'unauthorized', status, code };
  }

  if (status === 403 || includesAny(normalizedCode, ['forbidden', 'not_allowed', 'permission_denied'])) {
    return { category: 'forbidden', status, code };
  }

  if (isNetworkError(error, status)) {
    return { category: 'network', status, code };
  }

  if (typeof status === 'number' && status >= 500) {
    return { category: 'server', status, code };
  }

  const codedCategory = normalizeCategoryFromCode(normalizedCode);
  if (codedCategory) {
    return { category: codedCategory, status, code };
  }

  const messagedCategory = normalizeCategoryFromMessage(normalizedMessage);
  if (messagedCategory) {
    return { category: messagedCategory, status, code };
  }

  if (context === 'cancel_booking') {
    if (status === 400) return { category: 'terminal', status, code };
    if (status === 404 || status === 409) return { category: 'stale', status, code };
  }

  if (context === 'confirm_booking') {
    if (status === 400) return { category: 'terminal', status, code };
    if (status === 404 || status === 409) return { category: 'stale', status, code };
  }

  if (context === 'reschedule_booking') {
    if (status === 400) return { category: 'unavailable', status, code };
    if (status === 404) return { category: 'stale', status, code };
    if (status === 409) return { category: 'conflict', status, code };
  }

  if (context === 'manual_booking' || context === 'request_placement') {
    if (status === 409) return { category: 'conflict', status, code };
    if (status === 400 || status === 404) return { category: 'unavailable', status, code };
  }

  return { category: 'unknown', status, code };
}

function normalizeCategoryFromCode(normalizedCode: string): CalendarV2ActionErrorCategory | null {
  if (!normalizedCode) return null;

  if (includesAny(normalizedCode, ['request_already_handled', 'already_handled', 'waitlist_already_booked'])) {
    return 'request_already_handled';
  }
  if (includesAny(normalizedCode, ['already_cancelled', 'appointment_cancelled'])) return 'already_cancelled';
  if (includesAny(normalizedCode, ['already_confirmed', 'appointment_confirmed'])) return 'already_confirmed';
  if (includesAny(normalizedCode, ['past_time', 'past_scheduling', 'start_in_past'])) return 'past_time';
  if (includesAny(normalizedCode, ['stale', 'not_found', 'version_conflict'])) return 'stale';
  if (includesAny(normalizedCode, ['terminal', 'invalid_status_transition'])) return 'terminal';
  if (includesAny(normalizedCode, ['unavailable', 'outside_working_hours', 'blocked_interval'])) return 'unavailable';
  if (includesAny(normalizedCode, ['conflict', 'slot_taken', 'overlap'])) return 'conflict';
  if (includesAny(normalizedCode, ['network', 'timeout'])) return 'network';
  if (includesAny(normalizedCode, ['server', 'internal'])) return 'server';

  return null;
}

function normalizeCategoryFromMessage(normalizedMessage: string): CalendarV2ActionErrorCategory | null {
  if (!normalizedMessage) return null;

  if (normalizedMessage.includes('заявката вече е обработена')) return 'request_already_handled';
  if (normalizedMessage.includes('миналото') || normalizedMessage.includes('past')) return 'past_time';
  if (
    normalizedMessage.includes("от 'confirmed' на 'confirmed'") ||
    normalizedMessage.includes('вече е потвърден')
  ) {
    return 'already_confirmed';
  }
  if (
    normalizedMessage.includes("от 'cancelled' на 'cancelled'") ||
    normalizedMessage.includes('вече е отказан') ||
    normalizedMessage.includes('вече е отменен')
  ) {
    return 'already_cancelled';
  }
  if (
    normalizedMessage.includes('не може да се смени статус') ||
    normalizedMessage.includes('не може да бъде преместен') ||
    normalizedMessage.includes('този запис не може да бъде преместен')
  ) {
    return 'terminal';
  }
  if (
    normalizedMessage.includes('не работи') ||
    normalizedMessage.includes('извън работното време') ||
    normalizedMessage.includes('блокиран интервал') ||
    normalizedMessage.includes('специалистът не е намерен') ||
    normalizedMessage.includes('служителят не е намерен') ||
    normalizedMessage.includes('услугата не е намерена') ||
    normalizedMessage.includes('не се провежда')
  ) {
    return 'unavailable';
  }
  if (
    normalizedMessage.includes('зает') ||
    normalizedMessage.includes('няма свободни места') ||
    normalizedMessage.includes('overlap')
  ) {
    return 'conflict';
  }
  if (normalizedMessage.includes('резервацията не е намерена')) return 'stale';

  return null;
}

function extractHttpStatus(error: unknown) {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  return typeof response.status === 'number' ? response.status : undefined;
}

function extractApiCode(error: unknown) {
  if (!isRecord(error)) return '';
  const response = error.response;
  const data = isRecord(response) ? response.data : undefined;
  if (!isRecord(data)) return '';

  const code = data.code ?? data.errorCode ?? data.error;
  return typeof code === 'string' ? code : '';
}

function extractApiMessage(error: unknown) {
  if (!isRecord(error)) return '';
  const response = error.response;
  const data = isRecord(response) ? response.data : undefined;
  if (!isRecord(data)) return '';

  const message = data.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.find((entry): entry is string => typeof entry === 'string') ?? '';
  }

  return '';
}

function isNetworkError(error: unknown, status?: number) {
  if (typeof status === 'number') return false;
  if (!isRecord(error)) return false;

  const code = typeof error.code === 'string' ? error.code.toLocaleLowerCase('en-US') : '';
  if (includesAny(code, ['err_network', 'econnaborted', 'etimedout', 'econnreset'])) return true;

  return Boolean(error.request && !error.response);
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('bg-BG');
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
