import { InternalError, logger } from '.';
import { NextFunction, Request, Response } from 'express';

type Callback = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function Wrapper(cb: Callback): Callback {
  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      return await cb(req, res, next);
    } catch (err) {
      if (process.env.NODE_ENV === 'dev') {
        logger.error(err.message);
        logger.error(err.stack);
      }

      let opcode;
      let message = '알 수 없는 오류가 발생했습니다.';

      if (err instanceof InternalError) {
        opcode = err.opcode;
        message = err.message;
      }

      res.status(500).json({
        opcode,
        message,
      });
    }
  };
}
