export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { identifier, table } = await context.request.json() as {
    identifier: string;
    table: string;
  };

  if (!identifier || table === undefined) {
    return new Response(JSON.stringify({ error: '缺少 identifier 或 table' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = context.env.DB;

  // 先按 id 查找
  let record = await db.prepare(
    "SELECT id, data FROM spells WHERE json_extract(data, '$.id') = ?"
  ).bind(identifier).first();

  // 未找到则按 name 查找
  if (!record) {
    record = await db.prepare(
      "SELECT id, data FROM spells WHERE json_extract(data, '$.name') = ?"
    ).bind(identifier).first();
  }

  if (!record) {
    return new Response(JSON.stringify({ error: '未找到匹配的法术' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 更新 data 中的 table 字段
  const currentData = JSON.parse((record as any).data);
  currentData.table = table;
  const newData = JSON.stringify(currentData);

  await db.prepare('UPDATE spells SET data = ? WHERE id = ?')
    .bind(newData, (record as any).id)
    .run();

  return new Response(JSON.stringify({ success: true, id: (record as any).id }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
