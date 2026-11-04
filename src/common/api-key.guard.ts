import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-api-key'] !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
