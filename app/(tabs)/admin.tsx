import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import AdminAttendancePanel from '@/components/AdminAttendancePanel';
import AdminEventsPanel from '@/components/AdminEventsPanel';
import AdminReportsPanel from '@/components/AdminReportsPanel';
import Text from '@/components/AppText';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, getProfilesForAdmin, profileErrorMessage, updateManagedProfileRole, type Profile, type ProfileRole } from '@/lib/profiles';

const adminSections = [
  { id: 'users', label: 'Users', icon: 'group' },
  { id: 'events', label: 'Events', icon: 'event' },
  { id: 'attendance', label: 'Attendance', icon: 'fact-check' },
  { id: 'reports', label: 'Reports', icon: 'insights' },
] as const;

type AdminSection = (typeof adminSections)[number]['id'];

export default function AdminScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersMessage, setUsersMessage] = useState('');
  const [search, setSearch] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [section, setSection] = useState<AdminSection>('users');

  const loadProfiles = useCallback(async (isActive: () => boolean = () => true) => {
    setUsersLoading(true);
    setUsersError('');
    const result = await getProfilesForAdmin();
    if (!isActive()) return;
    setUsersLoading(false);
    if (result.error) {
      setUsersError(profileErrorMessage(result.error, 'Unable to load user accounts.'));
      return;
    }
    setProfiles(result.profiles);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setRole(null);
      const checkAccount = async () => {
        if (!user) {
          if (active) setRole('student');
          return;
        }
        const profile = await getProfile(user.id);
        if (!active) return;
        const currentRole = profile?.role ?? 'student';
        setRole(currentRole);
        if (currentRole === 'admin') await loadProfiles(() => active);
      };
      void checkAccount();
      return () => {
        active = false;
      };
    }, [loadProfiles, user]),
  );

  const saveRole = async (userId: string, nextRole: ProfileRole) => {
    setSavingUserId(userId);
    setUsersError('');
    setUsersMessage('');
    const result = await updateManagedProfileRole(userId, nextRole);
    setSavingUserId(null);
    if (result.error || !result.profile) {
      setUsersError(profileErrorMessage(result.error, 'Unable to update this account.'));
      return;
    }
    setProfiles((current) => current.map((profile) => profile.id === userId ? result.profile! : profile));
    setUsersMessage(`${result.profile.full_name || result.profile.email} is now ${nextRole}.`);
  };

  if (!role) {
    return (
      <View style={styles.gate}>
        <Text style={styles.title}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>Administrator Only</Text>
        <Text style={styles.subtitle}>This dashboard is available to administrator accounts.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ADMINISTRATION</Text>
      <Text style={styles.title}>Administrator</Text>
      <Text style={styles.subtitle}>
        Review accounts, events, attendance, and system records.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabs} contentContainerStyle={styles.sectionTabsContent}>
        {adminSections.map((item) => {
          const active = section === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.id}
              onPress={() => setSection(item.id)}
              style={({ pressed }) => [styles.sectionTab, active && styles.sectionTabActive, pressed && styles.pressed]}
            >
              <MaterialIcons name={item.icon} size={18} color={active ? COLORS.textOnPrimary : COLORS.textSecondary} />
              <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {section === 'users' && <View style={styles.usersSection}>
        <View style={styles.usersHeader}>
          <View style={styles.permissionTextWrap}>
            <Text style={styles.sectionTitle}>Manage users</Text>
            <Text style={styles.sectionHint}>Change account types for registered users.</Text>
          </View>
          <Pressable
            accessibilityLabel="Refresh users"
            accessibilityRole="button"
            disabled={usersLoading}
            onPress={() => void loadProfiles()}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            {usersLoading
              ? <ActivityIndicator color={COLORS.primary} size="small" />
              : <MaterialIcons color={COLORS.primary} name="refresh" size={22} />}
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Search users"
          onChangeText={setSearch}
          placeholder="Search by name or email"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.searchInput}
          value={search}
        />
        {!!usersError && <Text accessibilityRole="alert" style={styles.errorText}>{usersError}</Text>}
        {!!usersMessage && <Text style={styles.successText}>{usersMessage}</Text>}
        {usersLoading && profiles.length === 0 ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loadingUsers} />
        ) : (() => {
          const query = search.trim().toLowerCase();
          const visibleProfiles = profiles.filter((profile) =>
            `${profile.full_name ?? ''} ${profile.email}`.toLowerCase().includes(query)
          );
          if (visibleProfiles.length === 0) {
            return <Text style={styles.emptyUsers}>{profiles.length ? 'No matching users.' : 'No user accounts found.'}</Text>;
          }
          return visibleProfiles.map((profile) => (
            <UserRoleRow
              key={profile.id}
              profile={profile}
              currentUserId={user?.id ?? ''}
              saving={savingUserId === profile.id}
              busy={savingUserId !== null}
              onSave={saveRole}
            />
          ));
        })()}
      </View>}
      {section === 'events' && <AdminEventsPanel />}
      {section === 'attendance' && <AdminAttendancePanel />}
      {section === 'reports' && <AdminReportsPanel />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 120,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  sectionTabs: {
    flexGrow: 0,
    marginBottom: 20,
  },
  sectionTabsContent: {
    gap: 8,
    paddingVertical: 2,
  },
  sectionTab: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    paddingHorizontal: 13,
  },
  sectionTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  sectionTabText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTabTextActive: {
    color: COLORS.textOnPrimary,
  },
  usersSection: {
    marginBottom: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  usersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionHint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.card,
  },
  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  userCard: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  userIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userCopy: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  userEmail: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  youBadge: {
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primarySoft,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  roleOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  roleOption: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    paddingHorizontal: 4,
  },
  roleOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  roleOptionDisabled: {
    opacity: 0.55,
  },
  roleOptionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  roleOptionTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  saveRoleButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  saveRoleButtonDisabled: {
    opacity: 0.45,
  },
  saveRoleText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyUsers: {
    color: COLORS.textSecondary,
    paddingVertical: 16,
    textAlign: 'center',
  },
  loadingUsers: {
    marginVertical: 22,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  successText: {
    color: COLORS.success,
    fontSize: 13,
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.65,
  },
  permissionTextWrap: {
    flex: 1,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
});

const roleOptions: Array<{ role: ProfileRole; label: string }> = [
  { role: 'student', label: 'Student' },
  { role: 'teacher', label: 'Teacher' },
  { role: 'admin', label: 'Admin' },
];

function UserRoleRow({
  profile,
  currentUserId,
  saving,
  busy,
  onSave,
}: {
  profile: Profile;
  currentUserId: string;
  saving: boolean;
  busy: boolean;
  onSave: (userId: string, role: ProfileRole) => void;
}) {
  const [selectedRole, setSelectedRole] = useState(profile.role);
  const isCurrentUser = profile.id === currentUserId;
  const changed = selectedRole !== profile.role;

  return (
    <View style={styles.userCard}>
      <View style={styles.userIdentity}>
        <View style={styles.userCopy}>
          <Text style={styles.userName}>{profile.full_name || 'Unnamed user'}</Text>
          <Text numberOfLines={1} style={styles.userEmail}>{profile.email}</Text>
        </View>
        {isCurrentUser && <Text style={styles.youBadge}>You</Text>}
      </View>
      <View accessibilityRole="radiogroup" style={styles.roleOptions}>
        {roleOptions.map((option) => {
          const active = selectedRole === option.role;
          const disabled = isCurrentUser || busy;
          return (
            <Pressable
              accessibilityLabel={`${option.label} role for ${profile.email}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              key={option.role}
              onPress={() => setSelectedRole(option.role)}
              style={({ pressed }) => [
                styles.roleOption,
                active && styles.roleOptionActive,
                disabled && styles.roleOptionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.roleOptionText, active && styles.roleOptionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {changed && !isCurrentUser && (
        <View style={styles.userActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setSelectedRole(profile.role)}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            <MaterialIcons color={COLORS.textSecondary} name="close" size={19} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onSave(profile.id, selectedRole)}
            style={({ pressed }) => [styles.saveRoleButton, busy && styles.saveRoleButtonDisabled, pressed && styles.pressed]}
          >
            {saving && <ActivityIndicator color={COLORS.textOnPrimary} size="small" />}
            <Text style={styles.saveRoleText}>{saving ? 'Saving' : 'Save role'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}