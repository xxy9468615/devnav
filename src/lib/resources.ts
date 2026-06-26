import type { Resource, Category } from './types';
import { supabase } from './supabase';
import { categories } from '../data/categories';
import { seedResources } from '../data/seed-resources';
import crypto from 'node:crypto';

function generateId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

export function loadCategories(): Category[] {
  return categories;
}

export function loadStaticResources(): Resource[] {
  // Static resources are now fully served from Supabase
  return [];
}

export async function loadDynamicResources(): Promise<Resource[]> {
  if (!supabase) return [];

  const allRows: any[] = [];
  const PAGE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('is_alive', true)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error || !data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return allRows.map((row: any) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    category: row.category,
    tags: row.tags || [],
    source: row.source,
    icon: row.icon,
    featured: row.featured || false,
    updatedAt: row.updated_at,
    isAlive: row.is_alive,
  }));
}

export async function getAllResources(): Promise<Resource[]> {
  const dynamicRes = await loadDynamicResources();

  // Merge seed resources (avoid duplicates by id)
  const dynamicIds = new Set(dynamicRes.map(r => r.id));
  const seeds = seedResources.filter(r => !dynamicIds.has(r.id));
  const all = [...seeds, ...dynamicRes];

  // Sort: featured first, then by updatedAt
  return all.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
