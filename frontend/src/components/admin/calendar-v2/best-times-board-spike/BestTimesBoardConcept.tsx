import type { CSSProperties } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import styles from './best-times-board-concept.module.css';

const DAY_START_MINUTES = toMinutes('09:00');
const DAY_END_MINUTES = toMinutes('18:00');
const DAY_TOTAL_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

type TimelineItem = {
  id: string;
  start: string;
  end: string;
  title: string;
  detail: string;
  type?: 'appointment' | 'break';
  tone?: 'cut' | 'style' | 'care';
};

type TimelineHint = {
  id: string;
  start: string;
  end: string;
  label: string;
  variant: 'best' | 'available' | 'unavailable';
};

type BestTime = {
  id: string;
  time: string;
  label: string;
  group: 'Сутрин' | 'Следобед' | 'По-късно';
  selected?: boolean;
};

type UnavailableTime = {
  id: string;
  time: string;
  reason: string;
};

const timeLabels = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

const appointments: TimelineItem[] = [
  {
    id: 'lora',
    start: '09:05',
    end: '09:40',
    title: 'Лора Димитрова',
    detail: 'Подстригване',
    tone: 'cut',
  },
  {
    id: 'irina',
    start: '10:20',
    end: '11:00',
    title: 'Ирина Стоянова',
    detail: 'Стайлинг',
    tone: 'style',
  },
  {
    id: 'break',
    start: '12:00',
    end: '12:45',
    title: 'Обедна почивка',
    detail: 'Почивка',
    type: 'break',
  },
  {
    id: 'simona',
    start: '15:30',
    end: '16:30',
    title: 'Симона Димитрова',
    detail: 'Подстригване',
    tone: 'cut',
  },
  {
    id: 'victoria',
    start: '17:00',
    end: '18:00',
    title: 'Виктория Иванова',
    detail: 'Кератинова терапия',
    tone: 'care',
  },
];

const bestTimes: BestTime[] = [
  {
    id: 'morning-best',
    time: '11:00–12:00',
    label: 'Най-добро',
    group: 'Сутрин',
    selected: true,
  },
  {
    id: 'afternoon-fit',
    time: '13:30–14:30',
    label: 'Подходящо',
    group: 'Следобед',
  },
  {
    id: 'afternoon-gap',
    time: '14:30–15:30',
    label: 'Запълва празнина',
    group: 'Следобед',
  },
  {
    id: 'later',
    time: '16:30–17:30',
    label: 'Възможно',
    group: 'По-късно',
  },
];

const unavailableTimes: UnavailableTime[] = [
  { id: 'break', time: '12:00–12:45', reason: 'Почивка' },
  { id: 'booked', time: '15:30–16:30', reason: 'Заето' },
  { id: 'short', time: '10:20–11:00', reason: 'Няма 60 мин' },
];

const timelineHints: TimelineHint[] = [
  {
    id: 'best-preview-window',
    start: '11:00',
    end: '12:00',
    label: 'Най-добро предложение',
    variant: 'best',
  },
  {
    id: 'afternoon-window',
    start: '13:30',
    end: '15:30',
    label: 'Свободен прозорец',
    variant: 'available',
  },
  {
    id: 'short-window',
    start: '10:20',
    end: '11:00',
    label: 'Няма 60 мин',
    variant: 'unavailable',
  },
];

export function BestTimesBoardConcept() {
  return (
    <main className={styles.shell} aria-label="SalonIQ Best Times Board">
      <TopToolbar />
      <div className={styles.canvas}>
        <section className={styles.contentGrid} aria-label="Преглед за избор на най-добър час">
          <div className={styles.leftStack}>
            <SpecialistFocusHeader />
            <DayTimeline />
          </div>
          <BestTimesPanel />
        </section>
      </div>
    </main>
  );
}

function TopToolbar() {
  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <div className={styles.logo}>SQ</div>
        <span>SalonIQ</span>
      </div>

      <div className={styles.dateNav} aria-label="Навигация по дата">
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

      <div className={styles.actions}>
        <button type="button" className={styles.specialistButton}>
          <UserRound aria-hidden="true" />
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
    <section className={styles.focusHeader} aria-label="Фокус върху специалист">
      <div className={styles.specialistIdentity}>
        <div className={styles.avatar}>НС</div>
        <div>
          <h1>Никол Стоянова</h1>
          <p>Колорист и стилист · Studio Aurora</p>
        </div>
      </div>

      <dl className={styles.focusFacts}>
        <div>
          <dt>Работно време</dt>
          <dd>09:00–18:00</dd>
        </div>
        <div>
          <dt>Днес</dt>
          <dd>5 резервации днес</dd>
        </div>
        <div>
          <dt>Предложени часове</dt>
          <dd>3 препоръчани часа</dd>
        </div>
      </dl>
    </section>
  );
}

function DayTimeline() {
  return (
    <section className={styles.timelineCard} aria-label="Ден на Никол Стоянова">
      <div className={styles.timelineHeader}>
        <div>
          <p>Никол Стоянова · един специалист</p>
          <h2>Дневен график</h2>
        </div>
        <span className={styles.previewBadge}>Само preview</span>
      </div>

      <div className={styles.timeline}>
        <div className={styles.timeSpine} aria-hidden="true">
          {timeLabels.map((label) => (
            <span key={label} style={timePositionStyle(label)}>
              {label}
            </span>
          ))}
        </div>
        <div className={styles.lane}>
          {timeLabels.map((label) => (
            <span key={label} className={styles.hourLine} style={timePositionStyle(label)} aria-hidden="true" />
          ))}
          {timelineHints.map((hint) => (
            <TimelineHintBlock key={hint.id} hint={hint} />
          ))}
          {appointments.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
          <PreviewSlot />
        </div>
      </div>
    </section>
  );
}

function AppointmentCard({ appointment }: { appointment: TimelineItem }) {
  return (
    <article
      className={appointment.type === 'break' ? styles.breakCard : styles.appointmentCard}
      data-tone={appointment.tone}
      style={timelineBlockStyle(appointment.start, appointment.end)}
    >
      <span className={styles.appointmentTime}>{`${appointment.start}–${appointment.end}`}</span>
      <strong>{appointment.title}</strong>
      <small>{appointment.detail}</small>
    </article>
  );
}

function TimelineHintBlock({ hint }: { hint: TimelineHint }) {
  return (
    <div
      className={styles.timelineHint}
      data-variant={hint.variant}
      style={timelineBlockStyle(hint.start, hint.end)}
      aria-hidden="true"
    >
      <span>{hint.label}</span>
    </div>
  );
}

function PreviewSlot() {
  return (
    <article className={styles.previewSlot} style={timelineBlockStyle('11:00', '12:00')} aria-label="Preview за Анна Петрова">
      <div className={styles.previewSlotHeader}>
        <span>11:00–12:00</span>
        <div className={styles.previewChips}>
          <em>Най-добро</em>
          <em>Избран</em>
        </div>
      </div>
      <strong>Анна Петрова</strong>
      <small>Боядисване корени · 60 мин</small>
      <p>Само preview · часът още не е записан</p>
    </article>
  );
}

function BestTimesPanel() {
  return (
    <aside className={styles.assistantPanel} aria-label="Най-добри часове за избраната заявка">
      <SelectedRequestCard />

      <div className={styles.panelHeader}>
        <div>
          <p>Временен асистент</p>
          <h2>Предложени часове</h2>
          <span>За Анна Петрова · Боядисване корени · 60 мин</span>
        </div>
        <Sparkles aria-hidden="true" />
      </div>

      <div className={styles.tabs} aria-label="Филтър за часове">
        <button type="button" className={styles.activeTab}>
          Най-добри
        </button>
        <button type="button">Всички</button>
      </div>

      <div className={styles.bestTimeGroups}>
        {(['Сутрин', 'Следобед', 'По-късно'] as const).map((group) => (
          <section key={group} className={styles.timeGroup} aria-label={group}>
            <h3>{group}</h3>
            {bestTimes
              .filter((time) => time.group === group)
              .map((time) => (
                <BestTimeOption key={time.id} option={time} />
              ))}
          </section>
        ))}
      </div>

      <section className={styles.unavailableList} aria-label="Недостъпни часове">
        {unavailableTimes.map((time) => (
          <div key={time.id}>
            <span>{`${time.time} · ${time.reason}`}</span>
          </div>
        ))}
      </section>

      <ConfirmationCard />
    </aside>
  );
}

function SelectedRequestCard() {
  return (
    <section className={styles.requestCard} aria-label="Избрана заявка">
      <div>
        <span>Избрана заявка</span>
        <h2>Анна Петрова</h2>
      </div>
      <dl>
        <div>
          <dt>Услуга</dt>
          <dd>Боядисване корени</dd>
        </div>
        <div>
          <dt>Време</dt>
          <dd>60 мин</dd>
        </div>
        <div>
          <dt>Предпочитание</dt>
          <dd>Предпочита следобед</dd>
        </div>
      </dl>
    </section>
  );
}

function BestTimeOption({ option }: { option: BestTime }) {
  return (
    <button type="button" className={option.selected ? styles.selectedTimeOption : styles.timeOption}>
      <span>{option.time}</span>
      <strong>{option.label}</strong>
      {option.selected ? <em>Избран</em> : null}
    </button>
  );
}

function ConfirmationCard() {
  return (
    <section className={styles.confirmationCard} aria-label="Потвърждение на избран час">
      <div className={styles.confirmationSummary}>
        <div>
          <span>Избран час</span>
          <strong>11:00–12:00</strong>
        </div>
        <p>Само preview · часът още не е записан</p>
      </div>
      <div className={styles.confirmationActions}>
        <button type="button" className={styles.confirmButton}>
          <Check aria-hidden="true" />
          Постави резервация
        </button>
        <button type="button" className={styles.cancelButton}>
          <X aria-hidden="true" />
          Отказ
        </button>
      </div>
    </section>
  );
}

function timelineBlockStyle(start: string, end: string): CSSProperties {
  const startOffset = toMinutes(start) - DAY_START_MINUTES;
  const duration = toMinutes(end) - toMinutes(start);

  return {
    '--top': `${(startOffset / DAY_TOTAL_MINUTES) * 100}%`,
    '--height': `${(duration / DAY_TOTAL_MINUTES) * 100}%`,
  } as CSSProperties;
}

function timePositionStyle(time: string): CSSProperties {
  return {
    '--top': `${((toMinutes(time) - DAY_START_MINUTES) / DAY_TOTAL_MINUTES) * 100}%`,
  } as CSSProperties;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}
