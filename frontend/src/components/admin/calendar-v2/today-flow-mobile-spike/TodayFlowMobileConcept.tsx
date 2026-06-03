import type { ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  MessageCircle,
  Pencil,
  UserRound,
  X,
} from 'lucide-react';
import styles from './today-flow-mobile-concept.module.css';

type FlowItem = {
  id: string;
  time: string;
  client: string;
  service: string;
  section: 'Сега' | 'Следва' | 'По-късно';
  status?: string;
  selected?: boolean;
  muted?: boolean;
};

const flowItems: FlowItem[] = [
  {
    id: 'lora',
    time: '09:05–09:40',
    client: 'Лора Димитрова',
    service: 'Подстригване',
    section: 'Сега',
  },
  {
    id: 'irina',
    time: '10:20–11:00',
    client: 'Ирина Стоянова',
    service: 'Стайлинг',
    section: 'Следва',
  },
  {
    id: 'anna-preview',
    time: '11:00–12:00',
    client: 'Анна Петрова',
    service: 'Боядисване корени',
    section: 'Следва',
    status: 'Само preview',
    selected: true,
  },
  {
    id: 'break',
    time: '12:00–12:45',
    client: 'Обедна почивка',
    service: 'Почивка',
    section: 'Следва',
    muted: true,
  },
  {
    id: 'simona',
    time: '15:30–16:30',
    client: 'Симона Димитрова',
    service: 'Подстригване',
    section: 'По-късно',
  },
  {
    id: 'victoria',
    time: '17:00–18:00',
    client: 'Виктория Иванова',
    service: 'Кератинова терапия',
    section: 'По-късно',
  },
];

export function TodayFlowMobileConcept() {
  return (
    <main className={styles.shell} aria-label="SalonIQ Today Flow mobile concept">
      <MobilePhoneFrame>
        <MobileTopBar />
        <SpecialistCard />
        <NeedsActionCard />
        <TodayTimeline />
        <MobileBottomSheet />
      </MobilePhoneFrame>
    </main>
  );
}

function MobilePhoneFrame({ children }: { children: ReactNode }) {
  return (
    <section className={styles.phoneFrame} aria-label="Today Flow mobile preview">
      <div className={styles.phoneChrome} aria-hidden="true">
        <span />
      </div>
      <div className={styles.phoneScreen}>{children}</div>
    </section>
  );
}

function MobileTopBar() {
  return (
    <header className={styles.mobileTopBar}>
      <div className={styles.mobileBrand}>
        <div className={styles.logoMark}>SQ</div>
        <span>SalonIQ</span>
      </div>

      <div className={styles.dateCluster} aria-label="Дата">
        <span>Днес</span>
        <strong>25 май</strong>
      </div>

      <button type="button" className={styles.inboxButton} aria-label="Входящи заявки">
        <Bell aria-hidden="true" />
        <span>2</span>
      </button>
    </header>
  );
}

function SpecialistCard() {
  return (
    <section className={styles.specialistCard} aria-label="Избран специалист">
      <div className={styles.avatar}>НС</div>
      <div>
        <h1>Никол Стоянова</h1>
        <p>Колорист и стилист</p>
        <span>09:00–18:00</span>
      </div>
      <ChevronDown aria-hidden="true" />
    </section>
  );
}

function NeedsActionCard() {
  return (
    <section className={styles.needsActionCard} aria-label="Нуждае се от действие">
      <div>
        <span>Нуждае се от действие</span>
        <h2>Анна Петрова</h2>
        <p>Боядисване корени · 60 мин</p>
      </div>
      <div className={styles.recommendation}>
        <small>Препоръчан час</small>
        <strong>11:00</strong>
        <button type="button">Виж часове</button>
      </div>
    </section>
  );
}

function TodayTimeline() {
  const sections: FlowItem['section'][] = ['Сега', 'Следва', 'По-късно'];

  return (
    <section className={styles.timeline} aria-label="Today Flow timeline">
      <div className={styles.nowMarker}>
        <span />
        <strong>Сега</strong>
      </div>

      {sections.map((section) => (
        <section key={section} className={styles.timelineSection} aria-label={section}>
          <h2>{section}</h2>
          {flowItems
            .filter((item) => item.section === section)
            .map((item) => (
              <TimelineAppointmentCard key={item.id} item={item} />
            ))}
        </section>
      ))}
    </section>
  );
}

function TimelineAppointmentCard({ item }: { item: FlowItem }) {
  return (
    <article
      className={item.selected ? styles.selectedAppointment : item.muted ? styles.mutedAppointment : styles.appointmentCard}
      aria-label={`${item.time} ${item.client}`}
    >
      <div className={styles.timeRail}>
        <span>{item.time}</span>
      </div>
      <div className={styles.appointmentBody}>
        <div>
          <h3>{item.client}</h3>
          <p>{item.service}</p>
        </div>
        {item.status ? <strong>{item.status}</strong> : <small>Потвърден</small>}
      </div>
    </article>
  );
}

function MobileBottomSheet() {
  return (
    <section className={styles.bottomSheet} aria-label="Детайли за избрания preview час">
      <div className={styles.grabHandle} aria-hidden="true" />

      <div className={styles.sheetHeader}>
        <div>
          <span>Най-добро място за днес</span>
          <h2>Анна Петрова</h2>
          <p>11:00–12:00 · 60 мин</p>
          <small>Боядисване корени</small>
        </div>
        <div className={styles.previewBadge}>Само preview</div>
      </div>

      <p className={styles.unsavedCopy}>Само preview · часът още не е записан</p>

      <div className={styles.quickActions} aria-label="Бързи действия">
        <QuickActionButton icon={<Check aria-hidden="true" />} label="Постави" />
        <QuickActionButton icon={<MessageCircle aria-hidden="true" />} label="Съобщение" />
        <QuickActionButton icon={<Pencil aria-hidden="true" />} label="Промени" />
        <QuickActionButton icon={<UserRound aria-hidden="true" />} label="Клиент" />
        <QuickActionButton icon={<X aria-hidden="true" />} label="Отказ" />
      </div>

      <div className={styles.sheetActions}>
        <button type="button" className={styles.primaryAction}>
          Постави резервация
        </button>
        <button type="button" className={styles.secondaryAction}>
          Виж всички часове
        </button>
      </div>
    </section>
  );
}

function QuickActionButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button type="button" className={styles.quickAction}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
