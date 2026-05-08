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
  getGridHeight,
  getMinutesFromDateTime,
  getResourceFromX,
  minutesToPixels,
  slotFromPointer,
  snapToSlot,
  timeToY,
  yToTime,
  type NativeSchedulerResource,
} from './native-scheduler-geometry';
import {
  DEFAULT_PLACEMENT_DURATION_MINUTES,
  commandPreviewLabel,
  createMoveAppointmentCommand,
  createPlaceRequestCommand,
  createPlaceRequestCommandPreview,
  detectLocalPlacementConflict,
  getPlacementDurationMinutes,
  hasPassedDragThreshold,
  usesFallbackPlacementDuration,
} from './native-scheduler-drag';

export type NativeSchedulerRegressionCheckResult = {
  name: string;
  passed: true;
};

type RegressionCheck = {
  name: string;
  run: () => void;
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

export function runNativeSchedulerRegressionChecks(sourceDir?: string): NativeSchedulerRegressionCheckResult[] {
  const activeChecks = sourceDir ? [...checks, ...getSourceChecks(sourceDir)] : checks;

  return activeChecks.map((check) => {
    check.run();
    return { name: check.name, passed: true };
  });
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
          schedulerSource.includes('selectedBlock={placementPanelContext ? null : selectedBlock}'),
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
          previewPanelSource.includes("isPlacementContext ? 'Поставяне на заявка' : 'Детайли за час'"),
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
): CalendarV2CalendarBlock {
  const appointment = appointmentFixture({
    id,
    staffId,
    startMinutes,
    endMinutes,
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
