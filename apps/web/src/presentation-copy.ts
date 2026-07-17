export const questionCopy = {
  form: {
    title: '今天想吃哪一種？',
    description: '先從形式開始：湯麵、沾麵，或沒有湯的拌麵。',
  },
  archetype: {
    title: '這碗最接近哪種輪廓？',
    description: '可選項會跟著上一題改變。',
  },
  tare: {
    title: '主要調味想偏哪邊？',
    description: '選出你今天最想吃的調味方向。',
  },
  source: {
    title: '哪種出汁或主角最明顯？',
    description: '最多選兩個；如果沒有把握，也可以選「不確定」。',
  },
  body: {
    title: '你想要多重口？',
    description: '用濃淡與油脂感調整這次的推薦。',
  },
  noodle: {
    title: '麵條想要哪一型？',
    description: '選一種最接近你今天口感偏好的麵條。',
  },
  signature: {
    title: '有沒有特別想吃的招牌元素？',
    description: '最多選兩個；沒有特別偏好也沒問題。',
  },
  exclusions: {
    title: '有需要排除的食材嗎？',
    description: '只用於過濾衝突候選，不構成過敏原或醫療安全保證。',
  },
} as const

const sharedLabels: Record<string, string> = {
  soup: '湯拉麵',
  tsukemen: '沾麵',
  dry: '乾拌麵／油拌麵',
  chintan: '清湯',
  paitan: '白湯',
  'konbusui-light': '清爽昆布水',
  'gyokai-rich': '濃厚魚介',
  'miso-rich': '濃厚味噌',
  'tsukemen-other': '其他沾麵',
  aburasoba: '油拌麵',
  'taiwan-mazesoba': '台灣拌麵',
  'soupless-tantan': '無湯擔擔麵',
  'dry-other': '其他乾拌',
  shoyu: '醬油',
  shio: '鹽味',
  miso: '味噌',
  'spicy-sesame': '辣味／芝麻',
  none: '沒有／不排除',
  pork: '豬',
  chicken: '雞',
  duck: '鴨',
  beef: '牛',
  'fish-seafood': '魚介',
  shellfish: '貝類',
  'shrimp-crab': '蝦蟹',
  vegetable: '蔬菜',
  mixed: '混合',
  unsure: '不確定',
  light: '清爽',
  balanced: '平衡',
  rich: '濃厚',
  'backfat-heavy': '背脂重口',
  'ultra-heavy': '極濃厚',
  'thin-straight': '細直麵',
  'medium-thin-straight': '中細直麵',
  'medium-thick-straight': '中粗直麵',
  'medium-thick-wavy': '中粗縮麵',
  'extra-thick': '極粗麵',
  'nori-spinach': '海苔與菠菜',
  'corn-butter': '玉米與奶油',
  'bean-sprout-garlic-backfat': '豆芽、蒜與背脂',
  'fish-kombu': '魚介與昆布',
  'yuzu-citrus': '柚子與柑橘',
  'no-preference': '沒有特別偏好',
  dairy: '乳製品',
}

export function optionLabel(questionId: keyof typeof questionCopy, optionId: string) {
  if (questionId === 'tare' && optionId === 'none') return '原味／不強調'
  if (questionId === 'exclusions' && optionId === 'none') return '沒有需要排除'
  return sharedLabels[optionId] ?? optionId
}

export function exclusionLabel(optionId: string) {
  return sharedLabels[optionId] ?? optionId
}

export function coreLabel(coreId: string) {
  const intensity = coreId.split(':').at(-1)
  return ({ clean: '清爽輪廓', balanced: '平衡輪廓', heavy: '濃厚輪廓' } as const)[
    intensity as 'clean' | 'balanced' | 'heavy'
  ] ?? coreId
}

export function subtypeLabel(subtypeId: string) {
  return sharedLabels[subtypeId.split(':').at(-1) ?? ''] ?? subtypeId
}
