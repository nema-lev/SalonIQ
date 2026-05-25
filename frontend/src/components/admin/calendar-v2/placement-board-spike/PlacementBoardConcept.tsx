import type { CSSProperties } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
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
  status: string;
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
    start: '09:05',
    end: '09:40',
    client: 'Лора Димитрова',
    service: 'Подстригване',
    status: 'потвърден',
  },
  {
    id: 'appt-irina',
    start: '10:20',
    end: '10:50',
    client: 'Ирина Стоянова',
    service: 'Стайлинг',
    status: 'потвърден',
  },
  {
    id: 'appt-gergana',
    start: '12:15',
    end: '13:05',
    client: 'Гергана Петрова',
    service: 'Тониране',
    status: 'потвърден',
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
    reason: 'почивка',
    detail: 'Не пасва',
    variant: 'break',
  },
  {
    id: 'invalid-booked',
    start: '12:15',
    end: '13:05',
    reason: 'Заето',
    detail: 'Заето',
    variant: 'booked',
  },
  {
    id: 'invalid-short',
    start: '17:50',
    end: '18:00',
    reason: 'няма 60 мин',
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
          <p className={styles.brandEyebrow}>SalonIQ</p>
          <h1 className={styles.brandTitle}>Placement Board</h1>
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
          <p className={styles.headerKicker}>Дневен фокус</p>
          <h2>Никол Стоянова</h2>
          <p className={styles.roleLine}>Колорист и стилист · Studio Aurora</p>
        </div>
      </div>

      <div className={styles.focusMetrics}>
        <div className={styles.metric}>
          <span>Работно време</span>
          <strong>09:00-18:00</strong>
        </div>
        <div className={styles.metric}>
          <span>Днес</span>
          <strong>5 резервации</strong>
        </div>
        <div className={styles.availabilityPill}>
          <Check aria-hidden="true" />
          3 подходящи места
        </div>
      </div>
    </section>
  );
}

function PlacementDayBoard() {
  return (
    <section className={styles.boardSection} aria-label="Еднодневна placement board сцена">
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.headerKicker}>Избрана заявка · Анна Петрова · 60 мин</p>
          <h3>Най-добрите места са подсказани преди запис.</h3>
        </div>
        <p className={styles.previewOnlyLine}>Само preview · часът още не е записан</p>
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
      <span>{appointment.status}</span>
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
      {zone.detail !== zone.reason ? <span>{zone.detail}</span> : null}
      <strong>{zone.detail === 'Заето' ? zone.reason : `Не пасва · ${zone.reason}`}</strong>
    </div>
  );
}

function PlacementPreviewCard() {
  return (
    <aside className={styles.previewCard} aria-label="Преглед преди поставяне">
      <div className={styles.previewAnchor} aria-hidden="true" />
      <p>Преглед преди поставяне</p>
      <h4>Анна Петрова</h4>
      <dl>
        <div>
          <dt>Услуга</dt>
          <dd>Боядисване корени</dd>
        </div>
        <div>
          <dt>Времетраене</dt>
          <dd>60 мин</dd>
        </div>
        <div>
          <dt>Място</dt>
          <dd>14:00-15:00 · Никол</dd>
        </div>
      </dl>
      <div className={styles.previewNote}>Само preview · часът още не е записан</div>
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
          <p className={styles.headerKicker}>Чакащи заявки</p>
          <h3>Заявки за поставяне</h3>
        </div>
        <span>Анна е избрана</span>
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
