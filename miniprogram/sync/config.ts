/**
 * 云同步配置 [硬约束 #14]
 *
 * 留空 = 云同步关闭，LocalStore 是唯一真相来源。
 * 填入你的微信云开发环境 ID 后，TcbSyncAdapter 自动启用。
 * 无论开关如何，删掉整个 sync/ 目录 App 依然能跑——这条铁律不因 V2 而松动。
 *
 * 启用清单（按顺序做）：
 *   1. 微信开发者工具 → 「云开发」→ 开通并创建环境，拿到环境 ID
 *   2. 云开发控制台 → 数据库 → 创建集合 onetab_snapshots（权限：仅创建者可读写）
 *   3. 右键 cloudfunctions/login → 「上传并部署：云端安装依赖」
 *   4. 把环境 ID 填到下方 SYNC_ENV_ID
 */

/** 微信云开发环境 ID；留空则云同步整体禁用（默认） */
export const SYNC_ENV_ID = '';

/** 存快照的集合名（需在云开发控制台创建，权限设为「仅创建者可读写」） */
export const SYNC_COLLECTION = 'onetab_snapshots';
