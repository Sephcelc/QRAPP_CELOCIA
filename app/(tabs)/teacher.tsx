import { createElement, useCallback, useState, type ChangeEvent } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import PickerField from '@/components/PickerField';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { createEvent, deleteEvent, getEventsByTeacher, updateEvent, type CloudEvent } from '@/lib/events';
import { getProfile, type ProfileRole } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';

const isAndroid = Platform.OS === 'android';
const isWeb = Platform.OS === 'web';

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function toWebPickerValue(date: Date, mode: 'date' | 'time') {
  const pad = (value: number) => String(value).padStart(2, '0');
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TeacherScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [pickerDraft, setPickerDraft] = useState(() => new Date());
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [teacherEvents, setTeacherEvents] = useState<CloudEvent[]>([]);

  const refreshTeacherEvents = useCallback(async () => {
    if (!user) return;
    const events = await getEventsByTeacher(user.id);
    setTeacherEvents(events);
  }, [user]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (user) {
      getProfile(user.id).then((profile) => {
        if (!active) return;
        setRole(profile?.role ?? 'student');
      });
      refreshTeacherEvents();
    }
    return () => { active = false; };
  }, [refreshTeacherEvents, user]));

  const openPicker = (target: 'start' | 'end', part: 'date' | 'time') => {
    setPickerDraft(new Date(target === 'start' ? startDate : endDate));
    setEditTarget(target);
    setEditingPart(part);
  };

  const applyPickerValue = (selected: Date) => {
    if (!editTarget) return;
    const current = editTarget === 'start' ? startDate : endDate;
    const updated = editingPart === 'date'
      ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), current.getHours(), current.getMinutes())
      : new Date(current.getFullYear(), current.getMonth(), current.getDate(), selected.getHours(), selected.getMinutes());
    if (editTarget === 'start') setStartDate(updated);
    else setEndDate(updated);
  };

  const onPickerChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (!selected) {
      if (isAndroid) setEditTarget(null);
      return;
    }
    if (isAndroid) {
      applyPickerValue(selected);
      setEditTarget(null);
    } else {
      setPickerDraft(selected);
    }
  };

  const onWebPickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editTarget || !event.currentTarget.value) return;
    const updated = new Date(pickerDraft);
    if (editingPart === 'date') {
      const [year, month, day] = event.currentTarget.value.split('-').map(Number);
      updated.setFullYear(year, month - 1, day);
    } else {
      const [hours, minutes] = event.currentTarget.value.split(':').map(Number);
      updated.setHours(hours, minutes, 0, 0);
    }
    setPickerDraft(updated);
  };

  const confirmPicker = () => {
    applyPickerValue(pickerDraft);
    setEditTarget(null);
  };

  const handleCreateEvent = async () => {
    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
    };

    if (!event.eventId || !event.title) {
      setMessage('All fields are required.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('Start time must be before end time.');
      return;
    }

    const { error } = editingEventId
      ? await updateEvent(editingEventId, event)
      : await createEvent(event);

    if (error) {
      setMessage(error.message);
      setPayload(null);
      return;
    }

    setMessage(
      editingEventId
        ? 'Event updated! The QR data and attendance records remain linked.'
        : 'Event saved! Students can now scan this QR code.'
    );
    await refreshTeacherEvents();
    setPayload(buildQRPayload(event));
    setTitle('');
    setEventId('');
    setEditingEventId(null);
  };

  const handleDeleteEvent = async (eventKey: string) => {
    Alert.alert('Delete event', 'This will remove the event and all recorded attendance for it. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteEvent(eventKey);
          if (error) {
            setMessage(error.message);
            return;
          }

          setMessage('Event deleted.');
          await refreshTeacherEvents();
          if (editingEventId === eventKey) {
            setEditingEventId(null);
            setTitle('');
            setEventId('');
          }
        },
      },
    ]);
  };

  const handleEditEvent = (event: CloudEvent) => {
    setEditingEventId(event.id);
    setEventId(event.event_code);
    setTitle(event.title);
    setStartDate(event.start_time ? new Date(event.start_time) : new Date());
    setEndDate(event.end_time ? new Date(event.end_time) : new Date(Date.now() + 60 * 60 * 1000));
    setMessage('Editing event. Save the changes below.');
  };

  const setEndOffset = (minutes: number) => {
    setEndDate(new Date(startDate.getTime() + minutes * 60 * 1000));
  };

  if (!role) {
    return <View style={styles.gate}><Text style={styles.title}>Checking your account...</Text></View>;
  }

  if (role !== 'teacher') {
    return <View style={styles.gate}><Text style={styles.title}>Teachers Only</Text><Text style={styles.subtitle}>Event creation is available to teacher accounts.</Text></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Create Event QR</Text>
      <Text style={styles.subtitle}>
        Fill in the event details, then scan the generated QR with the Scan tab.
      </Text>

      <Text style={styles.label}>Event Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Founders Day Assembly"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Event Code</Text>
      <TextInput
        style={styles.input}
        value={eventId}
        onChangeText={setEventId}
        placeholder="e.g. EVT-2026-0002"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Start</Text>
      <View style={styles.dateTimeRow}>
        <View style={styles.dateTimeColumn}>
          <Text style={styles.pickerLabel}>Date</Text>
          <PickerField value={formatDate(startDate)} icon="date-range" label="Choose start date" onPress={() => openPicker('start', 'date')} />
        </View>
        <View style={styles.dateTimeColumn}>
          <Text style={styles.pickerLabel}>Time</Text>
          <PickerField value={formatTime(startDate)} icon="schedule" label="Choose start time" onPress={() => openPicker('start', 'time')} />
        </View>
      </View>

      <Text style={styles.label}>Ends</Text>
      <View style={styles.dateTimeRow}>
        <View style={styles.dateTimeColumn}>
          <Text style={styles.pickerLabel}>Date</Text>
          <PickerField value={formatDate(endDate)} icon="date-range" label="Choose end date" onPress={() => openPicker('end', 'date')} />
        </View>
        <View style={styles.dateTimeColumn}>
          <Text style={styles.pickerLabel}>Time</Text>
          <PickerField value={formatTime(endDate)} icon="schedule" label="Choose end time" onPress={() => openPicker('end', 'time')} />
        </View>
      </View>

      <View style={styles.chipRow}>
        <Text style={styles.chipLabel}>Quick add:</Text>
        <PressableChip label="+30 min" onPress={() => setEndOffset(30)} />
        <PressableChip label="+1 hour" onPress={() => setEndOffset(60)} />
        <PressableChip label="+2 hours" onPress={() => setEndOffset(120)} />
      </View>

      {editTarget && isAndroid && (
        <DateTimePicker
          value={editTarget === 'start' ? startDate : endDate}
          mode={editingPart}
          display={editingPart === 'time' ? 'clock' : 'calendar'}
          is24Hour={false}
          onChange={onPickerChange}
        />
      )}

      {!isAndroid && <Modal
        animationType="fade"
        transparent
        visible={!!editTarget}
        onRequestClose={() => setEditTarget(null)}
      >
        <View style={styles.modalScrim}>
          <View accessibilityViewIsModal style={styles.pickerSheet}>
            <Text style={styles.pickerSheetTitle}>
              Choose {editTarget} {editingPart}
            </Text>
            <Text style={styles.pickerSheetValue}>
              {editingPart === 'date' ? formatDate(pickerDraft) : formatTime(pickerDraft)}
            </Text>
            {isWeb ? createElement('input', {
              'aria-label': `Choose ${editTarget} ${editingPart}`,
              type: editingPart,
              value: toWebPickerValue(pickerDraft, editingPart),
              onChange: onWebPickerChange,
              style: {
                width: '100%',
                minHeight: 48,
                boxSizing: 'border-box',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                backgroundColor: COLORS.card,
                color: '#000000',
                fontFamily: 'inherit',
                fontSize: 16,
                padding: '10px 14px',
              },
            }) : (
              <DateTimePicker
                value={pickerDraft}
                mode={editingPart}
                display={editingPart === 'date' ? 'inline' : 'spinner'}
                is24Hour={false}
                textColor="#000000"
                themeVariant="light"
                accentColor={COLORS.primary}
                onChange={onPickerChange}
                style={styles.iosPicker}
              />
            )}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditTarget(null)}
                style={({ pressed }) => [styles.modalButton, pressed && styles.modalButtonPressed]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmPicker}
                style={({ pressed }) => [styles.modalButton, styles.modalButtonPrimary, pressed && styles.modalButtonPressed]}
              >
                <Text style={styles.modalButtonPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>}

      {message && <Text style={styles.message}>{message}</Text>}

      <AppButton
        theme="primary"
        title={editingEventId ? 'Save Changes' : 'Create Event'}
        icon={editingEventId ? 'edit' : 'add-circle'}
        onPress={handleCreateEvent}
      />

      {editingEventId && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEditingEventId(null);
            setTitle('');
            setEventId('');
            setMessage('Edit cancelled.');
          }}
          style={styles.cancelEditButton}
        >
          <Text style={styles.cancelEditText}>Cancel edit</Text>
        </Pressable>
      )}

      <View style={styles.attendanceSection}>
        <Text style={styles.sectionTitle}>Event Attendance</Text>
        {teacherEvents.length === 0 ? (
          <Text style={styles.emptyState}>No events yet. Create one to get started.</Text>
        ) : (
          teacherEvents.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.eventMeta}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventCode}>{event.event_code}</Text>
                <Text style={styles.eventTime}>
                  {event.start_time && event.end_time
                    ? `${new Date(event.start_time).toLocaleString()} — ${new Date(event.end_time).toLocaleString()}`
                    : 'No schedule set'}
                </Text>
              </View>
              <View style={styles.eventActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleEditEvent(event)}
                  style={({ pressed }) => [styles.actionButton, styles.editButton, pressed && styles.actionButtonPressed]}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleDeleteEvent(event.id)}
                  style={({ pressed }) => [styles.actionButton, styles.deleteButton, pressed && styles.actionButtonPressed]}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            Scan this QR code with the Scan tab:
          </Text>
          <View style={styles.qrBox}>
            <QRCode value={payload} size={200} />
          </View>
          <Text style={styles.payloadText}>{payload}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function PressableChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.chip}
      onPress={onPress}
      android_ripple={{ color: COLORS.surface }}
      accessibilityRole="button"
      accessibilityLabel={`Set event duration to ${label.replace('+', '')}`}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  gate: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 120,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.elevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  dateTimeRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dateTimeColumn: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  pickerLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  modalScrim: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: 20 },
  pickerSheet: { width: '100%', maxWidth: 430, backgroundColor: COLORS.elevated, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 20 },
  pickerSheetTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', textTransform: 'capitalize' },
  pickerSheetValue: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 12 },
  iosPicker: { width: '100%' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalButton: { minWidth: 96, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  modalButtonPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modalButtonPressed: { opacity: 0.7 },
  modalButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  modalButtonPrimaryText: { color: COLORS.textOnPrimary, fontSize: 15, fontWeight: '700' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  chipLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  message: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 12,
  },
  attendanceSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  emptyState: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  eventRow: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventMeta: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  eventCode: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  eventActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    minWidth: 68,
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  editButton: {
    backgroundColor: COLORS.primarySoft,
  },
  editButtonText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelEditButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  cancelEditText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
