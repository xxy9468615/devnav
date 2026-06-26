import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { syncFreeForDev } from './sync-free-for-dev.mjs';
import { syncBlog } from './sync-blog.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
