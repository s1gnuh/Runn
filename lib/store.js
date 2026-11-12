'use strict';
// Kho lưu subscription. Dùng Upstash Redis qua REST nên chạy được trên
// serverless mà không cần giữ kết nối.
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const HASH_KEY = 'bn27:subs';
const MAX_SUBS = 50;

// Vercel đặt tên biến khác nhau tuỳ cách nối kho, và còn cho thêm tiền tố,
// nên thử các tên quen trước rồi mới dò theo đuôi tên biến.
function pickRedisEnv() {
  const e = process.env;
  const pairs = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  ];
  for (const [u, t] of pairs) if (e[u] && e[t]) return { url: e[u], token: e[t], from: u };

  const urlKey = Object.keys(e).find((k) => /REST_API_URL$/.test(k) && e[k]);
  if (!urlKey) return null;
  const sameName = urlKey.replace(/URL$/, 'TOKEN');
  // Token chỉ-đọc không ghi được, phải loại ra.
  const tokenKey = (e[sameName] && sameName)
    || Object.keys(e).find((k) => /REST_API_TOKEN$/.test(k) && !/READ_ONLY/.test(k) && e[k]);
  return tokenKey ? { url: e[urlKey], token: e[tokenKey], from: urlKey } : null;
}

function getRedis() {
  const cfg = pickRedisEnv();
  return cfg ? new Redis({ url: cfg.url, token: cfg.token }) : null;
}

function subId(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 24);
}

function parseRecord(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function putSub(redis, id, record) {
  const all = await redis.hgetall(HASH_KEY);
  const count = all ? Object.keys(all).length : 0;
  if (count >= MAX_SUBS && !(all && all[id])) {
    const err = new Error('too_many_subscriptions');
    err.code = 'too_many_subscriptions';
    throw err;
  }
  await redis.hset(HASH_KEY, { [id]: JSON.stringify(record) });
}

async function allSubs(redis) {
  const all = await redis.hgetall(HASH_KEY);
  if (!all) return [];
  return Object.keys(all)
    .map((id) => ({ id, rec: parseRecord(all[id]) }))
    .filter((x) => x.rec && x.rec.sub && x.rec.sub.endpoint);
}

async function dropSub(redis, id) {
  await redis.hdel(HASH_KEY, id);
}

module.exports = { getRedis, pickRedisEnv, subId, putSub, allSubs, dropSub, HASH_KEY };
