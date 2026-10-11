import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500,
      message = '服务暂时不可用，请稍后重试';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message =
        typeof body === 'string' ? body : ((body as { message?: string }).message ?? message);
    } else {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        status = 409;
        message = '编号、名称或请求已存在，请勿重复提交';
      } else if (code === 'P2025') {
        status = 404;
        message = '记录不存在';
      } else if (code === 'P2003') {
        status = 409;
        message = '该记录已被其他业务使用，不能删除';
      } else this.logger.error(error instanceof Error ? error.message : 'Unknown exception');
    }
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, message });
  }
}
