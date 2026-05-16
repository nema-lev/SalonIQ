import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class TenantOwnerAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = request.user?.role;

    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Изисква се owner/admin достъп.');
    }

    return true;
  }
}
