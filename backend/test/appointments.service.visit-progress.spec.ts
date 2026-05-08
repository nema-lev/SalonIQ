import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AppointmentStatus, VisitProgress } from '../src/common/types/enums';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { UpdateVisitProgressDto } from '../src/modules/appointments/dto/update-visit-progress.dto';

const TENANT = {
  id: 'tenant-id',
  slug: 'demo-business',
  schemaName: 'tenant_demo_business',
};

function createService(queryInSchema: jest.Mock) {
  return new AppointmentsService(
    { queryInSchema } as any,
    { add: jest.fn() } as any,
    { process: jest.fn() } as any,
  );
}

describe('AppointmentsService.updateVisitProgress', () => {
  it('marks a confirmed appointment as checked_in without replacing intake_data', async () => {
    const queryInSchema = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'appointment-id',
          status: AppointmentStatus.CONFIRMED,
          intake_data: { allergies: ['color'], notes: 'keep me' },
        },
      ])
      .mockResolvedValueOnce([]);
    const service = createService(queryInSchema);

    const result = await service.updateVisitProgress(
      TENANT as any,
      'appointment-id',
      VisitProgress.CHECKED_IN,
    );

    expect(result).toEqual({
      id: 'appointment-id',
      progress: VisitProgress.CHECKED_IN,
      label: 'Пристигнал',
    });
    expect(queryInSchema).toHaveBeenCalledTimes(2);
    expect(queryInSchema.mock.calls[1][0]).toBe(TENANT.schemaName);
    expect(queryInSchema.mock.calls[1][1]).toContain('jsonb_set');
    expect(queryInSchema.mock.calls[1][1]).toContain("'{visitProgress}'");
    expect(queryInSchema.mock.calls[1][1]).toContain("COALESCE(intake_data, '{}'::jsonb)");
    expect(queryInSchema.mock.calls[1][2]).toEqual([
      VisitProgress.CHECKED_IN,
      'appointment-id',
    ]);
  });

  it('returns success without writing when checked_in is repeated', async () => {
    const queryInSchema = jest.fn().mockResolvedValueOnce([
      {
        id: 'appointment-id',
        status: AppointmentStatus.CONFIRMED,
        intake_data: { visitProgress: VisitProgress.CHECKED_IN, source: 'existing' },
      },
    ]);
    const service = createService(queryInSchema);

    const result = await service.updateVisitProgress(
      TENANT as any,
      'appointment-id',
      VisitProgress.CHECKED_IN,
    );

    expect(result).toEqual({
      id: 'appointment-id',
      progress: VisitProgress.CHECKED_IN,
      label: 'Пристигнал',
    });
    expect(queryInSchema).toHaveBeenCalledTimes(1);
  });

  it.each([AppointmentStatus.PENDING, AppointmentStatus.PROPOSAL_PENDING])(
    'rejects checked_in for non-confirmed status %s',
    async (status) => {
      const queryInSchema = jest.fn().mockResolvedValueOnce([
        {
          id: 'appointment-id',
          status,
          intake_data: {},
        },
      ]);
      const service = createService(queryInSchema);

      await expect(
        service.updateVisitProgress(TENANT as any, 'appointment-id', VisitProgress.CHECKED_IN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queryInSchema).toHaveBeenCalledTimes(1);
    },
  );

  it.each([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW])(
    'rejects checked_in for terminal status %s',
    async (status) => {
      const queryInSchema = jest.fn().mockResolvedValueOnce([
        {
          id: 'appointment-id',
          status,
          intake_data: {},
        },
      ]);
      const service = createService(queryInSchema);

      await expect(
        service.updateVisitProgress(TENANT as any, 'appointment-id', VisitProgress.CHECKED_IN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queryInSchema).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects moving an in-service appointment back to checked_in', async () => {
    const queryInSchema = jest.fn().mockResolvedValueOnce([
      {
        id: 'appointment-id',
        status: AppointmentStatus.CONFIRMED,
        intake_data: { visitProgress: VisitProgress.IN_SERVICE },
      },
    ]);
    const service = createService(queryInSchema);

    await expect(
      service.updateVisitProgress(TENANT as any, 'appointment-id', VisitProgress.CHECKED_IN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryInSchema).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateVisitProgressDto', () => {
  it('rejects invalid progress before service logic', async () => {
    const dto = plainToInstance(UpdateVisitProgressDto, { progress: 'arrived' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('progress');
  });
});
