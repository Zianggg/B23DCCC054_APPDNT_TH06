// Kiểm thử luật bảo mật (database.rules.json) trên Firebase Realtime Database Emulator.
// Chạy:  firebase emulators:exec --only database --project demo-th06 "node scripts/test-rules.mjs"
//
// Emulator không kiểm tra chữ ký token, nên mỗi "người dùng" là một JWT không ký chứa uid.
// "owner" là quyền quản trị của emulator, chỉ dùng để nạp dữ liệu mẫu.

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000';
const PROJECT = 'demo-th06';
// Luật trong firebase.json được nạp cho instance mặc định "<project>-default-rtdb"
const NS = `${PROJECT}-default-rtdb`;

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
function tokenFor(uid) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    firebase: { sign_in_provider: 'password' },
  })}.`;
}

async function call(who, method, path, body) {
  // Quản trị: header "Bearer owner" (bỏ qua luật). Người dùng: ID token qua tham số ?auth= (áp dụng luật).
  const url =
    who === 'owner'
      ? `http://${HOST}/${path}.json?ns=${NS}`
      : `http://${HOST}/${path}.json?ns=${NS}&auth=${tokenFor(who)}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(who === 'owner' ? { Authorization: 'Bearer owner' } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// ---------- Dữ liệu mẫu: nhóm g1 gồm An (trưởng nhóm), Bình; Chi là người ngoài ----------
const NOW = Date.now();
await call('owner', 'PUT', '', {
  users: {
    an: { name: 'An', email: 'an@x.com', online: true },
    binh: { name: 'Bình', email: 'binh@x.com', online: true },
    chi: { name: 'Chi', email: 'chi@x.com', online: true },
  },
  conversations: {
    g1: { type: 'group', name: 'Nhóm học', members: { an: true, binh: true }, createdBy: 'an', createdAt: NOW },
  },
  messages: {
    g1: {
      m1: { senderId: 'an', type: 'text', text: 'Chào cả nhóm', createdAt: NOW },
      m2: { senderId: 'binh', type: 'text', text: 'Chào An', createdAt: NOW },
    },
  },
  userChats: { an: { g1: { lastMessage: 'Chào An', updatedAt: NOW, unread: 0 } } },
});

const cases = [
  // [người thực hiện, mô tả, method, path, body, kết quả mong đợi]
  ['chi', 'Người ngoài ĐỌC tin nhắn của nhóm', 'GET', 'messages/g1', undefined, 'deny'],
  ['chi', 'Người ngoài GỬI tin vào nhóm', 'PUT', 'messages/g1/x1', { senderId: 'chi', type: 'text', text: 'hi', createdAt: NOW }, 'deny'],
  ['binh', 'Thành viên gửi tin nhưng giả senderId của An', 'PUT', 'messages/g1/x2', { senderId: 'an', type: 'text', text: 'giả', createdAt: NOW }, 'deny'],
  ['binh', 'Thành viên gửi tin hợp lệ', 'PUT', 'messages/g1/x3', { senderId: 'binh', type: 'text', text: 'ok', createdAt: NOW }, 'allow'],
  ['binh', 'Bình THU HỒI tin của An', 'PATCH', 'messages/g1/m1', { recalled: true, text: null }, 'deny'],
  ['an', 'An thu hồi tin của chính mình', 'PATCH', 'messages/g1/m1', { recalled: true, text: null }, 'allow'],
  ['binh', 'Bình ghi trạng thái ĐANG GÕ thay cho An', 'PUT', 'typing/g1/an', true, 'deny'],
  ['binh', 'Bình ghi trạng thái đang gõ của chính mình', 'PUT', 'typing/g1/binh', true, 'allow'],
  ['binh', 'Bình thả CẢM XÚC dưới tên An', 'PUT', 'messages/g1/m2/reactions/an', '❤️', 'deny'],
  ['binh', 'Bình thả cảm xúc của chính mình', 'PUT', 'messages/g1/m2/reactions/binh', '❤️', 'allow'],
  ['binh', 'Bình thả cảm xúc không có trong danh sách', 'PUT', 'messages/g1/m2/reactions/binh', '💩', 'deny'],
  ['binh', 'Thành viên thường ĐỔI TÊN nhóm', 'PUT', 'conversations/g1/name', 'Bị đổi', 'deny'],
  ['an', 'Trưởng nhóm đổi tên nhóm', 'PUT', 'conversations/g1/name', 'Nhóm Lớp', 'allow'],
  ['binh', 'Thành viên thường XÓA trưởng nhóm khỏi nhóm', 'DELETE', 'conversations/g1/members/an', undefined, 'deny'],
  ['chi', 'Người ngoài TỰ THÊM mình vào nhóm', 'PUT', 'conversations/g1/members/chi', true, 'deny'],
  ['chi', 'Người ngoài sửa dòng tin cuối ở Home của An', 'PUT', 'userChats/an/g1/lastMessage', 'hack', 'deny'],
  ['binh', 'Bình đọc THÔNG BÁO của An', 'GET', 'notifications/an', undefined, 'deny'],
  ['binh', 'Bình tạo thông báo giả mạo fromUid = An', 'PUT', 'notifications/an/n1', { type: 'message', convId: 'g1', fromUid: 'an', text: 'x', createdAt: NOW, read: false }, 'deny'],
  ['binh', 'Bình tạo thông báo hợp lệ cho An', 'PUT', 'notifications/an/n2', { type: 'message', convId: 'g1', fromUid: 'binh', text: 'x', createdAt: NOW, read: false }, 'allow'],
  ['binh', 'Thành viên tự rời nhóm', 'DELETE', 'conversations/g1/members/binh', undefined, 'allow'],
];

let failed = 0;
console.log('\nKIỂM THỬ LUẬT BẢO MẬT, Firebase Realtime Database Emulator\n');
for (const [who, label, method, path, body, expect] of cases) {
  const r = await call(who, method, path, body);
  const denied = !r.ok && /permission denied/i.test(r.text);
  const got = r.ok ? 'allow' : denied ? 'deny' : `error ${r.status}`;
  const pass = got === expect;
  if (!pass) {
    failed++;
  }
  const result = r.ok ? 'ĐƯỢC PHÉP        ' : denied ? 'PERMISSION_DENIED' : `LỖI ${r.status}          `;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${result}  [${who.padEnd(4)}] ${method.padEnd(6)} /${path}  ${label}`);
}
console.log(`\n${cases.length - failed}/${cases.length} trường hợp đúng như mong đợi.`);
process.exit(failed ? 1 : 0);
