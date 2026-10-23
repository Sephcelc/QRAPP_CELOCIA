import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import Text from '@/components/AppText';
import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type ProfileRole } from '@/lib/profiles';

export default function Index() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [role, setRole] = useState<ProfileRole>('student');
  const [displayName, setDisplayName] = useState('there');

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadProfile = async () => {
      if (!user) return;
      const profile = await getProfile(user.id);
      if (!active) return;
      setRole(profile?.role ?? 'student');
      const metadataName = user.user_metadata?.full_name;
      const name = profile?.full_name || (typeof metadataName === 'string' ? metadataName : '');
      setDisplayName(name.trim().split(/\s+/)[0] || user.email?.split('@')[0] || 'there');
    };
    void loadProfile();
    return () => { active = false; };
  }, [user]));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const mainAction = role === 'student'
    ? { label: 'Scan event QR', icon: 'qr-code-scanner' as const, route: '/scan' as const }
    : role === 'teacher'
      ? { label: 'Create an event', icon: 'add-circle' as const, route: '/teacher' as const }
      : { label: 'Manage users', icon: 'group' as const, route: '/admin' as const };
  const secondaryActions = role === 'student'
    ? [
        { label: 'Attendance history', detail: 'Review your check-ins', icon: 'history' as const, route: '/history' as const },
        { label: 'My profile', detail: 'Account details and settings', icon: 'person-outline' as const, route: '/profile' as const },
      ]
    : role === 'teacher'
      ? [
          { label: 'Event attendance', detail: 'See attendance for your events', icon: 'event-note' as const, route: '/history' as const },
          { label: 'My profile', detail: 'Account details and settings', icon: 'person-outline' as const, route: '/profile' as const },
        ]
      : [
          { label: 'Attendance history', detail: 'Review your check-ins', icon: 'history' as const, route: '/history' as const },
          { label: 'My profile', detail: 'Account details and settings', icon: 'person-outline' as const, route: '/profile' as const },
        ];

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.content, desktop && styles.contentDesktop]}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.logoTile}>
                <MaterialIcons name="fact-check" size={25} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.brandName}>QR Attendance</Text>
                <Text style={styles.brandMeta}>CELOCIA SCHOOL SYSTEM</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Open profile"
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              <MaterialIcons name="person-outline" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.greetingRow}>
            <View style={styles.greetingCopy}>
              <Text style={styles.greeting}>{greeting},</Text>
              <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
              <Text style={styles.subtitle}>Your attendance, all in one place.</Text>
            </View>
            <View style={styles.dateBadge}>
              <MaterialIcons name="calendar-today" size={16} color={COLORS.primary} />
              <Text style={styles.dateText}>{today}</Text>
            </View>
          </View>

          <View style={[styles.dashboard, desktop && styles.dashboardDesktop]}>
            <View style={[styles.checkInCard, desktop && styles.checkInCardDesktop]}>
              <View style={styles.qrTile}>
                <MaterialIcons name={mainAction.icon} size={30} color={COLORS.primary} />
              </View>
              <Text style={styles.cardEyebrow}>{role === 'student' ? 'READY WHEN YOU ARE' : 'QUICK ACTION'}</Text>
              <Text style={styles.checkInTitle}>
                {role === 'student' ? 'Check in to your event.' : role === 'teacher' ? 'Set up your next event.' : 'Keep your school organized.'}
              </Text>
              <Text style={styles.checkInCopy}>
                {role === 'student'
                  ? 'Scan the event QR code to record your attendance in seconds.'
                  : role === 'teacher'
                    ? 'Create an event QR code and follow attendance as it comes in.'
                    : 'Review accounts and keep access up to date.'}
              </Text>
              <AppButton
                theme="primary"
                title={mainAction.label}
                icon={mainAction.icon}
                onPress={() => router.push(mainAction.route)}
              />
              {role === 'student' && (
                <View style={styles.noteRow}>
                  <MaterialIcons name="verified-user" size={16} color={COLORS.onPrimaryMuted} />
                  <Text style={styles.noteText}>Check-in is available during scheduled events.</Text>
                </View>
              )}
            </View>

            <View style={styles.quickSection}>
              <Text style={styles.quickTitle}>Quick access</Text>
              <Text style={styles.quickSubtitle}>Pick up where you left off.</Text>
              {secondaryActions.map((action) => (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={() => router.push(action.route)}
                  style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
                >
                  <View style={styles.quickIcon}>
                    <MaterialIcons name={action.icon} size={21} color={COLORS.primary} />
                  </View>
                  <View style={styles.quickCopy}>
                    <Text style={styles.quickActionTitle}>{action.label}</Text>
                    <Text style={styles.quickActionDetail}>{action.detail}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 112 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  contentDesktop: { maxWidth: 1040, paddingTop: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoTile: { width: 44, height: 44, borderRadius: 13, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  brandMeta: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 3 },
  profileButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 22 },
  greetingCopy: { flex: 1, minWidth: 0 },
  greeting: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },
  name: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 38, fontWeight: '700', marginTop: 2 },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 5 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  dateText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  dashboard: { gap: 18 },
  dashboardDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: 20 },
  checkInCard: { backgroundColor: COLORS.primaryDark, borderRadius: 20, padding: 22, overflow: 'hidden' },
  checkInCardDesktop: { flex: 1.15, justifyContent: 'center', padding: 30, minHeight: 380 },
  qrTile: { width: 54, height: 54, borderRadius: 16, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  cardEyebrow: { color: COLORS.onPrimaryMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  checkInTitle: { color: COLORS.textOnPrimary, fontSize: 26, lineHeight: 33, fontWeight: '700', maxWidth: 440 },
  checkInCopy: { color: COLORS.onPrimarySoft, fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 22, maxWidth: 460 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  noteText: { color: COLORS.onPrimaryMuted, fontSize: 12, flex: 1 },
  quickSection: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 18 },
  quickTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  quickSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 12 },
  quickAction: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12 },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  quickCopy: { flex: 1, minWidth: 0 },
  quickActionTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  quickActionDetail: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.7 },
});
