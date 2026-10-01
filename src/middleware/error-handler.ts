import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  console.error(error);

  response.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
