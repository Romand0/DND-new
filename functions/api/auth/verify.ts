import { jsonResponse, errorResponse, handleOptions } from '../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const valid = request.headers.get('Authorization')?.startsWith('Bearer ') &&
    request.headers.get('Authorization')!.slice(7) === env.DM_TOKEN;
  return jsonResponse({ valid });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
