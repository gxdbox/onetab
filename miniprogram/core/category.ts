/**
 * 类别猜测 —— 快速收藏只有一个输入框，类别得自动猜（猜错也只需点一下改）。
 * 纯关键词打分，无网络、无模型 —— 这里的目标是「大多数时候不用管」，不是准确率 100%。
 * 与 justThisOne（PWA 版）lib/category.ts 保持一致。
 */
import { Category } from './types';
import { SceneId } from './types';

/** 平局时按此顺序取胜 */
const PRIORITY: Category[] = ['food', 'place', 'media', 'activity', 'thing', 'micro'];

const KEYWORDS: Record<Exclude<Category, 'micro'>, string[]> = {
  food: [
    '面', '饭', '粉', '汤', '火锅', '烧烤', '烤肉', '串', '麻辣', '咖啡', '奶茶', '拿铁',
    '甜品', '蛋糕', '冰淇淋', '雪糕', '寿司', '刺身', '包子', '饺子', '馄饨', '炸鸡',
    '披萨', '汉堡', '小龙虾', '螺蛳', '早餐', '夜宵', 'brunch', '食堂', '馆子', '小吃',
    '吃', '喝', '酒', '啤酒', '茶', '菜',
  ],
  place: [
    '山', '海', '湖', '岛', '河', '沙漠', '草原', '雪', '温泉', '寺', '庙', '宫', '塔',
    '古城', '公园', '博物馆', '美术馆', '植物园', '动物园', '街', '巷', '码头', '机场',
    '旅行', '旅游', '出发', '露营', '徒步', '自驾', '民宿', '老家',
    '西安', '拉萨', '成都', '重庆', '大理', '丽江', '厦门', '青岛', '杭州', '苏州',
    '北京', '上海', '广州', '深圳', '南京', '长沙', '香港', '台北', '京都', '东京',
    '冰岛', '新疆', '云南', '西藏', '内蒙',
  ],
  media: [
    '电影', '影院', '剧', '综艺', '番', '动画', '动漫', '演唱会', '音乐节', '展',
    '话剧', '音乐', '专辑', '歌', '播客', '书', '小说', '漫画', '游戏', '主机', '直播',
  ],
  activity: [
    '跑', '骑', '游泳', '爬', '拳', '瑜伽', '健身', '逛', '拍照', '摄影', '画', '写',
    '做饭', '烘焙', '钓鱼', '桌游', '剧本杀', '唱', '按摩', '泡澡', '泡脚', '剪头发',
    '散步', '遛', '滑雪', '冲浪', '潜水', '看日落', '看日出', '野餐',
  ],
  thing: [
    '买', '香水', '蜡烛', '花', '鲜花', '球鞋', '手办', '键盘', '相机', '耳机',
    '礼物', '盲盒', '文具', '本子', '杯子', '毛巾', '床品',
  ],
};

export function guessCategory(title: string): Category {
  const text = title.toLowerCase();
  const scores = new Map<Category, number>();

  for (const [cat, words] of Object.entries(KEYWORDS) as [Exclude<Category, 'micro'>, string[]][]) {
    let score = 0;
    for (const w of words) {
      if (text.includes(w)) score += w.length; // 更长的关键词更具体，权重更高
    }
    if (score > 0) scores.set(cat, score);
  }

  if (scores.size === 0) return 'micro';

  const best = Math.max(...scores.values());
  return PRIORITY.find(c => scores.get(c) === best) ?? 'micro';
}

/**
 * 类别 → 场景映射：justThisOne 的类别体系（food/place/…）落到本产品的场景体系。
 * 用于 add 页「猜到你大概想」的预选——猜错只需点一下改，与 PWA 版同一交互哲学。
 */
const CATEGORY_TO_SCENE: Record<Category, SceneId> = {
  food: 'eat',
  place: 'far',
  activity: 'play',
  media: 'play',
  thing: 'rest',
  micro: 'rest',
};

/** 根据名字猜场景（默认路径零配置：add 页用它预选，猜错点一下改） */
export function guessSceneId(title: string): SceneId {
  return CATEGORY_TO_SCENE[guessCategory(title)];
}
