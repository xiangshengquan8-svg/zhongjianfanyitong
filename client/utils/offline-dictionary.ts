/**
 * 离线翻译词典 - 中文 ↔ 高棉语常用短语
 * 用于无网络环境下的基础翻译
 */

export interface DictionaryEntry {
  zh: string;
  km: string;
  category: string;
}

/**
 * 常用短语词典
 * 包含日常交流、问候、数字、时间等基础表达
 */
export const OFFLINE_DICTIONARY: DictionaryEntry[] = [
  // 问候语
  { zh: '你好', km: 'សួស្តី', category: 'greeting' },
  { zh: '早上好', km: 'អរុណសួស្តី', category: 'greeting' },
  { zh: '下午好', km: 'ទិវាសួស្តី', category: 'greeting' },
  { zh: '晚上好', km: 'សាយ័ណ្ហសួស្តី', category: 'greeting' },
  { zh: '再见', km: 'លាហើយ', category: 'greeting' },
  { zh: '谢谢', km: 'អរគុណ', category: 'greeting' },
  { zh: '不客气', km: 'មិនអីទេ', category: 'greeting' },
  { zh: '对不起', km: 'សុំទោស', category: 'greeting' },
  { zh: '没关系', km: 'មិនអីទេ', category: 'greeting' },
  { zh: '请问', km: 'សូមសួរ', category: 'greeting' },

  // 基本信息
  { zh: '是', km: 'បាទ/ចាស', category: 'basic' },
  { zh: '不是', km: 'ទេ', category: 'basic' },
  { zh: '好的', km: 'បាន', category: 'basic' },
  { zh: '不好', km: 'មិនបាន', category: 'basic' },
  { zh: '我', km: 'ខ្ញុំ', category: 'basic' },
  { zh: '你', km: 'អ្នក', category: 'basic' },
  { zh: '他', km: 'គាត់', category: 'basic' },
  { zh: '她', km: 'នាង', category: 'basic' },
  { zh: '我们', km: 'យើង', category: 'basic' },
  { zh: '他们', km: 'ពួកគេ', category: 'basic' },

  // 数字
  { zh: '一', km: 'មួយ', category: 'number' },
  { zh: '二', km: 'ពីរ', category: 'number' },
  { zh: '三', km: 'បី', category: 'number' },
  { zh: '四', km: 'បួន', category: 'number' },
  { zh: '五', km: 'ប្រាំ', category: 'number' },
  { zh: '六', km: 'ប្រាំមួយ', category: 'number' },
  { zh: '七', km: 'ប្រាំពីរ', category: 'number' },
  { zh: '八', km: 'ប្រាំបី', category: 'number' },
  { zh: '九', km: 'ប្រាំបួន', category: 'number' },
  { zh: '十', km: 'ដប់', category: 'number' },
  { zh: '百', km: 'រយ', category: 'number' },
  { zh: '千', km: 'ពាន់', category: 'number' },
  { zh: '万', km: 'ម៉ឺន', category: 'number' },

  // 时间
  { zh: '今天', km: 'ថ្ងៃនេះ', category: 'time' },
  { zh: '明天', km: 'ថ្ងៃស្អែក', category: 'time' },
  { zh: '昨天', km: 'ម្សិលមិញ', category: 'time' },
  { zh: '现在', km: 'ឥឡូវ', category: 'time' },
  { zh: '上午', km: 'ព្រឹក', category: 'time' },
  { zh: '下午', km: 'រសៀល', category: 'time' },
  { zh: '晚上', km: 'យប់', category: 'time' },
  { zh: '小时', km: 'ម៉ោង', category: 'time' },
  { zh: '分钟', km: 'នាទី', category: 'time' },

  // 日常用语
  { zh: '我叫什么名字', km: 'ខ្ញុំឈ្មោះអ្វី', category: 'daily' },
  { zh: '你叫什么名字', km: 'អ្នកឈ្មោះអ្វី', category: 'daily' },
  { zh: '我来自中国', km: 'ខ្ញុំមកពីប្រទេសចិន', category: 'daily' },
  { zh: '我来自柬埔寨', km: 'ខ្ញុំមកពីប្រទេសកម្ពុជា', category: 'daily' },
  { zh: '我不懂', km: 'ខ្ញុំមិនយល់', category: 'daily' },
  { zh: '我懂', km: 'ខ្ញុំយល់', category: 'daily' },
  { zh: '请说慢一点', km: 'សូមនិយាយយឺតៗ', category: 'daily' },
  { zh: '请再说一遍', km: 'សូមនិយាយម្តងទៀត', category: 'daily' },
  { zh: '你会说中文吗', km: 'អ្នកចេះនិយាយភាសាចិនទេ', category: 'daily' },
  { zh: '你会说高棉语吗', km: 'អ្នកចេះនិយាយភាសាខ្មែរទេ', category: 'daily' },

  // 交通出行
  { zh: '去哪里', km: 'ទៅណា', category: 'transport' },
  { zh: '多少钱', km: 'ប៉ុន្មាន', category: 'transport' },
  { zh: '太贵了', km: 'ថ្លៃពេក', category: 'transport' },
  { zh: '便宜一点', km: 'ថោកជាងនេះ', category: 'transport' },
  { zh: '出租车', km: 'តាក់ស៊ី', category: 'transport' },
  { zh: '酒店', km: 'សណ្ឋាគារ', category: 'transport' },
  { zh: '机场', km: 'អាកាសយានដ្ឋាន', category: 'transport' },
  { zh: '火车站', km: 'ស្ថានីយ៍រថភ្លើង', category: 'transport' },
  { zh: '左转', km: 'បត់ឆ្វេង', category: 'transport' },
  { zh: '右转', km: 'បត់ស្តាំ', category: 'transport' },
  { zh: '直走', km: 'ទៅមុខ', category: 'transport' },
  { zh: '停', km: 'ឈប់', category: 'transport' },

  // 餐饮
  { zh: '我饿了', km: 'ខ្ញុំឃ្លាន', category: 'food' },
  { zh: '我渴了', km: 'ខ្ញុំស្រេក', category: 'food' },
  { zh: '水', km: 'ទឹក', category: 'food' },
  { zh: '米饭', km: 'បាយ', category: 'food' },
  { zh: '面条', km: 'មី', category: 'food' },
  { zh: '鸡肉', km: 'សាច់មាន់', category: 'food' },
  { zh: '猪肉', km: 'សាច់ជ្រូក', category: 'food' },
  { zh: '牛肉', km: 'សាច់គោ', category: 'food' },
  { zh: '鱼', km: 'ត្រី', category: 'food' },
  { zh: '蔬菜', km: 'បន្លែ', category: 'food' },
  { zh: '水果', km: 'ផ្លែឈើ', category: 'food' },
  { zh: '好吃', km: 'ឆ្ងាញ់', category: 'food' },
  { zh: '不好吃', km: 'មិនឆ្ងាញ់', category: 'food' },
  { zh: '买单', km: 'គិតលុយ', category: 'food' },

  // 购物
  { zh: '这个', km: 'នេះ', category: 'shopping' },
  { zh: '那个', km: 'នោះ', category: 'shopping' },
  { zh: '我要买', km: 'ខ្ញុំចង់ទិញ', category: 'shopping' },
  { zh: '我不要', km: 'ខ្ញុំមិនយក', category: 'shopping' },
  { zh: '可以刷卡吗', km: 'អាចកាតកាតទេ', category: 'shopping' },
  { zh: '现金', km: 'សាច់ប្រាក់', category: 'shopping' },

  // 紧急情况
  { zh: '救命', km: 'ជួយផង', category: 'emergency' },
  { zh: '帮忙', km: 'ជួយ', category: 'emergency' },
  { zh: '医院', km: 'មន្ទីរពេទ្យ', category: 'emergency' },
  { zh: '警察', km: 'ប៉ូលីស', category: 'emergency' },
  { zh: '我生病了', km: 'ខ្ញុំឈឺ', category: 'emergency' },
  { zh: '我需要帮助', km: 'ខ្ញុំត្រូវការជំនួយ', category: 'emergency' },
];

/**
 * 创建中文到高棉语的映射
 */
const zhToKmMap = new Map<string, string>();
OFFLINE_DICTIONARY.forEach((entry) => {
  zhToKmMap.set(entry.zh, entry.km);
});

/**
 * 创建高棉语到中文的映射
 */
const kmToZhMap = new Map<string, string>();
OFFLINE_DICTIONARY.forEach((entry) => {
  kmToZhMap.set(entry.km, entry.zh);
});

/**
 * 离线翻译 - 中文到高棉语
 */
export function translateZhToKmOffline(text: string): string | null {
  // 精确匹配
  const exactMatch = zhToKmMap.get(text.trim());
  if (exactMatch) return exactMatch;

  // 模糊匹配 - 查找包含的短语
  for (const [zh, km] of zhToKmMap.entries()) {
    if (text.includes(zh)) {
      return text.replace(zh, km);
    }
  }

  return null;
}

/**
 * 离线翻译 - 高棉语到中文
 */
export function translateKmToZhOffline(text: string): string | null {
  // 精确匹配
  const exactMatch = kmToZhMap.get(text.trim());
  if (exactMatch) return exactMatch;

  // 模糊匹配 - 查找包含的短语
  for (const [km, zh] of kmToZhMap.entries()) {
    if (text.includes(km)) {
      return text.replace(km, zh);
    }
  }

  return null;
}

/**
 * 离线翻译入口
 */
export function translateOffline(
  text: string,
  sourceLang: 'zh' | 'km',
  targetLang: 'zh' | 'km'
): string | null {
  if (sourceLang === targetLang) return text;

  if (sourceLang === 'zh' && targetLang === 'km') {
    return translateZhToKmOffline(text);
  }

  if (sourceLang === 'km' && targetLang === 'zh') {
    return translateKmToZhOffline(text);
  }

  return null;
}
