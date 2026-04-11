export enum AppointmentStatus {
  PENDING = 'pending',
  PROPOSAL_PENDING = 'proposal_pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum NotificationJobType {
  BOOKING_CONFIRMED = 'booking-confirmed',
  BOOKING_PENDING = 'booking-pending',
  BOOKING_PROPOSAL = 'booking-proposal',
  BOOKING_APPROVED = 'booking-approved',
  BOOKING_CANCELLED_CLIENT = 'booking-cancelled-client',
  BOOKING_CANCELLED_BUSINESS = 'booking-cancelled-business',
  BOOKING_RESCHEDULED = 'booking-rescheduled',
  REMINDER_24H = 'reminder-24h',
  REMINDER_2H = 'reminder-2h',
  NO_SHOW = 'no-show',
  BIRTHDAY = 'birthday',
  WAITLIST_AVAILABLE = 'waitlist-available',
  STATUS_CHANGED = 'status-changed',
}

export enum NotificationChannel {
  TELEGRAM = 'telegram',
  SMS = 'sms',
  EMAIL = 'email',
  VIBER = 'viber',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read',
}
