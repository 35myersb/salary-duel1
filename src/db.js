import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

export function dataDir() {
  return process.env.DATA_DIR || 'data';
}

export function init() {
  // Supabase is remote and persistent; there is no local database to initialize.
}

export async function getPublicLeague(id) {
  const { data, error } = await supabase.rpc('get_league_public', { p_id: id });
  if (error) throw new Error(error.message);
  return data || null;
}

export async function getLeague(id, code) {
  const { data, error } = await supabase.rpc('get_league_private', {
    p_id: id,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const league = data.state;
  Object.defineProperty(league, '__version', { value: Number(data.version || 1), writable: true, enumerable: false });
  return league;
}

export async function createLeague(league) {
  const { data, error } = await supabase.rpc('create_league', { p_state: league });
  if (error) throw new Error(error.message);
  const created = data;
  Object.defineProperty(created, '__version', { value: 1, writable: true, enumerable: false });
  return created;
}

export async function saveLeague(league, code, expectedVersion) {
  const { data, error } = await supabase.rpc('save_league_state', {
    p_id: league.id,
    p_state: league,
    p_expected_version: expectedVersion,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) {
    const e = new Error('League changed in another session; refresh and try again');
    e.code = 'CONFLICT';
    throw e;
  }
  return Number(data);
}
