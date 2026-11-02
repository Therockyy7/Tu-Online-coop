// YouTube ở bàn DJ (spec 2026-11-02-dj-youtube-led-design.md): đọc link người dán (mọi dạng nhận / từ chối, giây bắt đầu),
// bảng mã lỗi trình phát, làm sạch tên video, khóa nguồn đang phát / tên nguồn.
import { describe, expect, it } from 'vitest';
import { DJ } from '../src/config/balance';
import { DJ_RECORDED, djNowTitle, djSourceKey, trackInfo, type DjYoutubeNow } from '../src/activities/dj';
import { YT_FATAL_ERRORS, parseYoutubeUrl, youtubeErrorText, youtubeWatchUrl } from '../src/activities/youtube';
import { sanitizeTitle } from '../src/util/names';

const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeUrl', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, 0],
    [`youtube.com/watch?v=${ID}&t=1m30s&list=PL1`, 90_000],
    [`https://youtu.be/${ID}?si=abc&t=42`, 42_000],
    [`https://m.youtube.com/shorts/${ID}?feature=share`, 0],
    [`https://music.youtube.com/watch?v=${ID}#t=10`, 10_000],
    [`https://www.youtube-nocookie.com/embed/${ID}?start=5`, 5000],
    [`https://www.youtube.com:443/live/${ID}`, 0],
    [`https://www.youtube.com/watch?feature=x&v=${ID}&t=1h2m3s`, 3_723_000],
    [`https://www.youtube.com/embed/${ID}`, 0],
    [`http://youtube.com/v/${ID}`, 0],
    [ID, 0],
    [`  ${`https://youtu.be/${ID}`}  `, 0],
  ])('nhận %s', (url, startMs) => expect(parseYoutubeUrl(url)).toEqual({ videoId: ID, startMs }));

  it.each([
    `https://youtube.com@evil.com/watch?v=${ID}`,
    'https://www.youtube.com/embed/videoseries?list=PL',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@kenh',
    'javascript:alert(1)',
    `ftp://youtube.com/watch?v=${ID}`,
    'https://youtube.com/watch?v=dQw4w9WgXc',
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com/clip/Ugkx${'a'.repeat(30)}`,
    `https://youtu.be/${ID} x`,
    '',
    `https://youtu.be/${ID}?x=${'a'.repeat(DJ.youtube.urlMax)}`,
  ])('từ chối %s', (url) => expect(parseYoutubeUrl(url)).toBeNull());

  it('t= sai dạng → 0, không âm, kẹp 12 giờ', () => {
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=abc`)?.startMs).toBe(0);
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=-30`)?.startMs).toBe(0);
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=99h`)?.startMs).toBe(12 * 3600_000);
  });

  it('không phải chuỗi → null', () => expect(parseYoutubeUrl(42)).toBeNull());
});

describe('mã lỗi + link xem', () => {
  it('youtubeWatchUrl dựng lại link xem từ id', () => {
    expect(youtubeWatchUrl(ID)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('lỗi chết: 2, 100, 101, 150, 153 — mã 5 chỉ tại máy', () => {
    for (const code of [2, 100, 101, 150, 153]) expect(YT_FATAL_ERRORS).toContain(code);
    expect(YT_FATAL_ERRORS).not.toContain(5);
  });

  it('lý do lỗi viết cho người chơi; mã lạ vẫn có chữ', () => {
    expect(youtubeErrorText(150)).toContain('chặn');
    expect(youtubeErrorText(101)).toContain('chặn');
    expect(youtubeErrorText(999)).toContain('999');
  });
});

describe('sanitizeTitle', () => {
  it('bỏ ký tự zero-width / điều khiển, gộp khoảng trắng', () => {
    expect(sanitizeTitle('Ha' + String.fromCharCode(0x200b) + 'Na', 80)).toBe('HaNa');
    expect(sanitizeTitle('a\u0007b‮c', 80)).toBe('abc');
    expect(sanitizeTitle('  Chú   Đại    Bi  ', 80)).toBe('Chú Đại Bi');
  });

  it('dài hơn max → cắt + "…", đúng max ký tự; vừa max thì giữ nguyên', () => {
    const r = sanitizeTitle('a'.repeat(200), 80)!;
    expect([...r].length).toBe(80);
    expect(r.endsWith('…')).toBe(true);
    expect(r.startsWith('a'.repeat(79))).toBe(true);
    expect(sanitizeTitle('b'.repeat(80), 80)).toBe('b'.repeat(80));
  });

  it('rỗng / chỉ khoảng trắng / không phải chuỗi → null', () => {
    expect(sanitizeTitle('', 80)).toBeNull();
    expect(sanitizeTitle('   ​ ', 80)).toBeNull();
    expect(sanitizeTitle(42, 80)).toBeNull();
    expect(sanitizeTitle(null, 80)).toBeNull();
  });

  it('cắt theo ký tự, không cắt đôi emoji', () => {
    const r = sanitizeTitle('a' + '😀'.repeat(20), 5)!;
    expect(r).toBe('a😀😀😀…');
    // Không còn nửa cặp surrogate lẻ.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(r)).toBe(false);
  });
});

describe('djSourceKey / djNowTitle', () => {
  const yt: DjYoutubeNow = {
    key: 7,
    videoId: ID,
    title: 'Tên video',
    author: 'Kênh',
    startMs: 0,
    byPid: 'a',
    byName: 'A',
    durationMs: 0,
    live: false,
  };
  const trackId = DJ_RECORDED[1]!.id;

  it('khóa nguồn: bài có sẵn = id bài; YouTube = yt:<key>', () => {
    expect(djSourceKey({ trackId, yt: null })).toBe(trackId);
    expect(djSourceKey({ trackId, yt })).toBe('yt:7');
    expect(djSourceKey({ trackId, yt: { ...yt, key: 8 } })).toBe('yt:8');
  });

  it('tên nguồn: YouTube = tên video; có sẵn = tên bài', () => {
    expect(djNowTitle({ trackId, yt })).toBe('Tên video');
    expect(djNowTitle({ trackId, yt: null })).toBe(trackInfo(trackId).name);
  });
});
