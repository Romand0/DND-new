import { jsonResponse } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  return jsonResponse({
    jwtExists: !!env.JWT_SECRET,
    jwtPrefix: env.JWT_SECRET ? env.JWT_SECRET.substring(0, 5) : null,
    dbExists: !!env.DB,
  });
};
