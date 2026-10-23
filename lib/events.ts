import { supabase } from './supabase';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by?: string | null;
  created_at?: string;
};

export async function createEvent(event: Event) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { data: null, error: authError ?? new Error('You must be signed in.') };
  }

  return supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      created_by: authData.user.id,
    },
    { onConflict: 'event_code' }
  );
}

export async function updateEvent(eventId: string, event: Event) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { data: null, error: authError ?? new Error('You must be signed in.') };
  }

  return supabase
    .from('events')
    .update({
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
    })
    .eq('id', eventId)
    .eq('created_by', authData.user.id)
    .select('*')
    .single();
}

export async function deleteEvent(eventId: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: authError ?? new Error('You must be signed in.') };
  }

  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('created_by', authData.user.id)
    .select('id')
    .maybeSingle();

  if (error) return { error };
  if (!data) return { error: new Error('Event was not deleted. You can only delete events you created.') };

  return { error: null };
}

export async function getAllEventsForAdmin(): Promise<{ events: CloudEvent[]; error: Error | null }> {
  const events: CloudEvent[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { events: [], error: new Error(error.message) };
    events.push(...((data ?? []) as CloudEvent[]));
    if (!data || data.length < pageSize) break;
  }

  return { events, error: null };
}

export async function createEventForAdmin(event: Event) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { data: null, error: authError ?? new Error('You must be signed in.') };
  }

  return supabase
    .from('events')
    .insert({
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      created_by: authData.user.id,
    })
    .select('*')
    .single();
}

export async function updateEventForAdmin(eventRecordId: string, event: Event) {
  const { data, error } = await supabase
    .from('events')
    .update({
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
    })
    .eq('id', eventRecordId)
    .select('*')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Event not found or you are not authorized to update it.') };
  return { data, error: null };
}

export async function deleteEventForAdmin(eventRecordId: string) {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventRecordId)
    .select('id')
    .maybeSingle();

  if (error) return { error };
  if (!data) return { error: new Error('Event not found or you are not authorized to delete it.') };
  return { error: null };
}

export async function getEventsByTeacher(teacherId: string): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });
  return error ? [] : ((data ?? []) as CloudEvent[]);
}

export async function getEventByCode(code: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();
  return error ? null : (data as CloudEvent | null);
}
