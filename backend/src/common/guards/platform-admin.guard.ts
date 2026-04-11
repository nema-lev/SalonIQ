import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string; scope?: string } }>();
    const user = request.user;

    if (!user || user.role !== 'SUPER_ADMIN' || user.scope !== 'platform') {
      throw new ForbiddenException('Изисква се platform super admin достъп.');
    }

    return true;
  }
}
