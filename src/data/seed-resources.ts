import type { Resource } from './types';

// Manually curated resources (not affected by sync)
export const seedResources: Resource[] = [
  {
    id: 'siliconflow-aff',
    title: 'SiliconFlow 硅基流动',
    url: 'https://cloud.siliconflow.cn/i/votJKqZO',
    description: '限时免费AI大模型平台，提供 DeepSeek-OCR、腾讯 Hunyuan-MT-7B 等热门模型，不定期上新免费模型。中国知名AI模型服务商，支持API调用。',
    category: 'free-services',
    tags: ['AI', 'LLM', '免费', 'API', 'DeepSeek', 'Hunyuan'],
    source: 'bookmark',
    icon: 'https://cdn.siliconflow.cn/landing/img/logo-dark.svg',
    featured: true,
    updatedAt: '2026-06-27T00:00:00Z',
    isAlive: true,
  },
];
