import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(SUPABASE_URL);
export const configured = urlOk && SUPABASE_PUBLISHABLE_KEY.length > 20 && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR');
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
