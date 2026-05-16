import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantOwnerAdminGuard } from '../src/common/guards/tenant-owner-admin.guard';

function createExecutionContext(user?: { role?: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('tenant diagnostics authentication guards', () => {
  it('rejects unauthenticated requests through the existing JWT guard', () => {
    const guard = new JwtAuthGuard();

    expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
  });

  it.each(['OWNER', 'ADMIN'])('allows %s roles', (role) => {
    const guard = new TenantOwnerAdminGuard();

    expect(guard.canActivate(createExecutionContext({ role }))).toBe(true);
  });

  it('rejects non-owner/non-admin roles', () => {
    const guard = new TenantOwnerAdminGuard();

    expect(() => guard.canActivate(createExecutionContext({ role: 'STAFF' }))).toThrow(
      ForbiddenException,
    );
  });
});
