import type { CSSProperties } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import styles from './placement-board-concept.module.css';

const BOARD_START_MINUTES = toMinutes('08:30');
const BOARD_END_MINUTES = toMinutes('18:30');
const BOARD_TOTAL_MINUTES = BOARD_END_MINUTES - BOARD_START_MINUTES;

type TimedObject = {
  id: string;
  start: string;
  end: string;
};

type AppointmentObjectData = TimedObject & {
  client: string;
  service: string;
  meta: string;
};

type FitPocketData = TimedObject & {
  label: string;
  detail: string;
  variant: 'best' | 'later' | 'gap';
};

type InvalidZoneData = TimedObject & {
  reason: string;
  detail: string;
  variant: 'break' | 'booked' | 'short';
};

type RequestData = {
  id: string;
  client: string;
  service: string;
  duration: string;
  preference: string;
  selected?: boolean;
};

const appointments: AppointmentObjectData[] = [
  {
    id: 'appt-lora',
    start: '09:10',
    end: '09:55',
    client: 'Лора Димитрова',
    service: 'Подстригване',
    meta: '45 мин · потвърден',
  },
  {
    id: 'appt-irina',
    start: '10:05',
    end: '10:50',
    client: 'Ирина Стоянова',
    service: 'Стайлинг',
    meta: '45 мин · редовен клиент',
  },
  {
    id: 'appt-gergana',
    start: '12:15',
    end: '13:05',
    client: 'Гергана Петрова',
    service: 'Тониране',
    meta: '50 мин · тиха зона',
  },
  {
    id: 'appt-vera',
    start: '16:25',
    end: '17:05',
    client: 'Вера Николова',
    service: 'Сешоар',
    meta: '40 мин · потвърден',
  },
  {
    id: 'appt-milena',
    start: '17:15',
    end: '17:50',
    client: 'Милена Георгиева',
    service: 'Поддръжка',
    meta: '35 мин · кратък час',
  },
];

const fitPockets: FitPocketData[] = [
  {
    id: 'fit-gap',
    start: '10:55',
    end: '11:55',
    label: 'Запълва празнина',
    detail: '10:55-11:55 · 60 мин',
    variant: 'gap',
  },
  {
    id: 'fit-best',
    start: '14:00',
    end: '15:00',
    label: 'Най-добро място',
    detail: '14:00-15:00 · 60 мин',
    variant: 'best',
  },
  {
    id: 'fit-later',
    start: '15:05',
    end: '16:05',
    label: 'По-късно',
    detail: '15:05-16:05 · 60 мин',
    variant: 'later',
  },
];

const invalidZones: InvalidZoneData[] = [
  {
    id: 'invalid-break',
    start: '13:15',
    end: '13:45',
    reason: 'Почивка',
    detail: 'Не пасва',
    variant: 'break',
  },
  {
    id: 'invalid-booked',
    start: '12:15',
    end: '13:05',
    reason: 'Заето',
    detail: 'Не пасва',
    variant: 'booked',
  },
  {
    id: 'invalid-short',
    start: '17:50',
    end: '18:00',
    reason: 'Няма 60 мин',
    detail: 'Не пасва',
    variant: 'short',
  },
];

const requests: RequestData[] = [
  {
    id: 'request-anna',
    client: 'Анна Петрова',
    service: 'Боядисване корени',
    duration: '60 мин',
    preference: 'предпочита следобед',
    selected: true,
  },
  {
    id: 'request-kalina',
    client: 'Калина Георгиева',
    service: 'Маникюр',
    duration: '45 мин',
    preference: 'може утре сутрин',
  },
  {
    id: 'request-silvia',
    client: 'Силвия Маринова',
    service: 'Консултация',
    duration: '30 мин',
    preference: 'след 16:00',
  },
];

const timeLabels = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
];

export function PlacementBoardConcept() {
  return (
    <main className={styles.conceptShell} aria-label="Calm Precision Placement Board">
      <TopUtilityStrip />
      <div className={styles.conceptCanvas}>
        <SpecialistFocusHeader />
        <PlacementDayBoard />
        <RequestTray />
      </div>
    </main>
  );
}

function TopUtilityStrip() {
  return (
    <header className={styles.topStrip}>
      <div className={styles.brandLockup}>
        <div className={styles.logoMark}>SQ</div>
        <div>
          <p className={styles.brandEyebrow}>SalonIQ Calendar V2</p>
          <h1 className={styles.brandTitle}>Calm Precision Placement Board</h1>
        </div>
      </div>

      <div className={styles.dateNavigator} aria-label="Навигация по дата">
        <button type="button" className={styles.iconButton} aria-label="Предишен ден">
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className={styles.dateButton}>
          <CalendarDays aria-hidden="true" />
          25 май 2026
        </button>
        <button type="button" className={styles.iconButton} aria-label="Следващ ден">
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className={styles.secondaryButton}>
          Днес
        </button>
      </div>

      <div className={styles.topActions}>
        <button type="button" className={styles.specialistSwitcher}>
          <span className={styles.switcherAvatars} aria-hidden="true">
            <span>НС</span>
            <span>ЕЛ</span>
            <span>+3</span>
          </span>
          Никол Стоянова
          <ChevronDown aria-hidden="true" />
        </button>
        <button type="button" className={styles.secondaryButton}>
          <Users aria-hidden="true" />
          Екипен изглед
        </button>
        <button type="button" className={styles.primaryButton}>
          <Plus aria-hidden="true" />
          Нова резервация
        </button>
      </div>
    </header>
  );
}

function SpecialistFocusHeader() {
  return (
    <section className={styles.focusHeader} aria-label="Избран специалист">
      <div className={styles.specialistIdentity}>
        <div className={styles.avatar}>НС</div>
        <div>
          <p className={styles.headerKicker}>Избран специалист</p>
          <h2>Никол Стоянова</h2>
          <p className={styles.roleLine}>Колорист и стилист · Sofia Studio</p>
        </div>
      </div>

      <div className={styles.focusMetrics}>
        <div className={styles.metric}>
          <span>Работно време</span>
          <strong>09:00-18:00</strong>
        </div>
        <div className={styles.metric}>
          <span>резервации днес</span>
          <strong>5</strong>
        </div>
        <div className={styles.availabilityPill}>
          <Check aria-hidden="true" />
          3 точни места за 60 мин
        </div>
        <ConceptBadge />
      </div>
    </section>
  );
}

function ConceptBadge() {
  return (
    <div className={styles.conceptBadge}>
      <Sparkles aria-hidden="true" />
      Само визуален preview
    </div>
  );
}

function PlacementDayBoard() {
  return (
    <section className={styles.boardSection} aria-label="Еднодневна placement board сцена">
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.headerKicker}>Един специалист · един ден</p>
          <h3>Заявката е избрана, местата са видими преди запис.</h3>
        </div>
        <div className={styles.boardLegend} aria-label="Легенда">
          <span>
            <i className={styles.legendFit} />
            пасва
          </span>
          <span>
            <i className={styles.legendInvalid} />
            не пасва
          </span>
          <span>
            <i className={styles.legendBooked} />
            обект
          </span>
        </div>
      </div>

      <div className={styles.boardFrame}>
        <TimeSpine />
        <div className={styles.boardSurface}>
          <div className={styles.workingHoursBand} style={timeBoxStyle('09:00', '18:00')} />
          <div className={styles.outsideHoursTop} style={timeBoxStyle('08:30', '09:00')}>
            извън работно време
          </div>
          <div className={styles.outsideHoursBottom} style={timeBoxStyle('18:00', '18:30')}>
            извън работно време
          </div>
          {timeLabels.map((label) => (
            <div key={label} className={styles.hourGuide} style={timePointStyle(label)} />
          ))}
          <CurrentTimeIndicator />
          {fitPockets.map((pocket) => (
            <FitPocket key={pocket.id} pocket={pocket} />
          ))}
          {appointments.map((appointment) => (
            <AppointmentObject key={appointment.id} appointment={appointment} />
          ))}
          <BreakObject />
          <BlockedObject />
          {invalidZones.map((zone) => (
            <InvalidZone key={zone.id} zone={zone} />
          ))}
          <PlacementPreviewCard />
        </div>
      </div>
    </section>
  );
}

function TimeSpine() {
  return (
    <div className={styles.timeSpine} aria-hidden="true">
      {timeLabels.map((label) => (
        <span key={label} style={timePointStyle(label)}>
          {label}
        </span>
      ))}
    </div>
  );
}

function CurrentTimeIndicator() {
  return (
    <div className={styles.currentTime} style={timePointStyle('14:06')}>
      <span>сега</span>
    </div>
  );
}

function AppointmentObject({ appointment }: { appointment: AppointmentObjectData }) {
  return (
    <article className={styles.appointmentObject} style={timeBoxStyle(appointment.start, appointment.end)}>
      <div>
        <time>
          {appointment.start}-{appointment.end}
        </time>
        <h4>{appointment.client}</h4>
      </div>
      <p>{appointment.service}</p>
      <span>{appointment.meta}</span>
    </article>
  );
}

function BreakObject() {
  return (
    <div className={styles.breakObject} style={timeBoxStyle('13:15', '13:45')}>
      <Clock3 aria-hidden="true" />
      <span>Почивка</span>
      <small>13:15-13:45</small>
    </div>
  );
}

function BlockedObject() {
  return (
    <div className={styles.blockedObject} style={timeBoxStyle('11:55', '12:10')}>
      <span>Блокирано</span>
      <small>подготовка за цвят</small>
    </div>
  );
}

function FitPocket({ pocket }: { pocket: FitPocketData }) {
  return (
    <button
      type="button"
      className={`${styles.fitPocket} ${styles[`fitPocket-${pocket.variant}`]}`}
      style={timeBoxStyle(pocket.start, pocket.end)}
    >
      <span>{pocket.label}</span>
      <strong>{pocket.detail}</strong>
    </button>
  );
}

function InvalidZone({ zone }: { zone: InvalidZoneData }) {
  return (
    <div
      className={`${styles.invalidZone} ${styles[`invalidZone-${zone.variant}`]}`}
      style={timeBoxStyle(zone.start, zone.end)}
    >
      <span>{zone.detail}</span>
      <strong>{zone.reason}</strong>
    </div>
  );
}

function PlacementPreviewCard() {
  return (
    <aside className={styles.previewCard} style={timePointStyle('13:52')} aria-label="Преглед преди поставяне">
      <div className={styles.previewAnchor} aria-hidden="true" />
      <p>Готово за поставяне</p>
      <h4>Анна Петрова</h4>
      <dl>
        <div>
          <dt>Услуга</dt>
          <dd>Боядисване корени</dd>
        </div>
        <div>
          <dt>Избрано време</dt>
          <dd>14:00-15:00 · Никол</dd>
        </div>
      </dl>
      <div className={styles.previewNote}>Само визуален preview · не е записано</div>
      <div className={styles.previewActions}>
        <button type="button">Постави резервация</button>
        <button type="button">
          <X aria-hidden="true" />
          Отказ
        </button>
      </div>
    </aside>
  );
}

function RequestTray() {
  return (
    <section className={styles.requestTray} aria-label="Заявки за поставяне">
      <div className={styles.trayHeader}>
        <div>
          <p className={styles.headerKicker}>Тава със заявки</p>
          <h3>Заявки за поставяне</h3>
        </div>
        <span>избрана заявка · показани места</span>
      </div>
      <div className={styles.requestStack}>
        {requests.map((request) => (
          <RequestBlock key={request.id} request={request} />
        ))}
      </div>
    </section>
  );
}

function RequestBlock({ request }: { request: RequestData }) {
  return (
    <article className={`${styles.requestBlock} ${request.selected ? styles.selectedRequestBlock : ''}`}>
      <div className={styles.requestAvatar}>{getInitials(request.client)}</div>
      <div>
        <div className={styles.requestTopline}>
          <h4>{request.client}</h4>
          {request.selected ? <span>избрана</span> : null}
        </div>
        <p>{request.service}</p>
        <div className={styles.requestMeta}>
          <span>{request.duration}</span>
          <span>{request.preference}</span>
        </div>
      </div>
    </article>
  );
}

function timeBoxStyle(start: string, end: string) {
  const top = ((toMinutes(start) - BOARD_START_MINUTES) / BOARD_TOTAL_MINUTES) * 100;
  const height = ((toMinutes(end) - toMinutes(start)) / BOARD_TOTAL_MINUTES) * 100;

  return {
    '--top': `${top}%`,
    '--height': `${height}%`,
  } as CSSProperties;
}

function timePointStyle(time: string) {
  const top = ((toMinutes(time) - BOARD_START_MINUTES) / BOARD_TOTAL_MINUTES) * 100;

  return {
    '--top': `${top}%`,
  } as CSSProperties;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}
