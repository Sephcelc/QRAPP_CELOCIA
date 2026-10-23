import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import AppButton from '@/components/AppButton';
import Text from '@/components/AppText';
import { COLORS } from '@/constants/colors';
import {
  deleteAdminAttendanceRecord,
  getAllAttendanceForAdmin,
  saveAdminAttendanceRecord,
  type AdminAttendanceRecord,
} from '@/lib/attendance';
import { getAllEventsForAdmin, type CloudEvent } from '@/lib/events';
import { getProfilesForAdmin, type Profile } from '@/lib/profiles';

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminAttendancePanel() {
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [eventQuery, setEventQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CloudEvent | null>(null);
  const [scannedAt, setScannedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()));

  const loadData = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setError('');
    const [attendanceResult, profileResult, eventResult] = await Promise.all([
      getAllAttendanceForAdmin(),
      getProfilesForAdmin(),
      getAllEventsForAdmin(),
    ]);
    if (!isActive()) return;
    setLoading(false);
    const firstError = attendanceResult.error ?? profileResult.error ?? eventResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    setRecords(attendanceResult.records);
    setProfiles(profileResult.profiles);
    setEvents(eventResult.events);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadData(() => active);
    return () => { active = false; };
  }, [loadData]));

  const resetForm = () => {
    setFormOpen(false);
    setEditingRecordId(null);
    setStudentQuery('');
    setSelectedStudent(null);
    setEventQuery('');
    setSelectedEvent(null);
    setScannedAt(toLocalDateTimeInput(new Date().toISOString()));
    setError('');
  };

  const editRecord = (record: AdminAttendanceRecord) => {
    const profile = profiles.find((item) => item.id === record.studentId) ?? null;
    const event = events.find((item) => item.id === record.eventId) ?? null;
    setEditingRecordId(record.id);
    setSelectedStudent(profile);
    setStudentQuery(profile?.email ?? record.studentEmail);
    setSelectedEvent(event);
    setEventQuery(event?.event_code ?? record.eventCode);
    setScannedAt(toLocalDateTimeInput(record.scannedAt));
    setFormOpen(true);
    setError('');
    setMessage('Editing attendance record.');
  };

  const saveRecord = async () => {
    if (!selectedStudent || !selectedEvent || !scannedAt) {
      setError('Select a user and event, then enter the check-in time.');
      return;
    }
    const timestamp = new Date(scannedAt);
    if (Number.isNaN(timestamp.getTime())) {
      setError('Enter a valid check-in date and time.');
      return;
    }

    setSaving(true);
    setError('');
    const result = await saveAdminAttendanceRecord({
      studentId: selectedStudent.id,
      eventId: selectedEvent.id,
      scannedAt: timestamp.toISOString(),
    }, editingRecordId ?? undefined);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(editingRecordId ? 'Attendance record corrected.' : 'Missed check-in added.');
    resetForm();
    await loadData();
  };

  const removeRecord = (record: AdminAttendanceRecord) => {
    Alert.alert('Remove check-in', `Remove ${record.studentName || record.studentEmail}'s check-in for ${record.eventTitle}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteAdminAttendanceRecord(record.id);
          if (result.error) {
            setError(result.error.message);
            return;
          }
          setMessage('Attendance record removed.');
          await loadData();
        },
      },
    ]);
  };

  const studentMatches = profiles.filter((profile) =>
    `${profile.full_name ?? ''} ${profile.email}`.toLowerCase().includes(studentQuery.trim().toLowerCase())
  ).slice(0, 5);
  const eventMatches = events.filter((event) =>
    `${event.title} ${event.event_code}`.toLowerCase().includes(eventQuery.trim().toLowerCase())
  ).slice(0, 5);
  const search = query.trim().toLowerCase();
  const visibleRecords = records.filter((record) =>
    `${record.studentName ?? ''} ${record.studentEmail} ${record.eventTitle} ${record.eventCode}`
      .toLowerCase()
      .includes(search)
  );

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>Attendance records</Text>
          <Text style={styles.hint}>Review and correct check-ins across the system.</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh attendance records"
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void loadData()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {loading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <MaterialIcons name="refresh" size={21} color={COLORS.primary} />}
        </Pressable>
      </View>

      <AppButton
        icon={formOpen ? 'close' : 'add'}
        onPress={() => formOpen ? resetForm() : setFormOpen(true)}
        theme={formOpen ? undefined : 'primary'}
        title={formOpen ? 'Close correction form' : 'Add missed check-in'}
      />

      {formOpen && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{editingRecordId ? 'Correct check-in' : 'Add missed check-in'}</Text>
          <Text style={styles.label}>Student or staff account</Text>
          <TextInput
            accessibilityLabel="Search for a user"
            onChangeText={(value) => { setStudentQuery(value); setSelectedStudent(null); }}
            placeholder="Search name or email"
            placeholderTextColor={COLORS.textSecondary}
            style={styles.input}
            value={studentQuery}
          />
          {!selectedStudent && studentQuery.length > 0 && studentMatches.map((profile) => (
            <Pressable key={profile.id} onPress={() => { setSelectedStudent(profile); setStudentQuery(profile.email); }} style={styles.suggestion}>
              <Text style={styles.suggestionTitle}>{profile.full_name || 'Unnamed user'}</Text>
              <Text style={styles.suggestionMeta}>{profile.email}</Text>
            </Pressable>
          ))}
          {selectedStudent && <Text style={styles.selectedValue}>Selected: {selectedStudent.full_name || selectedStudent.email}</Text>}

          <Text style={styles.label}>Event</Text>
          <TextInput
            accessibilityLabel="Search for an event"
            onChangeText={(value) => { setEventQuery(value); setSelectedEvent(null); }}
            placeholder="Search title or event code"
            placeholderTextColor={COLORS.textSecondary}
            style={styles.input}
            value={eventQuery}
          />
          {!selectedEvent && eventQuery.length > 0 && eventMatches.map((event) => (
            <Pressable key={event.id} onPress={() => { setSelectedEvent(event); setEventQuery(event.event_code); }} style={styles.suggestion}>
              <Text style={styles.suggestionTitle}>{event.title}</Text>
              <Text style={styles.suggestionMeta}>{event.event_code}</Text>
            </Pressable>
          ))}
          {selectedEvent && <Text style={styles.selectedValue}>Selected: {selectedEvent.title}</Text>}

          <Text style={styles.label}>Check-in date and time</Text>
          <TextInput
            accessibilityLabel="Check-in date and time"
            onChangeText={setScannedAt}
            placeholder="YYYY-MM-DDTHH:mm"
            placeholderTextColor={COLORS.textSecondary}
            style={styles.input}
            value={scannedAt}
          />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.formActions}>
            <Pressable accessibilityRole="button" onPress={resetForm} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveRecord()} style={[styles.saveButton, saving && styles.disabled]}>
              {saving && <ActivityIndicator color={COLORS.textOnPrimary} size="small" />}
              <Text style={styles.saveText}>{saving ? 'Saving…' : editingRecordId ? 'Save correction' : 'Add check-in'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!!error && !formOpen && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!message && !error && <Text style={styles.success}>{message}</Text>}
      <TextInput
        accessibilityLabel="Search attendance records"
        onChangeText={setQuery}
        placeholder="Search people, events, or codes"
        placeholderTextColor={COLORS.textSecondary}
        style={styles.input}
        value={query}
      />
      <Text style={styles.resultCount}>{visibleRecords.length} records</Text>

      {loading && records.length === 0 ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loading} />
      ) : visibleRecords.length === 0 ? (
        <Text style={styles.empty}>{records.length ? 'No matching records.' : 'No attendance records found.'}</Text>
      ) : (
        <ScrollView nestedScrollEnabled style={styles.recordList}>
          {visibleRecords.map((record) => (
            <View key={record.id} style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordName}>{record.studentName || 'Unnamed user'}</Text>
                  <Text numberOfLines={1} style={styles.recordEmail}>{record.studentEmail}</Text>
                </View>
                <View style={styles.recordActions}>
                  <Pressable accessibilityLabel={`Correct ${record.studentName || 'user'} check-in`} accessibilityRole="button" onPress={() => editRecord(record)} style={styles.actionButton}>
                    <MaterialIcons name="edit-calendar" size={19} color={COLORS.primary} />
                  </Pressable>
                  <Pressable accessibilityLabel={`Remove ${record.studentName || 'user'} check-in`} accessibilityRole="button" onPress={() => removeRecord(record)} style={styles.actionButton}>
                    <MaterialIcons name="delete-outline" size={20} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.eventTitle}>{record.eventTitle} <Text style={styles.eventCode}>· {record.eventCode}</Text></Text>
              <Text style={styles.recordTime}>{new Date(record.scannedAt).toLocaleString()}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headingCopy: { flex: 1, minWidth: 0 },
  heading: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700' },
  hint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  iconButton: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  form: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 18 },
  formTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.card, color: COLORS.textPrimary, paddingHorizontal: 12, fontSize: 14, marginBottom: 8 },
  suggestion: { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8, paddingHorizontal: 10 },
  suggestionTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  suggestionMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  selectedValue: { color: COLORS.success, fontSize: 12, marginTop: 2 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 12 },
  cancelButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  saveButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 9, paddingHorizontal: 14 },
  saveText: { color: COLORS.textOnPrimary, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: COLORS.danger, fontSize: 13, marginVertical: 8 },
  success: { color: COLORS.success, fontSize: 13, marginVertical: 8 },
  resultCount: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 8 },
  recordList: { maxHeight: 560 },
  recordCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  recordCopy: { flex: 1, minWidth: 0 },
  recordName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  recordEmail: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  recordActions: { flexDirection: 'row', gap: 6 },
  actionButton: { width: 36, height: 36, borderRadius: 9, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  eventCode: { color: COLORS.primary, fontSize: 12, fontWeight: '500' },
  recordTime: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  loading: { marginVertical: 22 },
  empty: { color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 20 },
  pressed: { opacity: 0.65 },
});