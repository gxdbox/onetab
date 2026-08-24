/**
 * 手写灵感卡起始包 [硬约束 #11]
 *
 * 空库是这个产品的头号杀手：新用户没东西可抽 = 没有第一次「就这个吧」。
 * 灵感卡是第一道防线——但有一条铁律：
 *   一律「点一下才采纳」，绝不自动灌进用户的库。
 *   同意的成本必须由用户亲手支付（starter 页的 adopt 方法是唯一入口）。
 *
 * 采纳后以 wish + source:'starter' 入库——它们不是用户亲自验证的，
 * 源标记让用户知道这一点，也永远不进「安全牌」池。
 *
 * 文案必须手写、带一句「为什么它大概率会让你开心」——
 * 起始包的质量直接决定新手转化。
 */
import { SceneId } from './types';

export interface StarterCard {
  name: string;
  sceneId: SceneId;
  why: string;
}

export const STARTER_PACK: StarterCard[] = [
  // 🍜 吃什么
  { name: '楼下那碗牛肉面', sceneId: 'eat', why: '加辣，汤要宽，吃完嘴唇发麻才够劲' },
  { name: '深夜一碗热馄饨', sceneId: 'eat', why: '胃和心一起被熨平' },
  { name: '刚出炉的糖炒栗子', sceneId: 'eat', why: '剥壳的十分钟本身就是快乐' },
  { name: '街角面包店第一炉可颂', sceneId: 'eat', why: '酥皮掉一桌子，也值' },
  { name: '冰可乐配炸鸡', sceneId: 'eat', why: '气泡和脆皮同时炸开' },
  { name: '冬天第一顿涮羊肉', sceneId: 'eat', why: '玻璃上的雾气是佐餐的' },
  { name: '夏天的一碗冰粉', sceneId: 'eat', why: '红糖山楂碎，从喉咙凉到心里' },
  { name: '菜市场门口的烤红薯', sceneId: 'eat', why: '用勺子从中间挖着吃' },
  { name: '雨天的火锅', sceneId: 'eat', why: '窗外越湿，锅里越沸腾' },
  { name: '妈妈那盘番茄炒蛋', sceneId: 'eat', why: '汁拌饭，两碗起步' },

  // 🎉 玩什么
  { name: '一个人看早场电影', sceneId: 'play', why: '包场的感觉，票价还便宜' },
  { name: '花鸟市场看一下午鱼', sceneId: 'play', why: '什么都不买也很满足' },
  { name: '旧书店翻旧杂志', sceneId: 'play', why: '摸到二十年前的时间' },
  { name: 'KTV 下午场独自唱歌', sceneId: 'play', why: '唱破音也没人笑你' },
  { name: '河边走一小时不带手机', sceneId: 'play', why: '世界安静得能听见自己' },
  { name: '逛超市试吃一圈', sceneId: 'play', why: '像小时候逛庙会' },
  { name: '周末早市买一束花', sceneId: 'play', why: '十块钱买一周的好心情' },
  { name: '夹一次娃娃', sceneId: 'play', why: '夹不夹得到都好玩' },

  // ✈️ 去远方
  { name: '拉萨布达拉宫', sceneId: 'far', why: '站在广场上看它慢慢变金色' },
  { name: '西安兵马俑', sceneId: 'far', why: '两千年前的军队列队等你检阅' },
  { name: '青岛海边发呆一下午', sceneId: 'far', why: '海鸥替你操心所有事' },
  { name: '成都茶馆泡一下午', sceneId: 'far', why: '十块钱的茶，无限续水' },
  { name: '哈尔滨中央大街吃冰棍', sceneId: 'far', why: '零下二十度吃零度的快乐' },
  { name: '敦煌看一次星空', sceneId: 'far', why: '银河亮得不像话' },

  // 💆 休息一下
  { name: '午后阳光下打个盹', sceneId: 'rest', why: '醒来不知道今夕何夕的幸福' },
  { name: '泡脚看一集老剧', sceneId: 'rest', why: '脚是热的，心是松的' },
  { name: '关手机读一下午小说', sceneId: 'rest', why: '电子世界少你一个没事' },
  { name: '公园长椅喂鸽子', sceneId: 'rest', why: '它们认得慷慨的人' },
  { name: '热水澡加刚晒过的床单', sceneId: 'rest', why: '两个人类文明巅峰发明连击' },
  { name: '雨天听雨什么都不干', sceneId: 'rest', why: '合法地无所事事半天' },
];
