'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Grip,
  Layers3,
  Sparkles,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import styles from './calendar-concepts.module.css';

type ConceptKey = 'focus' | 'finder' | 'command';
type StaffKey = 'maria' | 'nikol' | 'anna' | 'all';
type AppointmentStatus = 'confirmed' | 'pending' | 'break';
type SlotKind = 'best' | 'open' | 'tight' | 'invalid';

interface StaffMember {
  key: Exclude<StaffKey, 'all'>;
  name: string;
  role: string;
  accent: string;
}

interface ServiceItem {
  id: string;
  name: string;
  duration: number;
  price: string;
  color: string;
}

interface RequestItem {
  id: string;
  client: string;
  serviceId: string;
  preferred: string;
  note: string;
  urgency: 'soft' | 'hot' | 'calm';
}

interface AppointmentItem {
  id: string;
  staff: Exclude<StaffKey, 'all'>;
  client: string;
  serviceId: string;
  start: number;
  duration: number;
  status: AppointmentStatus;
  tone: string;
  note: string;
}

interface CandidateSlot {
  id: string;
  staff: Exclude<StaffKey, 'all'>;
  start: number;
  duration: number;
  kind: SlotKind;
  score: string;
  reason: string;
}

const concepts: Array<{ key: ConceptKey; label: string; short: string }> = [
  { key: 'focus', label: 'Concept A: Focus Day Board', short: 'Един специалист' },
  { key: 'finder', label: 'Concept B: Slot Finder', short: 'Постави блока' },
  { key: 'command', label: 'Concept C: Command Center', short: 'Дневен контрол' },
];

const staff: StaffMember[] = [
  { key: 'maria', name: 'Мария', role: 'Коса и цвят', accent: '#2563eb' },
  { key: 'nikol', name: 'Никол', role: 'Маникюр', accent: '#db2777' },
  { key: 'anna', name: 'Анна', role: 'Козметика', accent: '#059669' },
];

const services: ServiceItem[] = [
  { id: 'color', name: 'Боядисване и сешоар', duration: 120, price: '145 лв.', color: '#2563eb' },
  { id: 'manicure', name: 'Гел лак', duration: 60, price: '55 лв.', color: '#db2777' },
  { id: 'facial', name: 'Почистваща терапия', duration: 75, price: '95 лв.', color: '#059669' },
  { id: 'cut', name: 'Подстригване', duration: 45, price: '42 лв.', color: '#f97316' },
];

const requests: RequestItem[] = [
  {
    id: 'req-iva',
    client: 'Ива Петрова',
    serviceId: 'color',
    preferred: 'днес след 13:00',
    note: 'Иска Мария, може да изчака 15 мин.',
    urgency: 'hot',
  },
  {
    id: 'req-elena',
    client: 'Елена Георгиева',
    serviceId: 'manicure',
    preferred: 'преди 15:00',
    note: 'Къс прозорец, предпочита Никол.',
    urgency: 'soft',
  },
  {
    id: 'req-raya',
    client: 'Рая Димитрова',
    serviceId: 'facial',
    preferred: 'след работа',
    note: 'Първо посещение, търси спокоен слот.',
    urgency: 'calm',
  },
];

const appointments: AppointmentItem[] = [
  {
    id: 'a1',
    staff: 'maria',
    client: 'Силвия Колева',
    serviceId: 'cut',
    start: 9 * 60,
    duration: 45,
    status: 'confirmed',
    tone: '#f97316',
    note: 'Потвърден час',
  },
  {
    id: 'a2',
    staff: 'maria',
    client: 'Даниела Стоянова',
    serviceId: 'color',
    start: 10 * 60,
    duration: 120,
    status: 'confirmed',
    tone: '#2563eb',
    note: 'Дълъг блок, няма място за overlap',
  },
  {
    id: 'a3',
    staff: 'maria',
    client: 'Почивка',
    serviceId: 'break',
    start: 12 * 60 + 30,
    duration: 30,
    status: 'break',
    tone: '#64748b',
    note: 'Блокиран прозорец',
  },
  {
    id: 'a4',
    staff: 'maria',
    client: 'Нели Ангелова',
    serviceId: 'manicure',
    start: 13 * 60 + 15,
    duration: 60,
    status: 'pending',
    tone: '#db2777',
    note: 'Чака потвърждение',
  },
  {
    id: 'a5',
    staff: 'maria',
    client: 'Калина Русева',
    serviceId: 'cut',
    start: 14 * 60 + 30,
    duration: 45,
    status: 'confirmed',
    tone: '#f97316',
    note: 'Част от натоварен прозорец',
  },
  {
    id: 'a6',
    staff: 'maria',
    client: 'Боряна Илиева',
    serviceId: 'facial',
    start: 15 * 60 + 15,
    duration: 75,
    status: 'confirmed',
    tone: '#059669',
    note: 'Част от натоварен прозорец',
  },
  {
    id: 'a7',
    staff: 'nikol',
    client: 'Виктория Павлова',
    serviceId: 'manicure',
    start: 9 * 60 + 30,
    duration: 60,
    status: 'confirmed',
    tone: '#db2777',
    note: 'Потвърден час',
  },
  {
    id: 'a8',
    staff: 'nikol',
    client: 'Мая Тодорова',
    serviceId: 'manicure',
    start: 11 * 60,
    duration: 60,
    status: 'confirmed',
    tone: '#db2777',
    note: 'Кратък блок',
  },
  {
    id: 'a9',
    staff: 'nikol',
    client: 'Почивка',
    serviceId: 'break',
    start: 13 * 60,
    duration: 30,
    status: 'break',
    tone: '#64748b',
    note: 'Блокирано',
  },
  {
    id: 'a10',
    staff: 'anna',
    client: 'Лора Николова',
    serviceId: 'facial',
    start: 10 * 60 + 15,
    duration: 75,
    status: 'confirmed',
    tone: '#059669',
    note: 'Потвърден час',
  },
  {
    id: 'a11',
    staff: 'anna',
    client: 'Галя Пенева',
    serviceId: 'cut',
    start: 14 * 60,
    duration: 45,
    status: 'confirmed',
    tone: '#f97316',
    note: 'Отворен прозорец след това',
  },
];

const candidateSlots: CandidateSlot[] = [
  {
    id: 'slot-1',
    staff: 'maria',
    start: 16 * 60 + 45,
    duration: 120,
    kind: 'best',
    score: '96',
    reason: 'пасва точно след натоварения блок',
  },
  {
    id: 'slot-2',
    staff: 'anna',
    start: 12 * 60,
    duration: 120,
    kind: 'best',
    score: '91',
    reason: 'тих прозорец без сблъсък',
  },
  {
    id: 'slot-3',
    staff: 'nikol',
    start: 14 * 60,
    duration: 60,
    kind: 'open',
    score: '84',
    reason: 'добър слот за кратка услуга',
  },
  {
    id: 'slot-4',
    staff: 'maria',
    start: 12 * 60 + 30,
    duration: 120,
    kind: 'invalid',
    score: '0',
    reason: 'удря почивка и чакащ час',
  },
  {
    id: 'slot-5',
    staff: 'maria',
    start: 9 * 60 + 45,
    duration: 120,
    kind: 'invalid',
    score: '0',
    reason: 'заето от боядисване',
  },
  {
    id: 'slot-6',
    staff: 'anna',
    start: 15 * 60,
    duration: 75,
    kind: 'tight',
    score: '72',
    reason: 'пасва, но оставя малък буфер',
  },
];

const timeMarks = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const dayStart = 9 * 60;
const pixelsPerMinute = 1.18;
const boardHeight = (18 * 60 - dayStart) * pixelsPerMinute;

function serviceById(id: string) {
  return services.find((service) => service.id === id);
}

function staffByKey(key: Exclude<StaffKey, 'all'>) {
  return staff.find((item) => item.key === key);
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function CalendarConceptPlayground() {
  const [activeConcept, setActiveConcept] = useState<ConceptKey>('focus');
  const [activeStaff, setActiveStaff] = useState<StaffKey>('maria');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('a2');
  const [selectedRequestId, setSelectedRequestId] = useState('req-iva');
  const [ghostSlotId, setGhostSlotId] = useState('slot-1');
  const [badSlotId, setBadSlotId] = useState<string | null>(null);

  const selectedAppointment = appointments.find((item) => item.id === selectedAppointmentId) ?? appointments[0];
  const selectedRequest = requests.find((item) => item.id === selectedRequestId) ?? requests[0];

  const visibleStaff = useMemo(
    () => (activeStaff === 'all' ? staff : staff.filter((item) => item.key === activeStaff)),
    [activeStaff],
  );

  const handleSlotClick = (slot: CandidateSlot) => {
    if (slot.kind === 'invalid') {
      setBadSlotId(slot.id);
      return;
    }

    setBadSlotId(null);
    setGhostSlotId(slot.id);
  };

  return (
    <section className={styles.playground} aria-label="Calendar UX concept playground">
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Изолиран UX playground</p>
          <h2>Календарът като визуална дъска за решения</h2>
          <p className={styles.heroCopy}>
            Mock данни, без запис, без API логика, без промяна в production Calendar V2.
          </p>
        </div>
        <div className={styles.heroStats} aria-label="Дневен статус">
          <div>
            <span>7</span>
            <small>потвърдени</small>
          </div>
          <div>
            <span>3</span>
            <small>заявки</small>
          </div>
          <div>
            <span>1</span>
            <small>чакаща</small>
          </div>
        </div>
      </div>

      <div className={styles.conceptSwitcher} aria-label="Избор на концепция">
        {concepts.map((concept) => (
          <button
            key={concept.key}
            type="button"
            className={cx(styles.conceptButton, activeConcept === concept.key && styles.conceptButtonActive)}
            onClick={() => setActiveConcept(concept.key)}
          >
            <span>{concept.label}</span>
            <small>{concept.short}</small>
          </button>
        ))}
      </div>

      {activeConcept === 'focus' && (
        <FocusDayBoard
          activeStaff={activeStaff}
          selectedAppointment={selectedAppointment}
          selectedRequest={selectedRequest}
          visibleStaff={visibleStaff}
          onSelectAppointment={setSelectedAppointmentId}
          onSelectRequest={setSelectedRequestId}
          onSetStaff={setActiveStaff}
          onSlotClick={handleSlotClick}
          ghostSlotId={ghostSlotId}
          badSlotId={badSlotId}
        />
      )}

      {activeConcept === 'finder' && (
        <SlotFinder
          selectedRequest={selectedRequest}
          selectedAppointment={selectedAppointment}
          ghostSlotId={ghostSlotId}
          badSlotId={badSlotId}
          onSelectRequest={setSelectedRequestId}
          onSelectAppointment={setSelectedAppointmentId}
          onSlotClick={handleSlotClick}
        />
      )}

      {activeConcept === 'command' && (
        <CommandCenter
          selectedAppointment={selectedAppointment}
          selectedRequest={selectedRequest}
          onSelectAppointment={setSelectedAppointmentId}
          onSelectRequest={setSelectedRequestId}
          onSlotClick={handleSlotClick}
          ghostSlotId={ghostSlotId}
          badSlotId={badSlotId}
        />
      )}
    </section>
  );
}

function FocusDayBoard({
  activeStaff,
  selectedAppointment,
  selectedRequest,
  visibleStaff,
  ghostSlotId,
  badSlotId,
  onSelectAppointment,
  onSelectRequest,
  onSetStaff,
  onSlotClick,
}: {
  activeStaff: StaffKey;
  selectedAppointment: AppointmentItem;
  selectedRequest: RequestItem;
  visibleStaff: StaffMember[];
  ghostSlotId: string;
  badSlotId: string | null;
  onSelectAppointment: (id: string) => void;
  onSelectRequest: (id: string) => void;
  onSetStaff: (key: StaffKey) => void;
  onSlotClick: (slot: CandidateSlot) => void;
}) {
  const matchingSlots = candidateSlots.filter((slot) => slot.staff === 'maria' || activeStaff === 'all');

  return (
    <div className={styles.focusLayout}>
      <section className={styles.focusTop}>
        <div className={styles.staffSwitch}>
          {staff.map((person) => (
            <button
              key={person.key}
              type="button"
              className={cx(styles.staffChip, activeStaff === person.key && styles.staffChipActive)}
              onClick={() => onSetStaff(person.key)}
            >
              <span style={{ background: person.accent }} />
              {person.name}
            </button>
          ))}
          <button
            type="button"
            className={cx(styles.staffChip, activeStaff === 'all' && styles.staffChipActive)}
            onClick={() => onSetStaff('all')}
          >
            <span className={styles.allDot} />
            Всички
          </button>
        </div>

        <div className={styles.requestTray}>
          {requests.map((request) => {
            const service = serviceById(request.serviceId);
            return (
              <button
                key={request.id}
                type="button"
                className={cx(styles.looseBlock, selectedRequest.id === request.id && styles.looseBlockActive)}
                onClick={() => onSelectRequest(request.id)}
              >
                <Grip className={styles.blockGrip} aria-hidden="true" />
                <span>{request.client}</span>
                <strong>{service?.duration} мин.</strong>
                <small>{service?.name}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.focusBoard}>
        <div className={styles.timelineShell}>
          <div className={styles.boardHeader}>
            <div>
              <p>Днес, 20 май</p>
              <h3>{activeStaff === 'all' ? 'Всички специалисти' : `${visibleStaff[0]?.name}: фокус ден`}</h3>
            </div>
            <div className={styles.fitLegend}>
              <span className={styles.legendFree}>Свободно</span>
              <span className={styles.legendBusy}>Заето</span>
              <span className={styles.legendGhost}>Preview</span>
            </div>
          </div>

          <div
            className={cx(styles.timelineBoard, activeStaff === 'all' && styles.timelineBoardAll)}
            style={{ minHeight: boardHeight + 96 }}
          >
            <div className={styles.timeRail}>
              {timeMarks.map((hour) => (
                <span key={hour} style={{ top: (hour * 60 - dayStart) * pixelsPerMinute }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {visibleStaff.map((person) => (
              <div key={person.key} className={styles.dayLane}>
                {activeStaff === 'all' && (
                  <div className={styles.laneName} style={{ borderColor: person.accent }}>
                    {person.name}
                  </div>
                )}
                <TimelineGrid />
                <FreeGapButton
                  slot={candidateSlots[0]}
                  selectedRequest={selectedRequest}
                  ghostSlotId={ghostSlotId}
                  badSlotId={badSlotId}
                  onSlotClick={onSlotClick}
                />
                {person.key === 'maria' && (
                  <FreeGapButton
                    slot={candidateSlots[3]}
                    selectedRequest={selectedRequest}
                    ghostSlotId={ghostSlotId}
                    badSlotId={badSlotId}
                    onSlotClick={onSlotClick}
                  />
                )}
                {appointments
                  .filter((appointment) => appointment.staff === person.key)
                  .map((appointment) => (
                    <AppointmentBlock
                      key={appointment.id}
                      appointment={appointment}
                      selected={selectedAppointment.id === appointment.id}
                      onSelect={onSelectAppointment}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.floatInspector}>
          <div className={styles.inspectorHandle} />
          <p className={styles.eyebrow}>Избран блок</p>
          <h3>{selectedAppointment.client}</h3>
          <dl>
            <div>
              <dt>Час</dt>
              <dd>
                {formatTime(selectedAppointment.start)} - {formatTime(selectedAppointment.start + selectedAppointment.duration)}
              </dd>
            </div>
            <div>
              <dt>Услуга</dt>
              <dd>{serviceById(selectedAppointment.serviceId)?.name ?? 'Почивка'}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{selectedAppointment.status === 'pending' ? 'Чака потвърждение' : selectedAppointment.note}</dd>
            </div>
          </dl>
          <div className={styles.actionRow}>
            <button type="button">
              <Check size={16} />
              Preview OK
            </button>
            <button type="button">
              <X size={16} />
              Откажи
            </button>
          </div>
        </div>
      </section>

      <div className={styles.microSlots}>
        {matchingSlots.slice(0, 4).map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={cx(
              styles.microSlot,
              slot.kind === 'invalid' && styles.microSlotInvalid,
              ghostSlotId === slot.id && styles.microSlotGhost,
            )}
            onClick={() => onSlotClick(slot)}
          >
            <span>{formatTime(slot.start)}</span>
            <small>{slot.reason}</small>
            {badSlotId === slot.id && <strong>Не пасва тук</strong>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotFinder({
  selectedRequest,
  selectedAppointment,
  ghostSlotId,
  badSlotId,
  onSelectRequest,
  onSelectAppointment,
  onSlotClick,
}: {
  selectedRequest: RequestItem;
  selectedAppointment: AppointmentItem;
  ghostSlotId: string;
  badSlotId: string | null;
  onSelectRequest: (id: string) => void;
  onSelectAppointment: (id: string) => void;
  onSlotClick: (slot: CandidateSlot) => void;
}) {
  const selectedService = serviceById(selectedRequest.serviceId);

  return (
    <div className={styles.finderLayout}>
      <aside className={styles.piecePanel}>
        <p className={styles.eyebrow}>1. Избери заявка</p>
        <div className={styles.requestStack}>
          {requests.map((request) => {
            const service = serviceById(request.serviceId);
            return (
              <button
                key={request.id}
                type="button"
                className={cx(styles.requestPiece, selectedRequest.id === request.id && styles.requestPieceActive)}
                onClick={() => onSelectRequest(request.id)}
              >
                <span className={styles.pieceIcon}>
                  <Layers3 size={18} />
                </span>
                <span>
                  <strong>{request.client}</strong>
                  <small>{service?.name}</small>
                </span>
                <em>{service?.duration} мин.</em>
              </button>
            );
          })}
        </div>
        <div className={styles.activePiece}>
          <Sparkles size={18} />
          <span>
            <strong>{selectedRequest.client}</strong>
            <small>
              {selectedService?.duration} мин. блок · {selectedRequest.preferred}
            </small>
          </span>
        </div>
      </aside>

      <section className={styles.finderBoard}>
        <div className={styles.finderHeader}>
          <div>
            <p className={styles.eyebrow}>2. Най-добри места</p>
            <h3>Слотът светва само ако блокът пасва</h3>
          </div>
          <div className={styles.pill}>без реален запис</div>
        </div>

        <div className={styles.recommendations}>
          {candidateSlots
            .filter((slot) => slot.kind === 'best')
            .map((slot, index) => (
              <button
                key={slot.id}
                type="button"
                className={cx(styles.recommendation, ghostSlotId === slot.id && styles.recommendationActive)}
                onClick={() => onSlotClick(slot)}
              >
                <strong>#{index + 1}</strong>
                <span>
                  {staffByKey(slot.staff)?.name} · {formatTime(slot.start)}
                </span>
                <small>{slot.score}% fit</small>
              </button>
            ))}
        </div>

        <div className={styles.slotMatrix}>
          {candidateSlots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={cx(
                styles.slotCard,
                styles[`slot-${slot.kind}`],
                ghostSlotId === slot.id && styles.slotGhost,
                badSlotId === slot.id && styles.slotBad,
              )}
              onClick={() => onSlotClick(slot)}
            >
              <span className={styles.slotScore}>{slot.kind === 'invalid' ? <X size={18} /> : slot.score}</span>
              <strong>
                {staffByKey(slot.staff)?.name} · {formatTime(slot.start)}
              </strong>
              <small>{slot.reason}</small>
              {ghostSlotId === slot.id && slot.kind !== 'invalid' && (
                <em>
                  <ArrowRight size={14} />
                  Ghost preview
                </em>
              )}
              {badSlotId === slot.id && <b>Не пасва тук</b>}
            </button>
          ))}
        </div>
      </section>

      <aside className={styles.previewPanel}>
        <p className={styles.eyebrow}>3. Контекст</p>
        <button
          type="button"
          className={styles.previewAppointment}
          onClick={() => onSelectAppointment(selectedAppointment.id)}
        >
          <Clock3 size={18} />
          <span>
            <strong>{selectedAppointment.client}</strong>
            <small>
              {formatTime(selectedAppointment.start)} · {selectedAppointment.duration} мин.
            </small>
          </span>
        </button>
        <div className={styles.fitPreview}>
          <div className={styles.fitBlock} />
          <div className={styles.fitGap} />
          <div className={styles.fitBlockSmall} />
        </div>
        <p className={styles.previewCopy}>Заетото не се избира. Свободният прозорец показва къде ще падне блокът.</p>
      </aside>
    </div>
  );
}

function CommandCenter({
  selectedAppointment,
  selectedRequest,
  ghostSlotId,
  badSlotId,
  onSelectAppointment,
  onSelectRequest,
  onSlotClick,
}: {
  selectedAppointment: AppointmentItem;
  selectedRequest: RequestItem;
  ghostSlotId: string;
  badSlotId: string | null;
  onSelectAppointment: (id: string) => void;
  onSelectRequest: (id: string) => void;
  onSlotClick: (slot: CandidateSlot) => void;
}) {
  return (
    <div className={styles.commandLayout}>
      <section className={styles.commandSummary}>
        <div className={styles.controlState}>
          <CircleDot size={18} />
          <span>
            <strong>Денят е под контрол</strong>
            <small>1 чакащо решение · 2 добри прозореца</small>
          </span>
        </div>
        <div className={styles.commandMetric}>
          <strong>83%</strong>
          <small>заетост</small>
        </div>
        <div className={styles.commandMetric}>
          <strong>38 мин.</strong>
          <small>среден буфер</small>
        </div>
        <div className={styles.commandMetricHot}>
          <strong>1</strong>
          <small>рисков overlap</small>
        </div>
      </section>

      <section className={styles.commandMain}>
        <div className={styles.commandBoard}>
          <div className={styles.commandBoardHead}>
            <div>
              <p className={styles.eyebrow}>Централна дъска</p>
              <h3>Мария · днес</h3>
            </div>
            <button type="button" className={styles.commandPrimary}>
              <Zap size={16} />
              Mock действие
            </button>
          </div>
          <div className={styles.commandTimeline}>
            {appointments
              .filter((appointment) => appointment.staff === 'maria')
              .map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className={cx(
                    styles.commandEvent,
                    selectedAppointment.id === appointment.id && styles.commandEventActive,
                    appointment.status === 'break' && styles.commandEventBreak,
                  )}
                  onClick={() => onSelectAppointment(appointment.id)}
                >
                  <span style={{ background: appointment.tone }} />
                  <strong>{appointment.client}</strong>
                  <small>
                    {formatTime(appointment.start)} · {appointment.duration} мин.
                  </small>
                </button>
              ))}
            <button
              type="button"
              className={cx(styles.commandGap, ghostSlotId === 'slot-1' && styles.commandGapGhost)}
              onClick={() => onSlotClick(candidateSlots[0])}
            >
              16:45 свободен прозорец
            </button>
          </div>
        </div>

        <aside className={styles.commandQueue}>
          <div className={styles.commandQueueHead}>
            <p className={styles.eyebrow}>Опашка</p>
            <span>{requests.length}</span>
          </div>
          {requests.map((request) => (
            <button
              key={request.id}
              type="button"
              className={cx(styles.queueItem, selectedRequest.id === request.id && styles.queueItemActive)}
              onClick={() => onSelectRequest(request.id)}
            >
              <UserRound size={16} />
              <span>
                <strong>{request.client}</strong>
                <small>{serviceById(request.serviceId)?.name}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          <button
            type="button"
            className={cx(styles.queueInvalid, badSlotId === 'slot-4' && styles.queueInvalidActive)}
            onClick={() => onSlotClick(candidateSlots[3])}
          >
            <X size={16} />
            <span>
              <strong>12:30 не пасва</strong>
              <small>почивка + чакащ час</small>
            </span>
          </button>
        </aside>
      </section>

      <section className={styles.contextBar}>
        <div>
          <p className={styles.eyebrow}>Контекст без тежък rail</p>
          <h3>{selectedAppointment.client}</h3>
          <span>
            {serviceById(selectedAppointment.serviceId)?.name ?? 'Блокиран прозорец'} ·{' '}
            {formatTime(selectedAppointment.start)}
          </span>
        </div>
        <div className={styles.contextActions}>
          <button type="button">Покажи</button>
          <button type="button">Премести preview</button>
          <button type="button">Затвори</button>
        </div>
      </section>
    </div>
  );
}

function TimelineGrid() {
  return (
    <div className={styles.gridLines} aria-hidden="true">
      {timeMarks.map((hour) => (
        <span key={hour} style={{ top: (hour * 60 - dayStart) * pixelsPerMinute }} />
      ))}
    </div>
  );
}

function AppointmentBlock({
  appointment,
  selected,
  onSelect,
}: {
  appointment: AppointmentItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const service = serviceById(appointment.serviceId);
  return (
    <button
      type="button"
      className={cx(
        styles.appointmentBlock,
        selected && styles.appointmentBlockSelected,
        appointment.status === 'break' && styles.breakBlock,
        appointment.status === 'pending' && styles.pendingBlock,
      )}
      style={{
        top: (appointment.start - dayStart) * pixelsPerMinute,
        height: appointment.duration * pixelsPerMinute,
        borderColor: appointment.tone,
      }}
      onClick={() => onSelect(appointment.id)}
    >
      <span className={styles.blockTime}>
        {formatTime(appointment.start)} - {formatTime(appointment.start + appointment.duration)}
      </span>
      <strong>{appointment.client}</strong>
      <small>{service?.name ?? appointment.note}</small>
    </button>
  );
}

function FreeGapButton({
  slot,
  selectedRequest,
  ghostSlotId,
  badSlotId,
  onSlotClick,
}: {
  slot: CandidateSlot;
  selectedRequest: RequestItem;
  ghostSlotId: string;
  badSlotId: string | null;
  onSlotClick: (slot: CandidateSlot) => void;
}) {
  const selectedService = serviceById(selectedRequest.serviceId);
  return (
    <button
      type="button"
      className={cx(
        styles.freeGap,
        slot.kind === 'invalid' && styles.freeGapInvalid,
        ghostSlotId === slot.id && styles.freeGapGhost,
      )}
      style={{
        top: (slot.start - dayStart) * pixelsPerMinute,
        height: Math.max(54, slot.duration * pixelsPerMinute),
      }}
      onClick={() => onSlotClick(slot)}
    >
      <span>{slot.kind === 'invalid' ? 'Не пасва' : 'Постави тук'}</span>
      <small>
        {formatTime(slot.start)} · {selectedService?.duration} мин.
      </small>
      {badSlotId === slot.id && <strong>Не пасва тук</strong>}
    </button>
  );
}
