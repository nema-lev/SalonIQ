import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  CalendarV2Appointment,
  CalendarV2CalendarBlock,
  CalendarV2DemandItem,
} from '..';
import {
  NATIVE_SCHEDULER_GEOMETRY,
  appointmentToRect,
  clampToBusinessHours,
  dateAndMinutesToIso,
  detectLocalOverlap,
  getCurrentTimeIndicatorMinutes,
  getCurrentTimeIndicatorTop,
  getPastPlacementOverlayHeight,
  getGridHeight,
  getMinutesFromDateTime,
  getResourceFromX,
  isSameLocalCalendarDate,
  minutesToPixels,
  slotFromPointer,
  snapToSlot,
  timeToY,
  yToTime,
  type NativeSchedulerResource,
} from './native-scheduler-geometry';
import {
  DEFAULT_PLACEMENT_DURATION_MINUTES,
  buildWaitlistPlacementSaveRequest,
  buildWaitlistPlacementSaveRequestIfFuture,
  commandPreviewLabel,
  createMoveAppointmentCommand,
  createPlaceRequestCommand,
  createPlaceRequestCommandPreview,
  detectLocalPlacementConflict,
  getPlacementDurationMinutes,
  hasPassedDragThreshold,
  isPastPlacementStart,
  usesFallbackPlacementDuration,
} from './native-scheduler-drag';
import { getNativeSchedulerCancelBookingIntent } from './native-scheduler-cancel-booking';
import { getNativeSchedulerConfirmBookingIntent } from './native-scheduler-confirm-booking';
import { buildManualBookingIntent } from './native-scheduler-manual-booking';
import {
  buildAppointmentRescheduleSaveRequestIfValid,
  getNativeSchedulerRescheduleBookingIntent,
} from './native-scheduler-reschedule-booking';
import {
  attemptNativeSchedulerPostWriteSync,
  runNativeSchedulerPostWriteMutation,
  shouldClearNativeSchedulerSelectionAfterPostWriteSync,
} from './native-scheduler-post-write-sync';
import {
  getCalendarV2ActionErrorMessage,
  getCalendarV2ActionErrorMessageForCategory,
  normalizeCalendarV2ActionError,
} from './native-scheduler-action-errors';

export type NativeSchedulerRegressionCheckResult = {
  name: string;
  passed: true;
};

type RegressionCheck = {
  name: string;
  run: () => void | Promise<void>;
};

const CHECK_DATE = new Date(2026, 4, 5);
const RESOURCES: NativeSchedulerResource[] = [
  { id: 'staff-1', name: 'Mira' },
  { id: 'staff-2', name: 'Boris' },
  { id: 'staff-3', name: 'Nina' },
  { id: 'staff-4', name: 'Ivo' },
];

const GRID_RECT = {
  left: 100,
  top: 200,
  width: RESOURCES.length * NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth,
  height: getGridHeight(),
};

const checks: RegressionCheck[] = [
  {
    name: 'geometry maps business hours and pixels consistently',
    run: () => {
      assertEqual(minutesToPixels(15), 30, '15 minutes should map to 30px');
      assertEqual(timeToY(8 * 60), 0, 'business start should map to top of grid');
      assertEqual(timeToY(20 * 60), getGridHeight(), 'business end should map to grid bottom');
      assertEqual(getMinutesFromDateTime(yToTime(0, CHECK_DATE)), 8 * 60, 'grid top should map to 08:00');
    },
  },
  {
    name: 'current-time indicator is eligible only for today within visible hours',
    run: () => {
      const today = new Date(2026, 4, 10);
      const withinHours = new Date(2026, 4, 10, 10, 30);
      const futureDate = new Date(2026, 4, 11);
      const pastDate = new Date(2026, 4, 9);

      assertEqual(
        isSameLocalCalendarDate(today, withinHours),
        true,
        'same local calendar day should match',
      );
      assertEqual(
        getCurrentTimeIndicatorMinutes({ schedulerDate: today, now: withinHours }),
        10 * 60 + 30,
        'today within hours should return current minutes',
      );
      assertEqual(
        getCurrentTimeIndicatorTop({ schedulerDate: today, now: withinHours }),
        timeToY(10 * 60 + 30),
        'today within hours should map to the current-time y position',
      );
      assertEqual(
        getCurrentTimeIndicatorMinutes({ schedulerDate: futureDate, now: withinHours }),
        null,
        'future selected dates should not render a current-time indicator',
      );
      assertEqual(
        getCurrentTimeIndicatorMinutes({ schedulerDate: pastDate, now: withinHours }),
        null,
        'past selected dates should not render a current-time indicator',
      );
      assertEqual(
        getCurrentTimeIndicatorMinutes({ schedulerDate: today, now: new Date(2026, 4, 10, 7, 59) }),
        null,
        'before scheduler hours should hide the current-time indicator',
      );
      assertEqual(
        getCurrentTimeIndicatorMinutes({ schedulerDate: today, now: new Date(2026, 4, 10, 20, 1) }),
        null,
        'after scheduler hours should hide the current-time indicator',
      );
    },
  },
  {
    name: 'past placement targets are invalid only for historical starts',
    run: () => {
      const today = new Date(2026, 4, 10);
      const now = new Date(2026, 4, 10, 10, 30);
      const pastDate = new Date(2026, 4, 9);
      const futureDate = new Date(2026, 4, 11);

      assertEqual(
        isPastPlacementStart(dateAndMinutesToIso(today, 10 * 60 + 15), now),
        true,
        'today + a slot before now should be invalid for placement',
      );
      assertEqual(
        isPastPlacementStart(dateAndMinutesToIso(today, 10 * 60 + 45), now),
        false,
        'today + a future slot should remain valid for placement',
      );
      assertEqual(
        isPastPlacementStart(dateAndMinutesToIso(futureDate, 9 * 60), now),
        false,
        'future date slots should remain valid for placement',
      );
      assertEqual(
        isPastPlacementStart(dateAndMinutesToIso(pastDate, 9 * 60), now),
        true,
        'past date slots should be invalid for new placement',
      );
      assertEqual(
        getPastPlacementOverlayHeight({ schedulerDate: today, now }),
        timeToY(10 * 60 + 30),
        'today overlay should shade the elapsed visible range',
      );
      assertEqual(
        getPastPlacementOverlayHeight({ schedulerDate: pastDate, now }),
        getGridHeight(),
        'past dates should shade the full visible placement range',
      );
      assertEqual(
        getPastPlacementOverlayHeight({ schedulerDate: futureDate, now }),
        0,
        'future dates should not shade unavailable placement time',
      );
    },
  },
  {
    name: 'manual booking intent exists only for future open slots outside placement mode',
    run: () => {
      const futureTarget = manualBookingTarget({
        startMinutes: 11 * 60,
      });
      const pastTarget = manualBookingTarget({
        startMinutes: 9 * 60,
      });

      assertDefined(
        buildManualBookingIntent({
          target: futureTarget,
          enabled: true,
          placementModeActive: false,
          now: new Date(2026, 4, 5, 10, 30),
        }),
        'future empty slots should produce a manual booking intent',
      );
      assertEqual(
        buildManualBookingIntent({
          target: pastTarget,
          enabled: true,
          placementModeActive: false,
          now: new Date(2026, 4, 5, 10, 30),
        }),
        null,
        'past slots should not produce a manual booking intent',
      );
      assertEqual(
        buildManualBookingIntent({
          target: futureTarget,
          enabled: false,
          placementModeActive: false,
          now: new Date(2026, 4, 5, 10, 30),
        }),
        null,
        'sample/read-only mode should not produce a manual booking intent',
      );
      assertEqual(
        buildManualBookingIntent({
          target: futureTarget,
          enabled: true,
          placementModeActive: true,
          now: new Date(2026, 4, 5, 10, 30),
        }),
        null,
        'request placement mode should take precedence over manual booking clicks',
      );
    },
  },
  {
    name: 'post-write sync separates committed mutation success from refresh failure',
    run: async () => {
      const syncedResult = await runNativeSchedulerPostWriteMutation({
        mutate: async () => 'committed',
        refresh: async () => ({ usable: true }),
        isRefreshResultUsable: (result) => result.usable,
      });
      assertEqual(syncedResult.mutationResult, 'committed', 'successful mutation should stay committed');
      assertEqual(syncedResult.syncResult.status, 'synced', 'usable refresh should report synced');

      const refreshWarningResult = await runNativeSchedulerPostWriteMutation({
        mutate: async () => 'committed',
        refresh: async () => {
          throw new Error('refresh failed');
        },
      });
      assertEqual(
        refreshWarningResult.mutationResult,
        'committed',
        'refresh failure must not erase committed mutation success',
      );
      assertEqual(
        refreshWarningResult.syncResult.status,
        'refresh_warning',
        'refresh failure should return a warning result',
      );

      const unusableRefreshResult = await attemptNativeSchedulerPostWriteSync({
        refresh: async () => ({ usable: false }),
        isRefreshResultUsable: (result) => result.usable,
      });
      assertEqual(
        unusableRefreshResult.status,
        'refresh_warning',
        'unexpected refresh payload should become a refresh warning',
      );

      let mutationFailureMessage = '';
      try {
        await runNativeSchedulerPostWriteMutation({
          mutate: async () => {
            throw new Error('mutation failed');
          },
          refresh: async () => ({ usable: true }),
        });
      } catch (error) {
        mutationFailureMessage = error instanceof Error ? error.message : '';
      }
      assertEqual(
        mutationFailureMessage,
        'mutation failed',
        'mutation failure should stay distinguishable from refresh failure',
      );
    },
  },
  {
    name: 'Calendar V2 action errors normalize to calm Bulgarian copy',
    run: () => {
      const conflictError = apiError(409, 'Избраният час вече е зает. Моля, изберете друг.');

      assertEqual(
        getCalendarV2ActionErrorMessage(conflictError, 'manual_booking'),
        'Този час вече е зает.',
        'manual booking conflicts should use the shared occupied-slot copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(conflictError, 'request_placement'),
        'Този час вече е зает.',
        'request placement conflicts should use the shared occupied-slot copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(conflictError, 'reschedule_booking'),
        'Този час вече е зает.',
        'reschedule conflicts should use the shared occupied-slot copy',
      );

      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(400, 'Не може да запишете час в миналото.'), 'manual_booking'),
        'Не може да запишете час в миналото.',
        'manual booking past-time errors should use manual booking copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(400, 'Не може да запишете час в миналото.'), 'request_placement'),
        'Не може да поставите заявка в миналото.',
        'request placement past-time errors should use request placement copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(400, 'Не може да запишете час в миналото.'), 'reschedule_booking'),
        'Не може да преместите час в миналото.',
        'reschedule past-time errors should use reschedule copy',
      );

      assertEqual(
        getCalendarV2ActionErrorMessage(
          apiError(400, "Не може да се смени статус от 'completed' на 'cancelled'"),
          'cancel_booking',
        ),
        'Този час вече не може да бъде отказан.',
        'terminal cancel errors should use safe cancel copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(
          apiError(400, "Не може да се смени статус от 'completed' на 'confirmed'"),
          'confirm_booking',
        ),
        'Този час вече не може да бъде потвърден.',
        'terminal confirm errors should use safe confirm copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(
          apiError(400, "Не може да се смени статус от 'confirmed' на 'confirmed'"),
          'confirm_booking',
        ),
        'Този час вече е потвърден.',
        'already-confirmed errors should use explicit confirm copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(409, 'Заявката вече е обработена.'), 'request_placement'),
        'Заявката вече е обработена.',
        'already-handled request errors should use explicit request copy',
      );

      assertEqual(
        getCalendarV2ActionErrorMessage(networkError(), 'manual_booking'),
        'Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.',
        'network errors should use calm shared Bulgarian copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(500, 'database stack trace'), 'request_placement'),
        'Възникна проблем със сървъра. Опитайте отново след малко.',
        'server errors should use calm shared Bulgarian copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(401, 'JWT expired'), 'cancel_booking'),
        'Сесията е изтекла. Влезте отново.',
        'unauthorized errors should use calm shared Bulgarian copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(403, 'Forbidden raw text'), 'confirm_booking'),
        'Нямате права за това действие.',
        'forbidden errors should use calm shared Bulgarian copy',
      );
      assertEqual(
        getCalendarV2ActionErrorMessageForCategory('refresh_warning', 'manual_booking'),
        'Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.',
        'committed mutation plus refresh failure should remain a refresh warning',
      );
      assertEqual(
        getCalendarV2ActionErrorMessage(apiError(409, 'SQL overlap detail: Избраният час вече е зает.'), 'manual_booking'),
        'Този час вече е зает.',
        'known categories should not surface raw backend error text',
      );
      assertEqual(
        normalizeCalendarV2ActionError(apiError(409, 'Заявката вече е обработена.'), 'request_placement').category,
        'request_already_handled',
        'request already handled should normalize to the stable category',
      );
    },
  },
  {
    name: 'post-write selection reconciliation clears stale unsafe selection only when needed',
    run: () => {
      assertEqual(
        shouldClearNativeSchedulerSelectionAfterPostWriteSync({
          syncStatus: 'synced',
          appointmentVisibleAfterRefresh: false,
        }),
        true,
        'cancelled booking disappearing from the active grid should clear selection',
      );
      assertEqual(
        shouldClearNativeSchedulerSelectionAfterPostWriteSync({
          syncStatus: 'synced',
          appointmentVisibleAfterRefresh: true,
        }),
        false,
        'confirmed booking still visible after refresh should remain selectable',
      );
      assertEqual(
        shouldClearNativeSchedulerSelectionAfterPostWriteSync({
          syncStatus: 'refresh_warning',
          appointmentVisibleAfterRefresh: true,
        }),
        true,
        'refresh warning should clear stale selection even when the previous card was visible',
      );
      assertEqual(
        shouldClearNativeSchedulerSelectionAfterPostWriteSync({
          syncStatus: 'synced',
          appointmentVisibleAfterRefresh: false,
        }),
        true,
        'rescheduled booking leaving the visible day should clear selection',
      );
    },
  },
  {
    name: 'geometry snaps and clamps 15-minute slots safely',
    run: () => {
      assertEqual(snapToSlot(487), 480, '487 minutes should snap down to 08:00');
      assertEqual(snapToSlot(488), 495, '488 minutes should snap up to 08:15');
      assertEqual(clampToBusinessHours(6 * 60, 60), 8 * 60, 'early starts clamp to business start');
      assertEqual(clampToBusinessHours(20 * 60, 60), 19 * 60, '60-minute event clamps to latest valid start');
      assertEqual(clampToBusinessHours(21 * 60, 15), 19 * 60 + 45, '15-minute event clamps to 19:45');
    },
  },
  {
    name: 'pointer slots clamp vertically and reject invalid resource columns',
    run: () => {
      const firstColumn = slotFromPointer({
        clientX: GRID_RECT.left + 12,
        clientY: GRID_RECT.top + timeToY(9 * 60),
        gridRect: GRID_RECT,
        resources: RESOURCES,
        date: CHECK_DATE,
        durationMinutes: 60,
      });
      assertDefined(firstColumn, 'first staff column should resolve');
      assertEqual(firstColumn.resource.id, 'staff-1', 'x inside first column should resolve staff-1');
      assertEqual(firstColumn.startMinutes, 9 * 60, 'pointer y should resolve 09:00');

      const thirdColumn = slotFromPointer({
        clientX: GRID_RECT.left + NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth * 2 + 16,
        clientY: GRID_RECT.top + timeToY(10 * 60 + 30),
        gridRect: GRID_RECT,
        resources: RESOURCES,
        date: CHECK_DATE,
        durationMinutes: 45,
      });
      assertDefined(thirdColumn, 'third staff column should resolve');
      assertEqual(thirdColumn.resource.id, 'staff-3', 'x inside third column should resolve staff-3');
      assertEqual(thirdColumn.startMinutes, 10 * 60 + 30, 'pointer y should resolve 10:30');

      const aboveGrid = slotFromPointer({
        clientX: GRID_RECT.left + 20,
        clientY: GRID_RECT.top - 6,
        gridRect: GRID_RECT,
        resources: RESOURCES,
        date: CHECK_DATE,
        durationMinutes: 60,
      });
      assertDefined(aboveGrid, 'slightly above-grid y should clamp to a safe slot');
      assertEqual(aboveGrid.startMinutes, 8 * 60, 'above-grid y should clamp to business start');

      const belowGrid = slotFromPointer({
        clientX: GRID_RECT.left + 20,
        clientY: GRID_RECT.top + GRID_RECT.height + 6,
        gridRect: GRID_RECT,
        resources: RESOURCES,
        date: CHECK_DATE,
        durationMinutes: 60,
      });
      assertDefined(belowGrid, 'slightly below-grid y should clamp to a safe slot');
      assertEqual(belowGrid.startMinutes, 19 * 60, 'below-grid y should clamp to latest valid start');

      assertEqual(
        getResourceFromX(-1, RESOURCES),
        null,
        'negative resource x should return null instead of first staff',
      );
      assertEqual(
        getResourceFromX(GRID_RECT.width + 1, RESOURCES),
        null,
        'x outside resource columns should return null',
      );
      assertEqual(
        slotFromPointer({
          clientX: GRID_RECT.left + GRID_RECT.width + 12,
          clientY: GRID_RECT.top + timeToY(9 * 60),
          gridRect: GRID_RECT,
          resources: RESOURCES,
          date: CHECK_DATE,
          durationMinutes: 60,
        }),
        null,
        'drop outside staff columns should not produce a slot target',
      );
    },
  },
  {
    name: 'appointment rects keep short cards usable',
    run: () => {
      const shortRect = appointmentToRect(
        calendarBlock('short-appointment', 'staff-1', 10 * 60 + 15, 10 * 60 + 25),
        RESOURCES,
        undefined,
      );
      assertDefined(shortRect, 'short appointment should produce a rect');
      assertEqual(
        shortRect.height,
        NATIVE_SCHEDULER_GEOMETRY.minimumEventHeight,
        '10-minute appointment should use minimum visible card height',
      );
    },
  },
  {
    name: 'overlap detection separates real overlaps without flagging adjacent bookings',
    run: () => {
      const adjacentLayout = detectLocalOverlap([
        calendarBlock('adjacent-a', 'staff-1', 9 * 60, 10 * 60),
        calendarBlock('adjacent-b', 'staff-1', 10 * 60, 11 * 60),
      ]);
      assertEqual(adjacentLayout.get('adjacent-a')?.laneCount, 1, 'first adjacent booking should use one lane');
      assertEqual(adjacentLayout.get('adjacent-b')?.laneCount, 1, 'second adjacent booking should use one lane');

      const overlapLayout = detectLocalOverlap([
        calendarBlock('overlap-a', 'staff-1', 9 * 60, 10 * 60),
        calendarBlock('overlap-b', 'staff-1', 9 * 60 + 30, 10 * 60 + 30),
      ]);
      assertEqual(overlapLayout.get('overlap-a')?.laneCount, 2, 'first overlapping booking should see two lanes');
      assertEqual(overlapLayout.get('overlap-b')?.laneCount, 2, 'second overlapping booking should see two lanes');
      assert(
        overlapLayout.get('overlap-a')?.lane !== overlapLayout.get('overlap-b')?.lane,
        'overlapping bookings should occupy different lanes',
      );
    },
  },
  {
    name: 'command previews preserve typed scheduler intent',
    run: () => {
      const target = {
        staffId: 'staff-2',
        staffName: 'Boris',
        startAt: dateAndMinutesToIso(CHECK_DATE, 11 * 60),
        endAt: dateAndMinutesToIso(CHECK_DATE, 12 * 60),
      };
      const demandItem = demandFixture();
      const placeCommand = createPlaceRequestCommand({
        demandItem,
        target,
        timezone: 'Europe/Sofia',
      });

      assertEqual(placeCommand.type, 'placeRequest', 'place command type should be placeRequest');
      assertEqual(placeCommand.entity.id, demandItem.id, 'place command should carry request id');
      assertEqual(placeCommand.entity.kind, 'demand_item', 'place command should target a demand item');
      assertEqual(placeCommand.target.staffId, 'staff-2', 'place command should carry staff id');
      assertEqual(placeCommand.target.startAt, target.startAt, 'place command should carry start time');
      assertEqual(placeCommand.target.endAt, target.endAt, 'place command should carry end time');
      assertEqual(placeCommand.sourceSurface, 'action_inbox', 'place command should identify Action Inbox surface');
      assertEqual(placeCommand.localOnly, true, 'place command should remain explicitly local-only');
      assert(
        placeCommand.idempotencyKey?.startsWith('calendar-v2-spike:placeRequest:demand-1:') === true,
        'place command should carry a local idempotency key',
      );
      assertEqual(placeCommand.createAppointmentDraft?.serviceId, 'service-1', 'place draft should carry service id');
      assertEqual(placeCommand.createAppointmentDraft?.clientId, 'client-1', 'place draft should carry client id');
      assertEqual(
        commandPreviewLabel(placeCommand),
        'Преглед на поставяне · не е записано',
        'place label should be product copy',
      );
      assertNoInternalLabel(commandPreviewLabel(placeCommand), 'place label should hide command internals');
      assertNoWriteTransportMarkers(placeCommand, 'place preview should not carry write transport details');

      const saveRequest = buildWaitlistPlacementSaveRequest({
        waitlistId: demandItem.id,
        command: placeCommand,
        durationMinutes: 60,
      });
      assertEqual(
        saveRequest.path,
        '/appointments/waitlist/demand-1/place',
        'explicit placement save should target the dedicated waitlist placement endpoint',
      );
      assertEqual(saveRequest.payload.staffId, 'staff-2', 'save payload should carry selected staff');
      assertEqual(saveRequest.payload.startAt, target.startAt, 'save payload should carry selected start');
      assertEqual(saveRequest.payload.durationMinutes, 60, 'save payload should carry placement duration');
      assertEqual(saveRequest.payload.notifyClient, false, 'save payload should explicitly suppress notifications');
      assertEqual(
        saveRequest.payload.idempotencyKey,
        `calendar-v2-placement:demand-1:staff-2:${target.startAt}`,
        'save payload should use a stable slot-based idempotency key',
      );
      assertEqual(
        buildWaitlistPlacementSaveRequestIfFuture({
          waitlistId: demandItem.id,
          command: placeCommand,
          durationMinutes: 60,
          now: new Date(2026, 4, 5, 11, 30),
        }),
        null,
        'past selected slots should not produce a save payload',
      );
      assertDefined(
        buildWaitlistPlacementSaveRequestIfFuture({
          waitlistId: demandItem.id,
          command: placeCommand,
          durationMinutes: 60,
          now: new Date(2026, 4, 5, 10, 30),
        }),
        'future selected slots should still produce a save payload',
      );

      const appointment = appointmentFixture();
      const moveCommand = createMoveAppointmentCommand({
        appointment,
        target,
        previousTarget: {
          staffId: appointment.staff.id,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
        },
        timezone: 'Europe/Sofia',
      });

      assertEqual(moveCommand.type, 'moveAppointment', 'move command type should be moveAppointment');
      assertEqual(moveCommand.entity.id, appointment.id, 'move command should carry appointment id');
      assertEqual(moveCommand.entity.kind, 'appointment', 'move command should target an appointment');
      assertEqual(moveCommand.target.staffId, 'staff-2', 'move command should carry target staff');
      assertEqual(moveCommand.target.startAt, target.startAt, 'move command should carry target start');
      assertEqual(moveCommand.sourceSurface, 'desktop_scheduler', 'move command should identify scheduler surface');
      assert(
        moveCommand.idempotencyKey?.startsWith('calendar-v2-spike:moveAppointment:appointment-1:') === true,
        'move command should carry a local idempotency key',
      );
      assertEqual(
        moveCommand.optimistic?.previousStaffId,
        appointment.staff.id,
        'move command should keep previous staff for future rollback',
      );
      assertEqual(
        commandPreviewLabel(moveCommand),
        'Локална промяна · не е записано',
        'move label should be product copy',
      );
      assertNoInternalLabel(commandPreviewLabel(moveCommand), 'move label should hide command internals');
    },
  },
  {
    name: 'local placement preview rejects invalid resource targets',
    run: () => {
      const invalidSlot = slotFromPointer({
        clientX: GRID_RECT.left + GRID_RECT.width + 12,
        clientY: GRID_RECT.top + timeToY(9 * 60),
        gridRect: GRID_RECT,
        resources: RESOURCES,
        date: CHECK_DATE,
        durationMinutes: 60,
      });
      const command = createPlaceRequestCommandPreview({
        demandItem: demandFixture(),
        target: invalidSlot
          ? {
              startAt: invalidSlot.startAt,
              endAt: invalidSlot.endAt,
              staffId: invalidSlot.resource.id,
              staffName: invalidSlot.resource.name,
            }
          : null,
        timezone: 'Europe/Sofia',
      });

      assertEqual(invalidSlot, null, 'invalid x/resource should not resolve a slot');
      assertEqual(command, null, 'invalid x/resource should not create a placement command');
    },
  },
  {
    name: 'local placement preview uses safe fallback duration',
    run: () => {
      const demandWithoutDuration = demandFixture({ durationMinutes: null });
      const target = {
        staffId: 'staff-2',
        staffName: 'Boris',
        startAt: dateAndMinutesToIso(CHECK_DATE, 11 * 60),
        endAt: dateAndMinutesToIso(
          CHECK_DATE,
          11 * 60 + getPlacementDurationMinutes(demandWithoutDuration),
        ),
      };
      const command = createPlaceRequestCommandPreview({
        demandItem: demandWithoutDuration,
        target,
        timezone: 'Europe/Sofia',
      });

      assertEqual(
        getPlacementDurationMinutes(demandWithoutDuration),
        DEFAULT_PLACEMENT_DURATION_MINUTES,
        'missing duration should use 60-minute fallback',
      );
      assertEqual(
        usesFallbackPlacementDuration(demandWithoutDuration),
        true,
        'missing duration should be marked as fallback',
      );
      assertDefined(command, 'fallback duration should still create a local preview command');
      assertEqual(
        command.target.endAt,
        dateAndMinutesToIso(CHECK_DATE, 12 * 60),
        'fallback duration should drive target end time',
      );
      assertEqual(command.localOnly, true, 'fallback placement preview should remain local-only');
    },
  },
  {
    name: 'local placement conflict helper detects overlap without blocking preview shape',
    run: () => {
      const blocks = [
        calendarBlock('existing-a', 'staff-1', 9 * 60, 10 * 60),
        calendarBlock('existing-b', 'staff-2', 9 * 60, 10 * 60),
      ];

      assertEqual(
        detectLocalPlacementConflict({
          blocks,
          staffId: 'staff-1',
          startAt: dateAndMinutesToIso(CHECK_DATE, 9 * 60 + 30),
          endAt: dateAndMinutesToIso(CHECK_DATE, 10 * 60 + 30),
        }),
        true,
        'same-staff overlapping target should be detected locally',
      );
      assertEqual(
        detectLocalPlacementConflict({
          blocks,
          staffId: 'staff-1',
          startAt: dateAndMinutesToIso(CHECK_DATE, 10 * 60),
          endAt: dateAndMinutesToIso(CHECK_DATE, 11 * 60),
        }),
        false,
        'adjacent same-staff target should remain available locally',
      );
      assertEqual(
        detectLocalPlacementConflict({
          blocks,
          staffId: 'staff-3',
          startAt: dateAndMinutesToIso(CHECK_DATE, 9 * 60 + 30),
          endAt: dateAndMinutesToIso(CHECK_DATE, 10 * 60 + 30),
        }),
        false,
        'different-staff overlap should not be treated as a conflict',
      );
    },
  },
  {
    name: 'drag helper threshold separates click/select from drag intent',
    run: () => {
      assertEqual(
        hasPassedDragThreshold({ x: 10, y: 10 }, { x: 12, y: 12 }),
        false,
        'small pointer movement should remain a click/select candidate',
      );
      assertEqual(
        hasPassedDragThreshold({ x: 10, y: 10 }, { x: 15, y: 10 }),
        true,
        'larger pointer movement should become drag intent',
      );
    },
  },
];

export async function runNativeSchedulerRegressionChecks(sourceDir?: string): Promise<NativeSchedulerRegressionCheckResult[]> {
  const activeChecks = sourceDir ? [...checks, ...getSourceChecks(sourceDir)] : checks;

  const results: NativeSchedulerRegressionCheckResult[] = [];

  for (const check of activeChecks) {
    await check.run();
    results.push({ name: check.name, passed: true });
  }

  return results;
}

function getSourceChecks(sourceDir: string): RegressionCheck[] {
  return [
    {
      name: 'visible placement UI hides internal command identifiers',
      run: () => {
        const placementPreviewSource = readSource(sourceDir, 'NativeSchedulerPlacementPreview.tsx');
        const previewPanelSource = readSource(sourceDir, 'NativeSchedulerPreviewPanel.tsx');

        assert(
          !placementPreviewSource.includes('idempotencyKey'),
          'placement preview should not render local idempotency keys',
        );
        assert(
          !placementPreviewSource.includes('commandLine'),
          'placement preview should not render debug command lines',
        );
        assertNoInternalLabel(placementPreviewSource, 'placement preview source should not expose debug labels');
        assertNoInternalLabel(previewPanelSource, 'preview panel source should not expose debug labels');
      },
    },
    {
      name: 'placement save remains feature-flagged and real-data only',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');

        assert(
          adapterSource.includes('NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE') &&
            adapterSource.includes('ENABLE_CALENDAR_V2_PLACEMENT_SAVE && !isSampleMode'),
          'placement save should be enabled only by the Calendar V2 placement save flag in real-data mode',
        );
        assert(
          adapterSource.includes('enabled: canSavePlacement'),
          'save control should stay disabled when the flag is off',
        );
        assert(
          adapterSource.includes('Примерният режим не записва часове.'),
          'sample mode should keep the placement save disabled with explicit copy',
        );
      },
    },
    {
      name: 'Calendar V2 committed writes keep warning copy separate from action failures',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const syncSource = readSource(sourceDir, 'native-scheduler-post-write-sync.ts');
        const actionErrorSource = readSource(sourceDir, 'native-scheduler-action-errors.ts');

        assert(
          syncSource.includes('CALENDAR_V2_REFRESH_WARNING_MESSAGE') &&
            actionErrorSource.includes('Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.'),
          'shared action-error helper should define the refresh-warning copy used by post-write sync',
        );
        assert(
          adapterSource.includes('toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING)'),
          'real-data writes should surface refresh warnings separately from write failures',
        );
        assert(
          actionErrorSource.includes('Не успяхме да поставим заявката. Опитайте отново.') &&
            actionErrorSource.includes('Не успяхме да откажем часа. Опитайте отново.') &&
            actionErrorSource.includes('Не успяхме да потвърдим часа. Опитайте отново.') &&
            actionErrorSource.includes('Не успяхме да преместим часа. Опитайте отново.'),
          'action-specific write failures should remain present in the shared action-error helper',
        );
        assert(
          schedulerSource.includes("const refreshWarning = result?.syncStatus === 'refresh_warning'"),
          'scheduler preview state should distinguish refresh warnings after committed writes',
        );
      },
    },
    {
      name: 'successful committed placement and reschedule always leave write mode safely',
      run: () => {
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');

        assert(
          schedulerSource.includes('clearPlacementMode();'),
          'successful request placement should clear preview/commit state',
        );
        assert(
          schedulerSource.includes('clearRescheduleMode();'),
          'successful reschedule should exit write mode even when sync returns a warning',
        );
      },
    },
    {
      name: 'sample mode keeps Calendar V2 non-writing and out of sync-warning paths',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');

        assert(
          adapterSource.includes('const canSavePlacement = ENABLE_CALENDAR_V2_PLACEMENT_SAVE && !isSampleMode;') &&
            adapterSource.includes('const canCreateManualBooking = !isSampleMode;'),
          'sample mode should keep placement and manual booking writes disabled',
        );
        assert(
          (adapterSource.match(/isSampleMode\s*\? undefined\s*: \{/g) ?? []).length >= 3 &&
            adapterSource.includes('onConfirm: handleConfirmBooking') &&
            adapterSource.includes('onCancel: handleCancelBooking') &&
            adapterSource.includes('onSave: handleRescheduleBooking'),
          'sample mode should not expose confirm, cancel, or reschedule write callbacks',
        );
      },
    },
    {
      name: 'appointment cards stay block-like without loud confirmed status text',
      run: () => {
        const eventCardSource = readSource(sourceDir, 'NativeSchedulerEventCard.tsx');
        const styleSource = readSource(sourceDir, 'native-scheduler.module.css');

        assert(
          eventCardSource.includes('data-native-scheduler-action-needed') &&
            eventCardSource.includes('getStatusCue(block)') &&
            eventCardSource.includes("appointment.actionState === 'requires_action'"),
          'appointment cards should expose action-needed state as display metadata',
        );
        assert(
          eventCardSource.includes("label: getActionNeededLabel") &&
            eventCardSource.includes("'Чака избор'") &&
            eventCardSource.includes("'Чака потвърждение'"),
          'pending/proposal cards should use short Bulgarian action-needed labels',
        );
        assert(
          !eventCardSource.includes("'потвърден'") &&
            !eventCardSource.includes('formatDurationLabel') &&
            !eventCardSource.includes('eventMetaRow'),
          'confirmed/default cards should not render loud status or duration metadata on the grid card',
        );
        assert(
          eventCardSource.includes('shortBlockText') &&
            eventCardSource.includes('shortTitle') &&
            eventCardSource.includes('shortTime'),
          'short cards should keep client identity and time readable instead of collapsing to initials only',
        );
        assert(
          styleSource.includes('.eventCardNeedsAction') &&
            styleSource.includes('.eventCardSelected') &&
            styleSource.includes('.eventCardCompleted') &&
            styleSource.includes('.eventCardNoShow'),
          'card CSS should keep selected, action-needed, completed, and no-show states visually distinct',
        );
      },
    },
    {
      name: 'placement save labels describe the active mode honestly',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const inboxSource = readSource(sourceDir, 'NativeSchedulerActionInboxMock.tsx');
        const placementPreviewSource = readSource(sourceDir, 'NativeSchedulerPlacementPreview.tsx');

        assert(
          adapterSource.includes("const CALENDAR_V2_MANUAL_BOOKING_NOTICE = 'Ръчно записване'") &&
            adapterSource.includes("const CALENDAR_V2_OPERATIONS_NOTICE = 'Поставяне на заявки'") &&
            adapterSource.includes('const modeNotice = isSampleMode'),
          'real-data mode should describe manual booking, request-placement, reschedule, confirm, and cancel capability honestly',
        );
        assert(
          adapterSource.includes("? 'Поставяне на заявки'") &&
            adapterSource.includes("isSampleMode\n      ? 'Само преглед'\n      : 'Поставянето не е активно'"),
          'Action Inbox subtitle should distinguish sample, flag-off real, and flag-on real modes',
        );
        assert(
          schedulerSource.includes('actionInboxSubtitle?: string') &&
            schedulerSource.includes('subtitle={actionInboxSubtitle}'),
          'scheduler should pass the explicit Action Inbox subtitle through without changing behavior',
        );
        assert(
          inboxSource.includes('subtitle ?? (readOnly ?') &&
            inboxSource.includes('Само локален преглед'),
          'Action Inbox should preserve the previous local-preview fallback when no explicit subtitle is passed',
        );
        assert(
          placementPreviewSource.includes('Часът ще се запише само след натискане на „Запази час“.') &&
            placementPreviewSource.includes('Това е само преглед. Часът няма да бъде записан.'),
          'placement preview should use save-capable copy only when save is enabled',
        );
      },
    },
    {
      name: 'manual booking stays real-data only and coexists with request placement',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const gridSource = readSource(sourceDir, 'NativeSchedulerGrid.tsx');

        assert(
          adapterSource.includes('const canCreateManualBooking = !isSampleMode') &&
            adapterSource.includes('Нов час') &&
            adapterSource.includes('<AdminBookingModal'),
          'real-data Calendar V2 should expose the manual booking entry point while sample mode stays non-writing',
        );
        assert(
          schedulerSource.includes('buildManualBookingIntent') &&
            schedulerSource.includes('manualBookingEnabled') &&
            schedulerSource.includes('onManualBookingSlotClick'),
          'scheduler should turn ordinary slot clicks into explicit manual booking intent',
        );
        assert(
          gridSource.includes('const handleGridClick = rescheduleModeActive') &&
            gridSource.includes(': placementModeActive') &&
            gridSource.includes('manualBookingEnabled'),
          'request placement mode should keep priority over manual booking grid clicks',
        );
      },
    },
    {
      name: 'placement save uses one safe waitlist write and no notification writes',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');
        const dragSource = readSource(sourceDir, 'native-scheduler-drag.ts');

        assert(
          dragSource.includes('path: `/appointments/waitlist/${waitlistId}/place`'),
          'save request helper should use the backend waitlist placement endpoint',
        );
        assert(
          dragSource.includes('notifyClient: false'),
          'save request helper should explicitly keep notifications off',
        );
        assert(
          !adapterSource.includes('/appointments/admin') &&
            !adapterSource.includes('/notifications') &&
            !adapterSource.includes('/notify'),
          'Calendar V2 placement save should not call appointment create or notification endpoints',
        );
        assert(
          !adapterSource.includes('apiClient.delete') &&
            adapterSource.includes('apiClient.post<PlaceWaitlistEntryResponse>(request.path, request.payload)'),
          'Calendar V2 placement save should have one explicit POST write path',
        );
      },
    },
    {
      name: 'reschedule booking intent is eligible real-data only and yields to other modes',
      run: () => {
        const pendingBlock = calendarBlock('pending-booking', 'staff-1', 10 * 60, 11 * 60, {
          rawStatus: 'pending',
        });
        const proposalPendingBlock = calendarBlock('proposal-pending-booking', 'staff-1', 11 * 60, 12 * 60, {
          rawStatus: 'proposal_pending',
        });
        const confirmedBlock = calendarBlock('confirmed-booking', 'staff-1', 12 * 60, 13 * 60, {
          rawStatus: 'confirmed',
        });
        const terminalBlock = calendarBlock('terminal-booking', 'staff-1', 13 * 60, 14 * 60, {
          rawStatus: 'completed',
        });

        assertDefined(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: pendingBlock,
            canWrite: true,
            placementContextActive: false,
            rescheduleContextActive: false,
          }),
          'pending real appointments should expose reschedule intent',
        );
        assertDefined(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: proposalPendingBlock,
            canWrite: true,
            placementContextActive: false,
            rescheduleContextActive: false,
          }),
          'proposal-pending real appointments should expose reschedule intent',
        );
        assertDefined(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: false,
            rescheduleContextActive: false,
          }),
          'confirmed real appointments should expose reschedule intent',
        );
        assertEqual(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: terminalBlock,
            canWrite: true,
            placementContextActive: false,
            rescheduleContextActive: false,
          }),
          null,
          'terminal appointments should not expose reschedule intent',
        );
        assertEqual(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: false,
            placementContextActive: false,
            rescheduleContextActive: false,
          }),
          null,
          'sample/read-only appointments should not expose reschedule write intent',
        );
        assertEqual(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: true,
            rescheduleContextActive: false,
          }),
          null,
          'request placement mode should suppress reschedule intent',
        );
        assertEqual(
          getNativeSchedulerRescheduleBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: false,
            rescheduleContextActive: true,
          }),
          null,
          'an active reschedule mode should not expose a duplicate intent',
        );
      },
    },
    {
      name: 'reschedule save request exists only for future free targets',
      run: () => {
        const futureTarget = {
          kind: 'appointment' as const,
          staffId: 'staff-2',
          staffName: 'Boris',
          startAt: dateAndMinutesToIso(CHECK_DATE, 13 * 60),
          endAt: dateAndMinutesToIso(CHECK_DATE, 14 * 60),
          durationMinutes: 60,
          hasConflict: false,
          isPast: false,
        };

        const request = buildAppointmentRescheduleSaveRequestIfValid({
          appointmentId: 'appointment-1',
          target: futureTarget,
        });
        assertDefined(request, 'future free target should produce a reschedule payload');
        assertEqual(
          request.path,
          '/appointments/appointment-1/reschedule',
          'future free target should reuse the existing reschedule endpoint',
        );
        assertEqual(
          request.payload.startAt,
          futureTarget.startAt,
          'reschedule payload should carry the target start',
        );
        assertEqual(
          request.payload.staffId,
          'staff-2',
          'reschedule payload should carry the target staff',
        );
        assertEqual(
          buildAppointmentRescheduleSaveRequestIfValid({
            appointmentId: 'appointment-1',
            target: { ...futureTarget, isPast: true },
          }),
          null,
          'past target should not produce a reschedule payload',
        );
        assertEqual(
          buildAppointmentRescheduleSaveRequestIfValid({
            appointmentId: 'appointment-1',
            target: { ...futureTarget, hasConflict: true },
          }),
          null,
          'locally conflicting target should not produce a reschedule payload',
        );
      },
    },
    {
      name: 'reschedule mode consumes slot clicks before manual booking',
      run: () => {
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const gridSource = readSource(sourceDir, 'NativeSchedulerGrid.tsx');

        assert(
          gridSource.includes('const handleGridClick = rescheduleModeActive') &&
            gridSource.includes('onRescheduleSlotClick') &&
            gridSource.includes('manualBookingEnabled'),
          'reschedule mode should own grid clicks before ordinary manual booking',
        );
        assert(
          schedulerSource.includes('placementModeActive: placementModeActive || rescheduleModeActive'),
          'manual booking intent should stay disabled while reschedule mode is active',
        );
        assert(
          schedulerSource.includes("setRescheduleMessage('Не може да преместите час в миналото.');") &&
            schedulerSource.includes('setReschedulePreview({'),
          'past clicks should be rejected while future clicks can still create a reschedule preview',
        );
        assert(
          schedulerSource.includes('setRescheduleSourceBlock(null);') &&
            schedulerSource.includes('onClick={clearRescheduleMode}'),
          'cancel should exit reschedule mode',
        );
      },
    },
    {
      name: 'reschedule reuses backend endpoint and backend-truth refresh',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');

        assert(
          adapterSource.includes('mutate: () => apiClient.patch(request.path, request.payload)'),
          'reschedule flow should reuse the existing appointment reschedule PATCH contract',
        );
        assert(
          adapterSource.includes('shouldKeepCalendarV2SelectedBookingAfterRefresh(') &&
            adapterSource.includes("queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] })") &&
            adapterSource.includes("queryClient.invalidateQueries({ queryKey: ['appointment-context'] })"),
          'reschedule flow should reconcile from refreshed backend truth and invalidate board/context queries',
        );
      },
    },
    {
      name: 'confirm booking intent is pending real-data only and yields to placement mode',
      run: () => {
        const pendingBlock = calendarBlock('pending-booking', 'staff-1', 10 * 60, 11 * 60, {
          rawStatus: 'pending',
        });
        const proposalPendingBlock = calendarBlock('proposal-pending-booking', 'staff-1', 11 * 60, 12 * 60, {
          rawStatus: 'proposal_pending',
        });
        const confirmedBlock = calendarBlock('confirmed-booking', 'staff-1', 12 * 60, 13 * 60, {
          rawStatus: 'confirmed',
        });
        const terminalBlock = calendarBlock('terminal-booking', 'staff-1', 13 * 60, 14 * 60, {
          rawStatus: 'cancelled',
        });

        assertDefined(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: pendingBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          'pending real appointments should expose confirm intent',
        );
        assertDefined(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: proposalPendingBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          'proposal-pending real appointments should expose confirm intent',
        );
        assertEqual(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          null,
          'confirmed appointments should not expose confirm intent',
        );
        assertEqual(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: terminalBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          null,
          'terminal appointments should not expose confirm intent',
        );
        assertEqual(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: pendingBlock,
            canWrite: false,
            placementContextActive: false,
          }),
          null,
          'sample/read-only appointments should not expose confirm write intent',
        );
        assertEqual(
          getNativeSchedulerConfirmBookingIntent({
            selectedBlock: pendingBlock,
            canWrite: true,
            placementContextActive: true,
          }),
          null,
          'placement preview should take precedence over confirm intent',
        );
      },
    },
    {
      name: 'confirm booking reuses status endpoint and backend-truth refresh',
      run: () => {
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');
        const mapperSource = readSource(sourceDir, '../real-data/calendar-v2-real-data-mappers.ts');

        assert(
          adapterSource.includes("apiClient.patch(`/appointments/${appointmentId}/status`, { status: 'confirmed' })"),
          'confirm flow should reuse the existing appointment status endpoint',
        );
        assert(
          adapterSource.includes('doesCalendarV2BookingExistAfterRefresh(') &&
            adapterSource.includes("queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] })") &&
            adapterSource.includes("queryClient.invalidateQueries({ queryKey: ['appointment-context'] })"),
          'confirm flow should reconcile from refreshed backend truth and invalidate board/context queries',
        );
        assert(
          mapperSource.includes('doesCalendarV2BookingExistAfterRefresh') &&
            mapperSource.includes('appointments?.some((appointment) => appointment.id === appointmentId)'),
          'confirm selection should survive refresh only when the backend still returns the booking',
        );
      },
    },
    {
      name: 'cancel booking intent is real-data only and yields to placement mode',
      run: () => {
        const confirmedBlock = calendarBlock('confirmed-booking', 'staff-1', 11 * 60, 12 * 60, {
          rawStatus: 'confirmed',
        });
        const terminalBlock = calendarBlock('terminal-booking', 'staff-1', 12 * 60, 13 * 60, {
          rawStatus: 'cancelled',
        });

        assertDefined(
          getNativeSchedulerCancelBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          'eligible real appointments should expose cancel intent',
        );
        assertEqual(
          getNativeSchedulerCancelBookingIntent({
            selectedBlock: terminalBlock,
            canWrite: true,
            placementContextActive: false,
          }),
          null,
          'terminal appointments should not expose cancel intent',
        );
        assertEqual(
          getNativeSchedulerCancelBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: false,
            placementContextActive: false,
          }),
          null,
          'sample/read-only appointments should not expose write intent',
        );
        assertEqual(
          getNativeSchedulerCancelBookingIntent({
            selectedBlock: confirmedBlock,
            canWrite: true,
            placementContextActive: true,
          }),
          null,
          'placement preview should take precedence over cancel intent',
        );
      },
    },
    {
      name: 'real-data projection excludes cancelled bookings from active grid blocks',
      run: () => {
        const mapperSource = readSource(sourceDir, '../real-data/calendar-v2-real-data-mappers.ts');

        assert(
          mapperSource.includes("const NON_ACTIVE_GRID_APPOINTMENT_STATUSES = new Set(['cancelled'])"),
          'cancelled appointments should be explicitly classified as non-active grid rows',
        );
        assert(
          mapperSource.includes('const activeGridAppointments = selectedAppointments.filter(isCalendarV2ActiveGridAppointment);'),
          'real-data projection should derive active grid appointments separately from same-day appointments',
        );
        assert(
          mapperSource.includes('appointments: activeGridAppointments') &&
            mapperSource.includes('appointments: selectedAppointments'),
          'active blocks should use filtered appointments while Action Inbox/history keeps all selected appointments',
        );
      },
    },
    {
      name: 'cancel refetch clears selection when refreshed appointment is no longer active',
      run: () => {
        const mapperSource = readSource(sourceDir, '../real-data/calendar-v2-real-data-mappers.ts');
        const adapterSource = readSource(sourceDir, '../real-data/CalendarV2RealDataAdapter.tsx');

        assert(
          mapperSource.includes('shouldKeepCalendarV2SelectedBookingAfterRefresh') &&
            mapperSource.includes('refreshedAppointment && isCalendarV2ActiveGridAppointment(refreshedAppointment)'),
          'selection should survive refresh only while the refreshed appointment is still active in the grid',
        );
        assert(
          adapterSource.includes('appointmentVisibleAfterRefresh:') &&
            adapterSource.includes('shouldKeepCalendarV2SelectedBookingAfterRefresh('),
          'cancel flow should reconcile selection from refreshed active-grid visibility rather than raw row existence',
        );
      },
    },
    {
      name: 'selected placement target stays locked against hover movement',
      run: () => {
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');

        assert(
          schedulerSource.includes('const visibleDropPreview = rescheduleTarget ?? placementTarget ?? dropPreview') &&
            schedulerSource.includes('dropPreview={visibleDropPreview}'),
          'grid preview should prefer selected mode targets over transient hover state',
        );
        assert(
          schedulerSource.includes('if (!placementDemandItem || dragActive || placementTarget) return;'),
          'hover movement should stop updating the preview after a placement target is selected',
        );
        assert(
          schedulerSource.includes('waitlistId: placementPreview.demandItem.id') &&
            schedulerSource.includes('command: placementPreview.command') &&
            schedulerSource.includes('durationMinutes: placementPreview.durationMinutes'),
          'save request should continue using the selected placement preview, not hover state',
        );
        assert(
          schedulerSource.includes('setPlacementTarget(null);') &&
            schedulerSource.includes('setPlacementPreview(null);'),
          'cancel/reset paths should clear the selected placement target and preview',
        );
      },
    },
    {
      name: 'current-time line is date-aware and refreshes while open',
      run: () => {
        const gridSource = readSource(sourceDir, 'NativeSchedulerGrid.tsx');
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');

        assert(
          gridSource.includes('getCurrentTimeIndicatorTop') &&
            gridSource.includes('currentTimeTop !== null'),
          'grid should render the current-time line only when the helper returns an eligible position',
        );
        assert(
          gridSource.includes('CURRENT_TIME_REFRESH_MS = 60 * 1000') &&
            gridSource.includes('window.setInterval') &&
            gridSource.includes('window.clearInterval'),
          'grid should refresh the current-time indicator once per minute and clean up the timer',
        );
        assert(
          !gridSource.includes('MOCK_CURRENT_TIME_MINUTES'),
          'grid should not use a mocked current-time value',
        );
        assert(
          schedulerSource.includes('date={schedulerDate}'),
          'scheduler should pass the selected calendar date to the grid',
        );
      },
    },
    {
      name: 'placement preview cancel action remains wired',
      run: () => {
        const placementPreviewSource = readSource(sourceDir, 'NativeSchedulerPlacementPreview.tsx');

        assert(
          placementPreviewSource.includes('onClick={onClose}'),
          'placement preview cancel button should call onClose',
        );
        assert(
          placementPreviewSource.includes('Отказ'),
          'placement preview should expose a Bulgarian cancel action',
        );
      },
    },
    {
      name: 'right rail follows placement context before and after slot selection',
      run: () => {
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const previewPanelSource = readSource(sourceDir, 'NativeSchedulerPreviewPanel.tsx');

        assert(
          schedulerSource.includes('placementDemandItem ?? placementPreview?.demandItem ?? null'),
          'right rail placement context should exist before a target slot is selected',
        );
        assert(
          schedulerSource.includes('selectedBlock={placementPanelContext || reschedulePanelContext ? null : selectedBlock}'),
          'selected booking detail should be hidden while placement context is active',
        );
        assert(
          schedulerSource.includes('setSelectedBlockId(null);'),
          'starting placement mode should clear the unrelated selected booking',
        );
        assert(
          previewPanelSource.includes('Поставяне на заявка'),
          'placement context panel should use the placement title',
        );
        assert(
          previewPanelSource.includes('Избираме слот'),
          'placement context panel should show a before-slot status',
        );
        assert(
          previewPanelSource.includes('Изберете свободен час в календара. Часът още не е записан.'),
          'placement context panel should show before-slot instruction and no-save note',
        );
      },
    },
    {
      name: 'cancelling placement restores normal booking detail path',
      run: () => {
        const schedulerSource = readSource(sourceDir, 'NativeSchedulerV2Spike.tsx');
        const previewPanelSource = readSource(sourceDir, 'NativeSchedulerPreviewPanel.tsx');

        assert(
          schedulerSource.includes('setPlacementDemandItem(null);') &&
            schedulerSource.includes('setPlacementTarget(null);') &&
            schedulerSource.includes('setPlacementPreview(null);'),
          'clearPlacementMode should remove placement context',
        );
        assert(
          previewPanelSource.includes("isPlacementContext ? 'Поставяне на заявка' : isRescheduleContext ? 'Преместване на час' : 'Детайли за час'"),
          'preview panel should return to normal booking detail title without placement context',
        );
      },
    },
  ];
}

function calendarBlock(
  id: string,
  staffId: string,
  startMinutes: number,
  endMinutes: number,
  options: {
    rawStatus?: string;
  } = {},
): CalendarV2CalendarBlock {
  const appointment = appointmentFixture({
    id,
    staffId,
    startMinutes,
    endMinutes,
    rawStatus: options.rawStatus,
  });

  return {
    id,
    sourceEntityType: 'appointment',
    sourceEntityId: id,
    kind: 'appointment',
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    staffId,
    title: appointment.client.name,
    subtitle: appointment.service.name,
    color: appointment.service.color,
    schedulingState: 'scheduled',
    actionState: 'none',
    appointment,
    cardSummary: {
      title: appointment.client.name,
      subtitle: appointment.service.name,
      timeLabel: `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)}`,
      staffLabel: appointment.staff.name,
      tone: 'default',
      actionState: 'none',
    },
  };
}

function appointmentFixture(
  options: {
    id?: string;
    staffId?: string;
    startMinutes?: number;
    endMinutes?: number;
    rawStatus?: string;
  } = {},
): CalendarV2Appointment {
  const id = options.id ?? 'appointment-1';
  const staffId = options.staffId ?? 'staff-1';
  const startMinutes = options.startMinutes ?? 9 * 60;
  const endMinutes = options.endMinutes ?? 10 * 60;

  return {
    id,
    version: 1,
    startAt: dateAndMinutesToIso(CHECK_DATE, startMinutes),
    endAt: dateAndMinutesToIso(CHECK_DATE, endMinutes),
    schedulingState: 'scheduled',
    requestState: 'none',
    visitProgress: 'scheduled',
    confirmationState: 'confirmed',
    actionState: 'none',
    communicationState: 'none',
    client: {
      id: 'client-1',
      name: 'Mira Ivanova',
      phone: '+359888000000',
    },
    service: {
      id: 'service-1',
      name: 'Cut and style',
      durationMinutes: endMinutes - startMinutes,
      color: '#64748b',
    },
    staff: {
      id: staffId,
      name: RESOURCES.find((resource) => resource.id === staffId)?.name ?? staffId,
      color: '#64748b',
    },
    rawStatus: options.rawStatus ?? 'confirmed',
  };
}

function demandFixture(
  options: {
    durationMinutes?: number | null;
  } = {},
): CalendarV2DemandItem {
  return {
    id: 'demand-1',
    version: 2,
    source: 'booking_request',
    schedulingState: 'unscheduled',
    requestState: 'requested',
    actionState: 'requires_action',
    communicationState: 'pending',
    client: {
      id: 'client-1',
      name: 'Mira Ivanova',
      phone: '+359888000000',
    },
    service: {
      id: 'service-1',
      name: 'Cut and style',
      durationMinutes: 'durationMinutes' in options ? options.durationMinutes : 60,
      color: '#64748b',
    },
    preferredWindow: {
      date: '2026-05-05',
      startTime: null,
      endTime: null,
      label: 'Today',
    },
    notes: 'Fixture-only regression guard',
    createdAt: dateAndMinutesToIso(CHECK_DATE, 8 * 60),
  };
}

function manualBookingTarget({
  startMinutes,
  hasConflict = false,
}: {
  startMinutes: number;
  hasConflict?: boolean;
}) {
  return {
    kind: 'appointment' as const,
    staffId: 'staff-1',
    staffName: 'Mira',
    startAt: dateAndMinutesToIso(CHECK_DATE, startMinutes),
    endAt: dateAndMinutesToIso(CHECK_DATE, startMinutes + 15),
    durationMinutes: 15,
    hasConflict,
    isPast: false,
  };
}

function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function readSource(sourceDir: string, fileName: string) {
  return readFileSync(path.join(sourceDir, fileName), 'utf8');
}

function assertNoInternalLabel(value: string, message: string) {
  const forbiddenFragments = [
    'calendar-v2-spike:',
    'placeRequest ->',
    'moveAppointment ->',
  ];
  const leakedFragment = forbiddenFragments.find((fragment) => value.includes(fragment));

  assert(!leakedFragment, `${message}. Found ${String(leakedFragment)}.`);
}

function assertNoWriteTransportMarkers(value: unknown, message: string) {
  const serialized = JSON.stringify(value);
  const forbiddenFragments = [
    '"method":"POST"',
    '"method":"PATCH"',
    '"method":"DELETE"',
    '"apiPath"',
    '"endpoint"',
    '/appointments/admin',
    '/appointments/waitlist',
  ];
  const leakedFragment = forbiddenFragments.find((fragment) => serialized.includes(fragment));

  assert(!leakedFragment, `${message}. Found ${String(leakedFragment)}.`);
}

function apiError(status: number, message: string, code?: string) {
  return {
    response: {
      status,
      data: {
        message,
        code,
      },
    },
  };
}

function networkError() {
  return {
    code: 'ERR_NETWORK',
    request: {},
  };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
