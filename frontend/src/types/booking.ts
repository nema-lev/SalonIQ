export interface BookingFormData {
  // Step 1 — Услуга
  serviceId: string;
  serviceName: string;
  serviceDuration: number;
  servicePrice: number | null;

  // Step 2 — Специалист
  staffId: string;
  staffName: string;

  // Step 3 — Дата & Час
  date: string;           // yyyy-MM-dd
  timeSlot: string;       // HH:mm
  startAt: string;        // ISO 8601
  displayDate: string;    // "Вторник, 15 април 2025 г."

  // Step 4 — Данни за клиента
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  notes?: string;
  consentGiven: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[];
  color: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  color: string;
  staff_ids: string[];
}
