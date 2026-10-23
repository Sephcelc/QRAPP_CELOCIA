import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import Text from '@/components/AppText';
import { COLORS } from '@/constants/colors';
import { getAllAttendanceForAdmin, type AdminAttendanceRecord } from '@/lib/attendance';
import { getAllEventsForAdmin, type CloudEvent } from '@/lib/events';
import { getProfilesForAdmin, type Profile } from '@/lib/profiles';

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function AdminReportsPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setError('');
    const [profileResult, eventResult, attendanceResult] = await Promise.all([
      getProfilesForAdmin(),
      getAllEventsForAdmin(),
      getAllAttendanceForAdmin(),
    ]);
    if (!isActive()) return;
    setLoading(false);
    const firstError = profileResult.error ?? eventResult.error ?? attendanceResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    setProfiles(profileResult.profiles);
    setEvents(eventResult.events);
    setRecords(attendanceResult.records);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadReport(() => active);
    return () => { active = false; };
  }, [loadReport]));

  const todayKey = new Date().toDateString();
  const todayCount = records.filter((record) => new Date(record.scannedAt).toDateString() === todayKey).length;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const last30Days = records.filter((record) => {
    const timestamp = new Date(record.scannedAt).getTime();
    return timestamp >= thirtyDaysAgo && timestamp <= now;
  }).length;
  const roleTotals = {
    student: profiles.filter((profile) => profile.role === 'student').length,
    teacher: profiles.filter((profile) => profile.role === 'teacher').length,
    admin: profiles.filter((profile) => profile.role === 'admin').length,
  };
  const eventTotals = new Map<string, number>();
  records.forEach((record) => eventTotals.set(record.eventId, (eventTotals.get(record.eventId) ?? 0) + 1));
  const rankedEvents = [...events]
    .map((event) => ({ event, count: eventTotals.get(event.id) ?? 0 }))
    .sort((left, right) => right.count - left.count || left.event.title.localeCompare(right.event.title))
    .slice(0, 8);

  const exportCsv = async () => {
    const header = ['student_name', 'student_email', 'event_code', 'event_title', 'scanned_at'];
    const rows = records.map((record) => [
      record.studentName ?? '',
      record.studentEmail,
      record.eventCode,
      record.eventTitle,
      record.scannedAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    try {
      await Share.share({ title: 'QR Attendance report', message: csv });
    } catch {
      setError('Unable to share the report on this device.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>System reports</Text>
          <Text style={styles.hint}>Attendance trends and records for audits.</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh reports"
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void loadReport()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {loading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <MaterialIcons name="refresh" size={21} color={COLORS.primary} />}
        </Pressable>
      </View>

      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {loading && profiles.length === 0 ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loading} />
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric icon="group" label="Users" value={profiles.length} />
            <Metric icon="event" label="Events" value={events.length} />
            <Metric icon="check-circle" label="Check-ins" value={records.length} />
            <Metric icon="today" label="Today" value={todayCount} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attendance activity</Text>
            <Text style={styles.sectionHint}>Check-ins recorded in the last 30 days</Text>
            <View style={styles.trendRow}>
              <View style={styles.trendIcon}><MaterialIcons name="trending-up" size={21} color={COLORS.success} /></View>
              <Text style={styles.trendValue}>{last30Days}</Text>
              <Text style={styles.trendLabel}>check-ins</Text>
            </View>
            <View style={styles.roleSummary}>
              <RoleTotal label="Students" value={roleTotals.student} />
              <RoleTotal label="Teachers" value={roleTotals.teacher} />
              <RoleTotal label="Admins" value={roleTotals.admin} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event summaries</Text>
            {rankedEvents.length === 0 ? (
              <Text style={styles.empty}>No event records available.</Text>
            ) : rankedEvents.map(({ event, count }) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventCode}>{event.event_code}</Text>
                </View>
                <Text style={styles.eventCount}>{count}</Text>
              </View>
            ))}
          </View>

          <View style={styles.recordsSection}>
            <View style={styles.recordsHeader}>
              <View style={styles.eventCopy}>
                <Text style={styles.sectionTitle}>System records</Text>
                <Text style={styles.sectionHint}>{records.length} attendance records</Text>
              </View>
              <Pressable
                accessibilityLabel="Share attendance report as CSV"
                accessibilityRole="button"
                disabled={records.length === 0}
                onPress={() => void exportCsv()}
                style={({ pressed }) => [styles.exportButton, !records.length && styles.disabled, pressed && styles.pressed]}
              >
                <MaterialIcons name="file-download" size={18} color={COLORS.textOnPrimary} />
                <Text style={styles.exportText}>Export CSV</Text>
              </Pressable>
            </View>
            {records.length === 0 ? (
              <Text style={styles.empty}>No attendance records to review.</Text>
            ) : (
              <ScrollView nestedScrollEnabled style={styles.recordList}>
                {records.slice(0, 50).map((record) => (
                  <View key={record.id} style={styles.recordRow}>
                    <View style={styles.eventCopy}>
                      <Text style={styles.recordTitle}>{record.studentName || record.studentEmail}</Text>
                      <Text style={styles.recordMeta}>{record.eventCode} · {record.eventTitle}</Text>
                    </View>
                    <Text style={styles.recordTime}>{new Date(record.scannedAt).toLocaleDateString()}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}><MaterialIcons name={icon} size={19} color={COLORS.primary} /></View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RoleTotal({ label, value }: { label: string; value: number }) {
  return <View style={styles.roleTotal}><Text style={styles.roleValue}>{value}</Text><Text style={styles.roleLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headingCopy: { flex: 1, minWidth: 0 },
  heading: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700' },
  hint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  iconButton: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metric: { flexGrow: 1, flexBasis: 130, minHeight: 110, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 13 },
  metricIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  metricValue: { color: COLORS.textPrimary, fontSize: 23, fontWeight: '700' },
  metricLabel: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  section: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 14 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  sectionHint: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  trendIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.successLight, alignItems: 'center', justifyContent: 'center' },
  trendValue: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '700' },
  trendLabel: { color: COLORS.textSecondary, fontSize: 13 },
  roleSummary: { flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  roleTotal: { flex: 1 },
  roleValue: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  roleLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 9 },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  eventCode: { color: COLORS.textSecondary, fontSize: 11, marginTop: 3 },
  eventCount: { minWidth: 34, overflow: 'hidden', borderRadius: 9, backgroundColor: COLORS.primarySoft, color: COLORS.primaryDark, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  recordsSection: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  recordsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  exportButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: COLORS.primary, paddingHorizontal: 10 },
  exportText: { color: COLORS.textOnPrimary, fontSize: 12, fontWeight: '700' },
  recordList: { maxHeight: 420 },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8 },
  recordTitle: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600' },
  recordMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 3 },
  recordTime: { color: COLORS.textSecondary, fontSize: 10 },
  empty: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  loading: { marginVertical: 24 },
  error: { color: COLORS.danger, fontSize: 13 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.65 },
});