export interface Resource {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
  source: 'bookmark' | 'awesome' | 'free-for-dev' | 'free-service' | 'markdown';
  icon: string | null;
  featured: boolean;
  updatedAt: string;
  isAlive: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
}