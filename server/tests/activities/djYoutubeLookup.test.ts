// Tra cứu video YouTube cho bàn DJ (spec 2026-11-02 mục 3): ánh xạ mã HTTP của oEmbed, lỗi mạng / quá giờ vẫn nhận link,
// URL dựng lại từ id, bộ nhớ đệm theo id (chỉ kết quả nhận được — từ chối không đệm, tối đa 200 id).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DJ } from '@shared/index';
import { createOembedLookup, type OembedFetch, type YoutubeLookupResult } from '../../src/activities/dj/youtube';

const ID = 'dQw4w9WgXcQ';
const UNVERIFIED: YoutubeLookupResult = { ok: true, title: '', author: '', verified: false };

type Reply = { status: number; json?: unknown; jsonThrows?: boolean } | Error;

/** fetch giả: ghi lại URL + signal mỗi lần gọi, trả lời theo `reply`. */
function fakeFetch(reply: (url: string) => Reply) {
  const calls: { url: string; signal: AbortSignal }[] = [];
  const fetchFn: OembedFetch = async (url, init) => {
    calls.push({ url, signal: init.signal });
    const r = reply(url);
    if (r instanceof Error) throw r;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => {
        if (r.jsonThrows) throw new SyntaxError('Unexpected token < in JSON');
        return r.json;
      },
    };
  };
  return { fetchFn, calls };
}

const ok200 = (): Reply => ({ status: 200, json: { title: 'A', author_name: 'B' } });

afterEach(() => vi.restoreAllMocks());

describe('tra cứu oEmbed', () => {
  it('200 → tên + kênh, chắc chắn; URL dựng lại từ id, kèm signal hẹn giờ mặc định', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const f = fakeFetch(ok200);
    expect(await createOembedLookup(f.fetchFn)(ID)).toEqual({ ok: true, title: 'A', author: 'B', verified: true });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`),
    );
    expect(f.calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(DJ.youtube.lookupTimeoutMs);
  });

  it.each([
    [400, 'bad_id'],
    [401, 'no_embed'],
    [403, 'private'],
    [404, 'not_found'],
  ] as const)('%i → từ chối (%s)', async (status, reason) => {
    const f = fakeFetch(() => ({ status, json: 'Not Found' }));
    expect(await createOembedLookup(f.fetchFn)(ID)).toEqual({ ok: false, reason });
  });

  it.each([429, 500, 503])('%i → vẫn nhận link, chưa kiểm chứng', async (status) => {
    const f = fakeFetch(() => ({ status, json: { title: 'X' } }));
    expect(await createOembedLookup(f.fetchFn)(ID)).toEqual(UNVERIFIED);
  });

  it('fetch ném lỗi (mạng / AbortError) → vẫn nhận link', async () => {
    const net = fakeFetch(() => new TypeError('fetch failed'));
    expect(await createOembedLookup(net.fetchFn)(ID)).toEqual(UNVERIFIED);
    const abort = fakeFetch(() => Object.assign(new Error('aborted'), { name: 'AbortError' }));
    expect(await createOembedLookup(abort.fetchFn)(ID)).toEqual(UNVERIFIED);
  });

  it('JSON hỏng → vẫn nhận link', async () => {
    const f = fakeFetch(() => ({ status: 200, jsonThrows: true }));
    expect(await createOembedLookup(f.fetchFn)(ID)).toEqual(UNVERIFIED);
  });

  it('200 thiếu tên / tên không phải chuỗi / thân null → chắc chắn, tên rỗng', async () => {
    const missing = fakeFetch(() => ({ status: 200, json: { author_name: 'B' } }));
    expect(await createOembedLookup(missing.fetchFn)(ID)).toEqual({ ok: true, title: '', author: 'B', verified: true });
    const wrong = fakeFetch(() => ({ status: 200, json: { title: 42, author_name: ['x'] } }));
    expect(await createOembedLookup(wrong.fetchFn)(ID)).toEqual({ ok: true, title: '', author: '', verified: true });
    const empty = fakeFetch(() => ({ status: 200, json: null }));
    expect(await createOembedLookup(empty.fetchFn)(ID)).toEqual({ ok: true, title: '', author: '', verified: true });
  });

  it('quá giờ → fetch bị hủy qua signal, vẫn nhận link', async () => {
    const signals: AbortSignal[] = [];
    const hang: OembedFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        signals.push(init.signal);
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    expect(await createOembedLookup(hang, 20)(ID)).toEqual(UNVERIFIED);
    expect(signals[0]!.aborted).toBe(true);
    expect((signals[0]!.reason as Error).name).toBe('TimeoutError');
  });
});

describe('bộ nhớ đệm', () => {
  it('kết quả nhận (200) đệm theo id — fetch chỉ chạy 1 lần', async () => {
    const f = fakeFetch(ok200);
    const lookup = createOembedLookup(f.fetchFn);
    expect(await lookup(ID)).toEqual({ ok: true, title: 'A', author: 'B', verified: true });
    expect(await lookup(ID)).toEqual({ ok: true, title: 'A', author: 'B', verified: true });
    expect(f.calls).toHaveLength(1);
  });

  it('từ chối (400/401/403/404) không đệm — chủ video mở công khai / cho nhúng thì dán lại được ngay', async () => {
    let reply: Reply = { status: 403 };
    const f = fakeFetch(() => reply);
    const lookup = createOembedLookup(f.fetchFn);
    expect(await lookup(ID)).toEqual({ ok: false, reason: 'private' });
    reply = { status: 401 };
    expect(await lookup(ID)).toEqual({ ok: false, reason: 'no_embed' });
    reply = ok200();
    expect(await lookup(ID)).toEqual({ ok: true, title: 'A', author: 'B', verified: true });
    expect(f.calls).toHaveLength(3);
  });

  it('lỗi mạng / 5xx / JSON hỏng không đệm — lần sau tra lại', async () => {
    let reply: Reply = new TypeError('fetch failed');
    const f = fakeFetch(() => reply);
    const lookup = createOembedLookup(f.fetchFn);
    expect(await lookup(ID)).toEqual(UNVERIFIED);
    reply = { status: 503 };
    expect(await lookup(ID)).toEqual(UNVERIFIED);
    reply = { status: 200, jsonThrows: true };
    expect(await lookup(ID)).toEqual(UNVERIFIED);
    reply = ok200();
    expect(await lookup(ID)).toEqual({ ok: true, title: 'A', author: 'B', verified: true });
    expect(f.calls).toHaveLength(4);
  });

  it('đệm tối đa 200 id: id thứ 201 đẩy id cũ nhất ra', async () => {
    const f = fakeFetch(ok200);
    const lookup = createOembedLookup(f.fetchFn);
    const ids = Array.from({ length: 201 }, (_, i) => `v${String(i).padStart(10, '0')}`);
    for (const id of ids) await lookup(id);
    expect(f.calls).toHaveLength(201);
    await lookup(ids[1]!); // vẫn trong đệm
    await lookup(ids[200]!);
    expect(f.calls).toHaveLength(201);
    await lookup(ids[0]!); // đã bị đẩy ra → tra lại
    expect(f.calls).toHaveLength(202);
  });
});
