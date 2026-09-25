/**
 * Trust Assembly — Settings Screen
 * Settings, site mute management, and logout.
 * Ported from extensions/chrome/popup.js settings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert, FlatList, RefreshControl } from 'react-native';
import { COLORS } from '../utils/constants';
import { useAuth } from '../storage/authContext';
import { getSettings, toggleSetting, getMutedSites, setSiteMuted } from '../storage/settingsStore';
import type { TASettings, SiteMuteMap } from '../types/trustAssembly';

export default function SettingsScreen({ navigation }: any) {
  const [settings, setSettings] = useState<TASettings>({ showBadge: true, showTranslations: true });
  const [mutedSites, setMutedSites] = useState<SiteMuteMap>({});
  const [refreshing, setRefreshing] = useState(false);
  const { user, logout } = useAuth();

  const loadSettingsAndMutes = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    const m = await getMutedSites();
    setMutedSites(m);
  }, []);

  useEffect(() => {
    loadSettingsAndMutes();
  }, [loadSettingsAndMutes]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSettingsAndMutes().finally(() => setRefreshing(false));
  };

  const handleToggleBadge = async () => {
    const newSettings = await toggleSetting('showBadge');
    setSettings(newSettings);
  };

  const handleToggleTranslations = async () => {
    const newSettings = await toggleSetting('showTranslations');
    setSettings(newSettings);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); } },
        ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Show Floating Badge</Text>
          <Switch
            value={settings.showBadge}
            onValueChange={handleToggleBadge}
            trackColor={{ false: '#DCD8D0', true: COLORS.gold }}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Show Translations</Text>
          <Switch
            value={settings.showTranslations}
            onValueChange={handleToggleTranslations}
            trackColor={{ false: '#DCD8D0', true: COLORS.gold }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Muted Sites</Text>
        <Text style={styles.sectionHint}>Corrections are hidden on these sites</Text>
        {Object.keys(mutedSites).length === 0 ? (
          <Text style={styles.emptyText}>No sites muted</Text>
        ) : (
          <FlatList
            data={Object.keys(mutedSites)}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <View style={styles.mutedItem}>
                <Text style={styles.mutedDomain}>{item}</Text>
                <TouchableOpacity
                  style={styles.unmuteButton}
                  onPress={async () => {
                    await setSiteMuted(item, false);
                    onRefresh();
                  }}
                >
                  <Text style={styles.unmuteText}>Unmute</Text>
                </TouchableOpacity>
              </View>
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            scrollEnabled={false}
          />
        )}
      </View>

      {user && (
        <View style={styles.section}>
          <Text style={styles.userEmail}>{user.displayName || user.username}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.section, styles.logoutRow]}
        onPress={user ? handleLogout : () => navigation.navigate('Auth')}
      >
        <Text style={user ? styles.logoutText : styles.signInText}>
          {user ? 'Log Out' : 'Sign In'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.vellum },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#DCD8D0', backgroundColor: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 8, padding: 12, elevation: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.navy, marginBottom: 8 },
  sectionHint: { fontSize: 11, color: '#7A7570', marginBottom: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  settingLabel: { fontSize: 14, color: COLORS.navy },
  mutedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0EDE6' },
  mutedDomain: { fontSize: 13, color: COLORS.navy, flex: 1 },
  unmuteButton: { backgroundColor: COLORS.navy, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  unmuteText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#7A7570', fontStyle: 'italic' },
  logoutRow: { borderBottomWidth: 0, marginTop: 0 },
  logoutText: { fontSize: 15, fontWeight: '600', color: COLORS.red, flex: 1 },
  signInText: { fontSize: 15, fontWeight: '600', color: COLORS.navy, flex: 1 },
  userEmail: { fontSize: 11, color: '#7A7570', marginTop: 4 },
});
