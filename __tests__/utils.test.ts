import { getChatId } from '../src/utils/chatId';
import { formatLastSeen, formatListTime, formatMessageTime } from '../src/utils/formatTime';
import { validateLogin, validateRegister } from '../src/utils/validation';
import { getAvatarColor, getInitials } from '../src/utils/avatarColor';
import { getMapsUrl } from '../src/utils/mapsUrl';

describe('getChatId', () => {
  test('sorts uids so both sides share one room', () => {
    expect(getChatId('b', 'a')).toBe('a_b');
    expect(getChatId('a', 'b')).toBe(getChatId('b', 'a'));
  });
});

describe('formatTime', () => {
  const now = new Date(2026, 9, 28, 10, 0).getTime();

  test('message time is HH:mm', () => {
    expect(formatMessageTime(new Date(2026, 9, 28, 9, 5).getTime())).toBe('09:05');
  });

  test('missing timestamp gives empty string', () => {
    expect(formatMessageTime(undefined)).toBe('');
    expect(formatListTime(undefined, now)).toBe('');
    expect(formatLastSeen(undefined, now)).toBe('');
  });

  test('list time shows HH:mm today and dd/MM on other days', () => {
    expect(formatListTime(new Date(2026, 9, 28, 8, 30).getTime(), now)).toBe('08:30');
    expect(formatListTime(new Date(2026, 9, 27, 9, 5).getTime(), now)).toBe('27/10');
  });

  test('last seen text', () => {
    const ago = (ms: number) => formatLastSeen(now - ms, now);
    expect(ago(20 * 1000)).toBe('Vừa mới hoạt động');
    expect(ago(5 * 60 * 1000)).toBe('Hoạt động 5 phút trước');
    expect(ago(59 * 60 * 1000)).toBe('Hoạt động 59 phút trước');
    expect(ago(90 * 60 * 1000)).toBe('Hoạt động 1 giờ trước');
    expect(ago(3 * 24 * 3600 * 1000)).toBe('Hoạt động 3 ngày trước');
    expect(formatLastSeen(new Date(2026, 9, 2, 8, 30).getTime(), now)).toBe('Hoạt động ngày 02/10');
  });
});

describe('validateRegister', () => {
  const ok = { name: 'An', email: 'a@b.com', password: '123456', confirm: '123456' };

  test('valid input (with surrounding spaces) has no errors', () => {
    expect(validateRegister({ ...ok, email: ' a@b.com ' })).toEqual({});
  });

  test('blank name', () => {
    expect(validateRegister({ ...ok, name: '  ' }).name).toBe('Vui lòng nhập họ tên');
  });

  test('invalid email', () => {
    expect(validateRegister({ ...ok, email: 'abc' }).email).toBe('Email không hợp lệ');
  });

  test('password shorter than 6', () => {
    expect(validateRegister({ ...ok, password: '12345', confirm: '12345' }).password).toBe(
      'Mật khẩu tối thiểu 6 ký tự',
    );
  });

  test('confirm mismatch', () => {
    expect(validateRegister({ ...ok, confirm: '1234567' }).confirm).toBe(
      'Mật khẩu nhập lại không khớp',
    );
  });
});

describe('validateLogin', () => {
  test('requires email and password', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Vui lòng nhập email',
      password: 'Vui lòng nhập mật khẩu',
    });
    expect(validateLogin({ email: 'a@b.com', password: 'x' })).toEqual({});
  });
});

describe('avatar', () => {
  test('initials take first and last word', () => {
    expect(getInitials('nguyễn văn an')).toBe('NA');
    expect(getInitials('  bình ')).toBe('B');
    expect(getInitials('')).toBe('?');
  });

  test('color is stable per uid', () => {
    expect(getAvatarColor('uid1')).toBe(getAvatarColor('uid1'));
    expect(getAvatarColor('uid1')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});


describe('getMapsUrl', () => {
  test('builds Google Maps search url for coordinates', () => {
    expect(getMapsUrl(21.0285, 105.8542)).toBe(
      'https://www.google.com/maps/search/?api=1&query=21.0285,105.8542',
    );
  });
});
