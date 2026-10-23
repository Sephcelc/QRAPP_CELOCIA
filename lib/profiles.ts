import type { User } from '@supabase/supabase-js';

import { supabase, supabaseProjectRef } from './supabase';

export type ProfileRole = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
};

export type ProfileResult = {
  profile: Profile | null;
  error: Error | null;
};

/** The signed-in user fields needed to read or create a profile row. */
export type ProfileUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

/** Shown whenever PostgREST cannot find the attendance tables. */
export const PROFILE_SETUP_HINT =
  'Database not set up: the tables are missing' +
  (supabaseProjectRef ? ` from Supabase project ${supabaseProjectRef}` : '') +
  '. Run supabase/schema.sql in the SQL Editor (or "npm run db:apply"), then tap Retry.';

type PostgrestLikeError = { code?: string; message?: string };

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String((error as PostgrestLikeError).message ?? '');
}

/**
 * PostgREST answers with PGRST205 ("Could not find the table 'public.profiles'
 * in the schema cache") when supabase/schema.sql has never been run against the
 * project, and with 42P01 when the relation is missing at the SQL level. Row
 * level security and permission failures use other codes, so this check is safe
 * to use for a "database not set up" message.
 */
export function isMissingSchemaError(error: unknown): boolean {
  if (!error) return false;

  const code = (error as PostgrestLikeError).code;
  if (code === 'PGRST205' || code === '42P01') return true;

  const message = errorMessage(error);
  if (message === PROFILE_SETUP_HINT) return true;

  return /could not find the table|schema cache|relation .* does not exist/i.test(message);
}

/** Turns a Supabase error into a message that is safe to show in the UI. */
export function profileErrorMessage(error: unknown, fallback = 'Unable to update your profile.'): string {
  if (isMissingSchemaError(error)) return PROFILE_SETUP_HINT;
  return errorMessage(error).trim() || fallback;
}

/**
 * Wraps a Supabase error in a plain Error for the UI while keeping the
 * PostgREST code, so isMissingSchemaError() still detects it afterwards.
 */
function toProfileError(error: unknown, fallback: string): Error {
  const wrapped = new Error(profileErrorMessage(error, fallback)) as Error & { code?: string };
  const code = (error as PostgrestLikeError | null)?.code;
  if (code) wrapped.code = code;
  return wrapped;
}

let schemaWarningLogged = false;

function reportMissingSchema(source: string) {
  if (schemaWarningLogged) return;
  schemaWarningLogged = true;
  console.warn(`${source}: ${PROFILE_SETUP_HINT}`);
}

function metadataString(metadata: User['user_metadata'], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metadataRole(metadata: User['user_metadata']): ProfileRole | null {
  const value = metadata?.role;
  return value === 'student' || value === 'teacher' ? value : null;
}

/** Row used when the profile does not exist yet, built from the auth user. */
function buildProfileRow(user: ProfileUser) {
  const email = typeof user.email === 'string' ? user.email.trim() : '';

  return {
    id: user.id,
    email: email || metadataString(user.user_metadata, 'email') || '',
    full_name: metadataString(user.user_metadata, 'full_name'),
    role: metadataRole(user.user_metadata) ?? 'student',
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) reportMissingSchema('getProfile');
    else console.error('getProfile error:', error.message);
    return null;
  }

  return (data as Profile | null) ?? null;
}

export async function getProfilesForAdmin(): Promise<{ profiles: Profile[]; error: Error | null }> {
  const profiles: Profile[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return { profiles: [], error: toProfileError(error, 'Unable to load user accounts.') };
    }

    profiles.push(...((data ?? []) as Profile[]));
    if (!data || data.length < pageSize) break;
  }

  return { profiles, error: null };
}

export async function updateManagedProfileRole(
  userId: string,
  role: ProfileRole
): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    return { profile: null, error: toProfileError(error, 'Unable to update this account.') };
  }

  if (!data) {
    return {
      profile: null,
      error: new Error('No account was updated. Confirm that you still have administrator access.'),
    };
  }

  return { profile: data as Profile, error: null };
}

/**
 * Loads the signed-in user's profile and creates the row when it is missing,
 * for example for accounts created before the on_auth_user_created trigger
 * existed (that missing row is what breaks the student -> teacher switch).
 */
export async function ensureProfile(user: ProfileUser): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) reportMissingSchema('ensureProfile');
    else console.error('ensureProfile error:', error.message);
    return { profile: null, error: toProfileError(error, 'Unable to load your profile.') };
  }

  if (data) return { profile: data as Profile, error: null };

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert(buildProfileRow(user))
    .select('*')
    .single();

  if (createError) {
    if (isMissingSchemaError(createError)) reportMissingSchema('ensureProfile');
    else console.error('ensureProfile error:', createError.message);
    return { profile: null, error: toProfileError(createError, 'Unable to load your profile.') };
  }

  return { profile: created as Profile, error: null };
}

export async function updateProfile(
  user: ProfileUser,
  updates: Partial<Pick<Profile, 'full_name' | 'role'>>
): Promise<ProfileResult> {
  const query: { full_name?: string | null; role?: ProfileRole; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (updates.full_name !== undefined) query.full_name = updates.full_name;
  if (updates.role) query.role = updates.role;

  if (query.full_name === undefined && query.role === undefined) {
    return { profile: null, error: new Error('No profile fields to update.') };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(query)
    .eq('id', user.id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) reportMissingSchema('updateProfile');
    else console.error('updateProfile error:', error.message);
    return { profile: null, error: toProfileError(error, 'Unable to update your profile.') };
  }

  // No row matched: the profile row is missing, so create it instead of
  // silently dropping the student -> teacher switch.
  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({ ...buildProfileRow(user), ...query })
      .select('*')
      .single();

    if (createError) {
      if (isMissingSchemaError(createError)) reportMissingSchema('updateProfile');
      else console.error('updateProfile error:', createError.message);
      return { profile: null, error: toProfileError(createError, 'Unable to update your profile.') };
    }

    return { profile: created as Profile, error: await syncRoleMetadata(updates.role) };
  }

  return { profile: data as Profile, error: await syncRoleMetadata(updates.role) };
}

/** Keeps the auth user metadata in step with the saved role. */
async function syncRoleMetadata(role?: ProfileRole): Promise<Error | null> {
  if (!role) return null;

  const { error } = await supabase.auth.updateUser({ data: { role } });
  if (!error) return null;

  console.error('updateProfile error:', error.message);
  return new Error(error.message || 'Your role was saved but your session could not be refreshed.');
}
