// 云函数：couple —— 情侣共册（需求 2-B）
//
// 职责：房间（两人共享）的创建/加入/退出/查询，以及共享快照的读写。
// 安全：所有房间级操作都在服务端校验「调用者是房间成员」，客户端不能越权。
//   快照文档存 onetab_snapshots/{roomId}，与个人快照同集合、不同 _id。
//
// 部署方式：微信开发者工具右键 cloudfunctions/couple →「上传并部署：云端安装依赖」
// 前提集合：onetab_rooms（建议权限：所有用户不可读写/仅管理端，因为只走云函数）
//
// [硬约束 #14] 云端只是一份快照，不是真相。合并语义（按 updatedAt 取新）在客户端
// repo.importData 里，云端不做合并职责——本函数只负责「把共享文档安全地交到成员手上」。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ROOMS = 'onetab_rooms';
const SNAP = 'onetab_snapshots';
/** 情侣共册是两个人的册子——硬上限 2 人（对应产品「不是大众决策」定位） */
const MAX_MEMBERS = 2;
/** 口令字母表：去掉易混淆的 0/O、1/I/L */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

/** 调用者 openid（微信上下文，客户端伪造不了） */
function me() {
  const { OPENID } = cloud.getWXContext();
  return OPENID;
}

function genCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

/** 查 openid 当前所在房间（一人只能在一个共册） */
async function findMyRoom(openid) {
  const res = await db.collection(ROOMS).where({ members: openid }).limit(1).get();
  return res.data.length > 0 ? res.data[0] : null;
}

/** 校验成员身份：返回房间 doc（含 data）或 null */
async function ensureMember(openid, roomId) {
  try {
    const res = await db.collection(ROOMS).doc(roomId).get();
    const room = res.data;
    return room && Array.isArray(room.members) && room.members.includes(openid) ? room : null;
  } catch {
    return null;
  }
}

async function actionCreate(openid) {
  if (await findMyRoom(openid)) return { ok: false, error: 'already_in_room' };
  // 生成不重复口令（最多重试 5 次）
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = genCode();
    const dup = await db.collection(ROOMS).where({ code }).count();
    if (dup.total === 0) break;
  }
  const add = await db.collection(ROOMS).add({
    data: { code, members: [openid], createdAt: Date.now(), createdBy: openid },
  });
  return { ok: true, roomId: add._id, code, members: [openid] };
}

async function actionJoin(openid, codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code || code.length !== CODE_LEN) return { ok: false, error: 'bad_code' };
  if (await findMyRoom(openid)) return { ok: false, error: 'already_in_room' };
  const found = await db.collection(ROOMS).where({ code }).limit(1).get();
  if (found.data.length === 0) return { ok: false, error: 'room_not_found' };
  const room = found.data[0];
  if (room.members.includes(openid)) {
    return { ok: true, roomId: room._id, code: room.code, members: room.members };
  }
  if (room.members.length >= MAX_MEMBERS) return { ok: false, error: 'room_full' };
  const members = [...room.members, openid];
  await db.collection(ROOMS).doc(room._id).update({ data: { members } });
  return { ok: true, roomId: room._id, code: room.code, members };
}

async function actionMyRoom(openid) {
  const room = await findMyRoom(openid);
  if (!room) return { ok: true, room: null };
  return { ok: true, room: { roomId: room._id, code: room.code, members: room.members } };
}

async function actionLeave(openid) {
  const room = await findMyRoom(openid);
  if (!room) return { ok: true };
  const members = room.members.filter(m => m !== openid);
  if (members.length === 0) {
    await db.collection(ROOMS).doc(room._id).remove();
    // 顺手清掉房间快照，不留孤儿
    try {
      await db.collection(SNAP).doc(room._id).remove();
    } catch {
      /* 快照可能不存在，忽略 */
    }
  } else {
    await db.collection(ROOMS).doc(room._id).update({ data: { members } });
  }
  return { ok: true };
}

async function actionGetSnapshot(openid, roomId) {
  if (!(await ensureMember(openid, roomId))) return { ok: false, error: 'not_member' };
  try {
    const res = await db.collection(SNAP).doc(roomId).get();
    // 文档结构：{ _id, data: <exportPayload>, updatedAt }
    return { ok: true, data: res.data && res.data.data ? res.data.data : null };
  } catch {
    // 房间还没有快照（新房间 / 成员刚建）——空数据由客户端本地兜底
    return { ok: true, data: null };
  }
}

async function actionPutSnapshot(openid, roomId, data) {
  if (!(await ensureMember(openid, roomId))) return { ok: false, error: 'not_member' };
  if (!data || typeof data !== 'object') return { ok: false, error: 'no_data' };
  await db.collection(SNAP).doc(roomId).set({ data: { data, updatedAt: Date.now() } });
  return { ok: true };
}

exports.main = async (event) => {
  const openid = me();
  const action = (event && event.action) || '';
  try {
    switch (action) {
      case 'create':
        return await actionCreate(openid);
      case 'join':
        return await actionJoin(openid, event.code);
      case 'myRoom':
        return await actionMyRoom(openid);
      case 'leave':
        return await actionLeave(openid);
      case 'getSnapshot':
        return await actionGetSnapshot(openid, event.roomId);
      case 'putSnapshot':
        return await actionPutSnapshot(openid, event.roomId, event.data);
      default:
        return { ok: false, error: 'unknown_action' };
    }
  } catch (e) {
    return { ok: false, error: e.message || 'server_error' };
  }
};
