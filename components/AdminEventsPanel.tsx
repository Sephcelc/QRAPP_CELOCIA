import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import AppButton from '@/components/AppButton';
import Text from '@/components/AppText';
import PickerField from '@/components/PickerField';
import { COLORS } from '@/constants/colors';
import {
  createEventForAdmin,
  deleteEventForAdmin,
  getAllEventsForAdmin,
  updateEventForAdmin,
  type CloudEvent,
} from '@/lib/events';

const isAndroid = Platform.OS === 'android';
const isWeb = Platform.OS === 'web';

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function toWebPickerValue(date: Date, mode: 'date' | 'time') {
  const pad = (value: number) => String(value).padStart(2, '0');
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminEventsPanel() {
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [eventCode, setEventCode] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [editingEvent, setEditingEvent] = useState<CloudEvent | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [pickerDraft, setPickerDraft] = useState(() => new Date());

  const refreshEvents = useCallback(async () => {
    setLoading(true);
    const result = await getAllEventsForAdmin();
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEvents(result.events);
    setError('');
  }, []);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const openPicker = (target: 'start' | 'end', part: 'date' | 'time') => {
    setPickerDraft(new Date(target === 'start' ? startDate : endDate));
    setPickerTarget(target);
    setEditingPart(part);
  };

  const applyPickerValue = (selected: Date) => {
    if (!pickerTarget) return;
    const current = pickerTarget === 'start' ? startDate : endDate;
    const next = editingPart === 'date'
      ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), current.getHours(), current.getMinutes())
      : new Date(current.getFullYear(), current.getMonth(), current.getDate(), selected.getHours(), selected.getMinutes());
    if (pickerTarget === 'start') setStartDate(next);
    else setEndDate(next);
  };

  const onPickerChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (!selected) {
      if (isAndroid) setPickerTarget(null);
      return;
    }
    if (isAndroid) {
      applyPickerValue(selected);
      setPickerTarget(null);
    } else {
      setPickerDraft(selected);
    }
  };

  const onWebPickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!pickerTarget || !event.currentTarget.value) return;
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

  const resetForm = () => {
    setEditingEvent(null);
    setEventCode('');
    setTitle('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setMessage('');
    setError('');
  };

  const saveEvent = async () => {
    const trimmedCode = eventCode.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCode || !trimmedTitle) {
      setError('Enter both an event name and event code.');
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setError('The end time must be after the start time.');
      return;
    }

    setSaving(true);
    setError('');
    const event = {
      eventId: trimmedCode,
      title: trimmedTitle,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
    const result = editingEvent
      ? await updateEventForAdmin(editingEvent.id, event)
      : await createEventForAdmin(event);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const wasEditing = !!editingEvent;
    resetForm();
    setMessage(wasEditing ? 'Event updated.' : 'Event created.');
    await refreshEvents();
  };

  const editEvent = (event: CloudEvent) => {
    setEditingEvent(event);
    setEventCode(event.event_code);
    setTitle(event.title);
    setStartDate(event.start_time ? new Date(event.start_time) : new Date());
    setEndDate(event.end_time ? new Date(event.end_time) : new Date(Date.now() + 60 * 60 * 1000));
    setError('');
    setMessage(`Editing ${event.title}.`);
  };

  const deleteEvent = (event: CloudEvent) => {
    Alert.alert('Remove event', `Remove ${event.title} and its attendance records?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteEventForAdmin(event.id);
          if (result.error) {
            setError(result.error.message);
            return;
          }
          if (editingEvent?.id === event.id) resetForm();
          setMessage('Event removed.');
          await refreshEvents();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>Manage events</Text>
          <Text style={styles.hint}>Create, edit, and remove school activities.</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh events"
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void refreshEvents()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <MaterialIcons name={loading ? 'hourglass-empty' : 'refresh'} size={21} color={COLORS.primary} />
        </Pressable>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>{editingEvent ? 'Edit event' : 'New event'}</Text>
        <Text style={styles.label}>Event name</Text>
        <TextInput
          accessibilityLabel="Event name"
          editable={!saving}
          onChangeText={setTitle}
          placeholder="e.g. Founders Day Assembly"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.input}
          value={title}
        />
        <Text style={styles.label}>Event code</Text>
        <TextInput
          accessibilityLabel="Event code"
          autoCapitalize="characters"
          editable={!saving}
          onChangeText={setEventCode}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.input}
          value={eventCode}
        />
        <Text style={styles.label}>Starts</Text>
        <View style={styles.dateTimeRow}>
          <View style={styles.dateTimeColumn}>
            <PickerField value={formatDate(startDate)} icon="calendar-today" label="Choose start date" onPress={() => openPicker('start', 'date')} />
          </View>
          <View style={styles.dateTimeColumn}>
            <PickerField value={formatTime(startDate)} icon="schedule" label="Choose start time" onPress={() => openPicker('start', 'time')} />
          </View>
        </View>
        <Text style={styles.label}>Ends</Text>
        <View style={styles.dateTimeRow}>
          <View style={styles.dateTimeColumn}>
            <PickerField value={formatDate(endDate)} icon="calendar-today" label="Choose end date" onPress={() => openPicker('end', 'date')} />
          </View>
          <View style={styles.dateTimeColumn}>
            <PickerField value={formatTime(endDate)} icon="schedule" label="Choose end time" onPress={() => openPicker('end', 'time')} />
          </View>
        </View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!message && !error && <Text style={styles.success}>{message}</Text>}
        <AppButton
          disabled={saving}
          icon={editingEvent ? 'save' : 'add-circle'}
          onPress={() => void saveEvent()}
          theme="primary"
          title={saving ? 'Saving…' : editingEvent ? 'Save event' : 'Create event'}
        />
        {editingEvent && (
          <Pressable accessibilityRole="button" onPress={resetForm} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel edit</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.eventsHeading}>
        <Text style={styles.sectionTitle}>All events</Text>
        <Text style={styles.count}>{events.length}</Text>
      </View>
      {loading && events.length === 0 ? (
        <Text style={styles.empty}>Loading events…</Text>
      ) : events.length === 0 ? (
        <Text style={styles.empty}>No events have been created.</Text>
      ) : (
        <ScrollView nestedScrollEnabled style={styles.eventList}>
          {events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventCode}>{event.event_code}</Text>
                </View>
                <View style={styles.eventActions}>
                  <Pressable accessibilityLabel={`Edit ${event.title}`} accessibilityRole="button" onPress={() => editEvent(event)} style={styles.actionButton}>
                    <MaterialIcons name="edit" size={19} color={COLORS.primary} />
                  </Pressable>
                  <Pressable accessibilityLabel={`Remove ${event.title}`} accessibilityRole="button" onPress={() => deleteEvent(event)} style={styles.actionButton}>
                    <MaterialIcons name="delete-outline" size={20} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.eventTime}>
                {event.start_time ? new Date(event.start_time).toLocaleString() : 'Start not set'}
                {'  ·  '}
                {event.end_time ? new Date(event.end_time).toLocaleString() : 'End not set'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {pickerTarget && isAndroid && (
        <DateTimePicker
          value={pickerTarget === 'start' ? startDate : endDate}
          mode={editingPart}
          display={editingPart === 'time' ? 'clock' : 'calendar'}
          onChange={onPickerChange}
        />
      )}
      {!isAndroid && (
        <Modal animationType="fade" transparent visible={!!pickerTarget} onRequestClose={() => setPickerTarget(null)}>
          <View style={styles.modalScrim}>
            <View accessibilityViewIsModal style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Choose {pickerTarget} {editingPart}</Text>
              {isWeb ? createElement('input', {
                'aria-label': `Choose ${pickerTarget} ${editingPart}`,
                type: editingPart,
                value: toWebPickerValue(pickerDraft, editingPart),
                onChange: onWebPickerChange,
                style: { width: '100%', minHeight: 48, boxSizing: 'border-box', border: `1px solid ${COLORS.border}`, borderRadius: 10, backgroundColor: COLORS.card, color: COLORS.textPrimary, fontFamily: 'Inter', fontSize: 15, padding: '10px 12px' },
              }) : (
                <DateTimePicker
                  value={pickerDraft}
                  mode={editingPart}
                  display={editingPart === 'date' ? 'inline' : 'spinner'}
                  onChange={onPickerChange}
                />
              )}
              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={() => setPickerTarget(null)} style={styles.modalButton}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { applyPickerValue(pickerDraft); setPickerTarget(null); }} style={[styles.modalButton, styles.modalDone]}>
                  <Text style={styles.modalDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  form: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 24 },
  formTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { width: '100%', minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.background, color: COLORS.textPrimary, paddingHorizontal: 12, fontSize: 14 },
  dateTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dateTimeColumn: { flex: 1, minWidth: 140 },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12 },
  success: { color: COLORS.success, fontSize: 13, marginBottom: 12 },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  eventsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  count: { minWidth: 30, textAlign: 'center', borderRadius: 9, overflow: 'hidden', color: COLORS.primaryDark, backgroundColor: COLORS.primarySoft, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 5 },
  eventList: { maxHeight: 500 },
  eventCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  eventCode: { color: COLORS.primary, fontSize: 12, fontWeight: '600', marginTop: 3 },
  eventActions: { flexDirection: 'row', gap: 6 },
  actionButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  eventTime: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
  empty: { color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 20 },
  pressed: { opacity: 0.65 },
  modalScrim: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20, 31, 52, 0.45)', padding: 20 },
  pickerSheet: { width: '100%', maxWidth: 430, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 18 },
  pickerTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 14, textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  modalButton: { minWidth: 84, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  modalDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modalCancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  modalDoneText: { color: COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },
});