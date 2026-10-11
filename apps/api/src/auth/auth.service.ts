import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../database/prisma.service.js';
import { atomic } from '../database/transaction.js';
import { object, str, email, password, currency } from '../common/input.js';
import type { Context } from '../common/context.js';
const scrypt = promisify(scryptCallback);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + ((await scrypt(value, salt, 64)) as Buffer).toString('hex');
}
export async function verifyPassword(value: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  return !!hash && hash.length === 128 && timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}
@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}
  private attempts = new Map<string, { count: number; until: number }>();
  async status() {
    return { needsSetup: (await this.db.user.count()) === 0 };
  }
  async setup(raw: unknown) {
    const b = object(raw),
      mail = email(b),
      name = str(b, 'name'),
      companyName = str(b, 'companyName'),
      cur = currency(b),
      hash = await hashPassword(password(b));
    const user = await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(884211)`;
      if (await tx.user.count()) throw new ConflictException('系统已初始化，请登录');
      return tx.user.create({
        data: {
          email: mail,
          name,
          passwordHash: hash,
          memberships: {
            create: {
              role: 'ADMIN',
              company: { create: { code: 'MAIN', name: companyName, currency: cur } },
            },
          },
        },
      });
    });
    return this.session(user.id, user.passwordHash);
  }
  async login(raw: unknown, ip: string) {
    const b = object(raw),
      mail = email(b),
      pass = str(b, 'password', 128),
      key = tokenHash(ip + mail),
      now = Date.now();
    for (const [k, v] of this.attempts) if (v.until < now) this.attempts.delete(k);
    const attempt = this.attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 10 || this.attempts.size > 10000)
      throw new HttpException('登录尝试过多，请 15 分钟后再试', 429);
    attempt.count++;
    this.attempts.set(key, attempt);
    const user = await this.db.user.findUnique({ where: { email: mail } });
    const dummy = '00000000000000000000000000000000:' + '0'.repeat(128);
    const valid = await verifyPassword(pass, user?.passwordHash ?? dummy);
    if (!user || !user.active || !valid) throw new UnauthorizedException('邮箱或密码不正确');
    this.attempts.delete(key);
    return this.session(user.id, user.passwordHash);
  }
  private async session(userId: string, passwordHash: string) {
    const token = randomBytes(32).toString('hex');
    await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await atomic(this.db, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.active) throw new UnauthorizedException('账号已停用，请联系管理员');
      if (user.passwordHash !== passwordHash) throw new UnauthorizedException('邮箱或密码不正确');
      await tx.session.create({
        data: {
          id: tokenHash(token),
          userId,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
      });
    });
    return { token };
  }
  async authenticate(token: string, companyId?: string): Promise<Context> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('请先登录');
    const session = await this.db.session.findUnique({
      where: { id: tokenHash(token) },
      include: { user: { include: { memberships: { orderBy: { companyId: 'asc' } } } } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new UnauthorizedException('登录已过期，请重新登录');
    const member = companyId
      ? session.user.memberships.find((m) => m.companyId === companyId)
      : session.user.memberships[0];
    if (!member) throw new UnauthorizedException('没有所选公司的访问权限');
    return {
      userId: session.userId,
      name: session.user.name,
      companyId: member.companyId,
      role: member.role,
      sessionId: session.id,
    };
  }
  async me(c: Context) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: c.userId },
      select: { id: true, name: true, email: true, memberships: { include: { company: true } } },
    });
    return { ...user, companyId: c.companyId, role: c.role };
  }
  async logout(c: Context) {
    await this.db.session.deleteMany({ where: { id: c.sessionId } });
    return { ok: true };
  }
  async changePassword(c: Context, raw: unknown) {
    const b = object(raw),
      user = await this.db.user.findUniqueOrThrow({ where: { id: c.userId } });
    if (!(await verifyPassword(str(b, 'oldPassword', 128), user.passwordHash)))
      throw new UnauthorizedException('原密码不正确');
    const hash = await hashPassword(password(b));
    await atomic(this.db, async (tx) => {
      await tx.user.update({ where: { id: c.userId }, data: { passwordHash: hash } });
      await tx.session.deleteMany({ where: { userId: c.userId } });
    });
    return { ok: true };
  }
}
