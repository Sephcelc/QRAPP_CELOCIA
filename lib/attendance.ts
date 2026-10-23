import { getEventByCode } from './events';
import { getProfilesForAdmin } from './profiles';
import { parseQRPayload } from './qr';
import { supabase } from './supabase';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  start: string | null;
  end: string | null;
  attendees: Array<{
    studentId: string;
    studentName: string | null;
    scannedAt: string;
  }>;
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export type AdminAttendanceRecord = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  eventId: string;
  eventCode: string;
  eventTitle: string;
  scannedAt: string;
};

export async function registerAttendance(rawPayload: string): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) return { success: false, message: parsed.message };
  const payload = parsed.payload;

  if (!payload.start || !payload.end) {
    return { success: false, message: 'Invalid QR code.' };
  }

  const startTime = new Date(payload.start).getTime();
  const endTime = new Date(payload.end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return { success: false, message: 'Invalid date format.' };
  }

  const now = Date.now();
  if (now < startTime) return { success: false, message: 'Event has not started yet.' };
  if (now > endTime) return { success: false, message: 'Event has already ended.' };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { success: false, message: 'You must be signed in.' };
  }

  let event = await getEventByCode(payload.event);
  if (!event) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        event_code: payload.event,
        title: payload.title ?? 'Untitled Event',
        start_time: payload.start,
        end_time: payload.end,
      })
      .select('*')
      .single();
    if (error || !data) return { success: false, message: 'Could not create event.' };
    event = data;
  }

  if (!event) return { success: false, message: 'Could not check event.' };

  const { error } = await supabase.from('attendance').insert({
    student_id: authData.user.id,
    event_id: event.id,
  });

  if (error?.code === '23505') {
    return { success: false, message: 'Already registered for this event.' };
  }
  if (error) return { success: false, message: 'Could not record attendance.' };

  return {
    success: true,
    message: 'Attendance recorded!',
    eventTitle: event.title,
  };
}

export async function getAttendanceHistory(studentId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, event_id, events ( title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });
  if (error) return [];

  return (data ?? []).map((row: any) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: Array.isArray(row.events) ? row.events[0]?.title : row.events?.title,
    scannedAt: row.scanned_at,
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });
  if (eventsError || !events?.length) return [];

  const eventIds = events.map((event) => event.id);
  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });
  if (attendanceError) return [];

  const studentIds = [...new Set((attendance ?? []).map((row) => row.student_id))];
  const { data: profiles } = studentIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return events.map((event) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    attendees: (attendance ?? [])
      .filter((row) => row.event_id === event.id)
      .map((row) => ({
        studentId: row.student_id,
        studentName: names.get(row.student_id) ?? null,
        scannedAt: row.scanned_at,
      })),
  }));
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });
  if (eventsError || !events?.length) return [];

  const eventIds = events.map((event) => event.id);
  const { data: rows, error } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);
  if (error) return [];

  const counts: Record<string, number> = {};
  (rows ?? []).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}

export async function getAllAttendanceForAdmin(): Promise<{
  records: AdminAttendanceRecord[];
  error: Error | null;
}> {
  const rows: Array<{
    id: string;
    student_id: string;
    event_id: string;
    scanned_at: string;
    events: { event_code: string; title: string } | Array<{ event_code: string; title: string }> | null;
  }> = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, student_id, event_id, scanned_at, events ( event_code, title )')
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { records: [], error: new Error(error.message) };
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < pageSize) break;
  }

  const { profiles, error: profilesError } = await getProfilesForAdmin();
  if (profilesError) return { records: [], error: profilesError };

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const records = rows.map((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    const profile = profileById.get(row.student_id);
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: profile?.full_name ?? null,
      studentEmail: profile?.email ?? '',
      eventId: row.event_id,
      eventCode: event?.event_code ?? '',
      eventTitle: event?.title ?? 'Unknown event',
      scannedAt: row.scanned_at,
    };
  });

  return { records, error: null };
}

export async function saveAdminAttendanceRecord(
  record: Pick<AdminAttendanceRecord, 'studentId' | 'eventId' | 'scannedAt'>,
  recordId?: string
) {
  const values = {
    student_id: record.studentId,
    event_id: record.eventId,
    scanned_at: record.scannedAt,
  };

  if (!recordId) {
    return supabase.from('attendance').insert(values).select('id').single();
  }

  const { data, error } = await supabase
    .from('attendance')
    .update(values)
    .eq('id', recordId)
    .select('id')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Attendance record not found or update not authorized.') };
  return { data, error: null };
}

export async function deleteAdminAttendanceRecord(recordId: string) {
  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', recordId)
    .select('id')
    .maybeSingle();

  if (error) return { error };
  if (!data) return { error: new Error('Attendance record not found or delete not authorized.') };
  return { error: null };
}
