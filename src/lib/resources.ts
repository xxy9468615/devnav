import type { Resource, Category } from './types';
import { supabase } from './supabase';
import { categories } from '../data/categories';

export function loadCategories(): Category[] {
  return categories;
}

export function loadStaticResources(): Resource[] {
  return [];
}

export async function loadDynamicResources(): Promise<Resource[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('is_alive', true)
      .order('updated_at', { ascending: false })
      .limit(2000);

    if (error || !data) return [];

    return data.map((row: any) => ({
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
  } catch (err) {
    console.error('[resources] Failed to load from Supabase:', err);
    return [];
  }
}

export async function getAllResources(): Promise<Resource[]> {
  const dynamicRes = await loadDynamicResources();

  return dynamicRes.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
