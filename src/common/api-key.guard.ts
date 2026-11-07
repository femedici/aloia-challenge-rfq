import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const configured = process.env.INTERNAL_API_KEY;
    const supplied = req.headers['x-api-key'];
    if (!configured || typeof supplied !== 'string' ||
      Buffer.byteLength(configured) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) {
      throw new UnauthorizedException('X-Api-Key ausente ou inválida');
    }
    return true;
  }
}
