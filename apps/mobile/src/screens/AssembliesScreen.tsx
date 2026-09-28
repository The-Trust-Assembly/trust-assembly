/**
 * Trust Assembly — Assemblies Screen
 *
 * Lists assemblies the user is following or a member of.
 * Ported from extensions/chrome/popup.js assemblies tab.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../utils/constants';
import { refreshUserAssemblies, unfollowOrg } from '../api/trustAssemblyApi';
import type { Assembly } from '../types/trustAssembly';
import { useAuth } from '../storage/authContext';

export default function AssembliesScreen({ navigation }: any) {
  const [joined, setJoined] = useState<Assembly[]>([]);
  const [followed, setFollowed] = useState<Assembly[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useAuth();

  const loadAssemblies = useCallback(async () => {
    if (!user) {
      setJoined([]);
      setFollowed([]);
      setLoadError(null);
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoadError(null);
      const data = await refreshUserAssemblies();
      setJoined(data.joined || []);
      setFollowed(data.followed || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load assemblies';
      setLoadError(message);
      console.warn('Error loading assemblies:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    setIsLoading(true);
    loadAssemblies();
  }, [loadAssemblies]));

  const onRefresh = () => {
    setRefreshing(true);
    loadAssemblies();
  };

  const handleUnfollow = async (assembly: Assembly) => {
    Alert.alert('Unfollow', 'Stop following ' + assembly.name + '?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: async () => {
          const result = await unfollowOrg(assembly.id);
          if (result?.error) {
            Alert.alert('Unable to unfollow', result.error);
            return;
          }
          onRefresh();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Assembly }) => (
    <View style={styles.item}>
      <Image
        source={item.profile ? { uri: item.profile } : require('../../assets/icon.png')}
        style={styles.itemImage}
      />
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDesc}>{item.description}</Text>
        <View style={styles.itemMeta}>
          {typeof item.memberCount === 'number' && (
            <Text style={styles.itemMembers}>{item.memberCount} members</Text>
          )}
          {item.isMember && <Text style={styles.memberBadge}>Member</Text>}
          {item.isFollowing && <Text style={styles.followingBadge}>Following</Text>}
        </View>
      </View>
      {item.isFollowing && (
        <TouchableOpacity style={styles.unfollowButton} onPress={() => handleUnfollow(item)}>
          <Text style={styles.unfollowText}>Unfollow</Text>
        </TouchableOpacity>
      )}
      {typeof item.trustScore === 'number' && (
        <View style={styles.trustScore}>
          <Text style={styles.trustText}>Trust: {item.trustScore}</Text>
        </View>
      )}
    </View>
  );

  const renderSection = (title: string, data: Assembly[]) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <FlatList data={data} keyExtractor={(item) => item.id} renderItem={renderItem} scrollEnabled={false} />
      </View>
    );
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Sign in to view your assemblies.</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate('Auth')}>
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading && !refreshing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={styles.loadingText}>Loading assemblies for @{user.username}…</Text>
      </View>
    );
  }

  const total = joined.length + followed.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Assemblies</Text>
          <Text style={styles.signedInText}>Signed in as @{user.username}</Text>
        </View>
      </View>

      {loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Assemblies could not be loaded</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.signInButton} onPress={onRefresh}>
            <Text style={styles.signInText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : total === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No assemblies found.</Text>
          <Text style={styles.hint}>Your session is valid, but the server returned no active memberships or followed assemblies.</Text>
          <TouchableOpacity
            style={styles.directoryButton}
            onPress={() => navigation.navigate('Browser', { url: 'https://trustassembly.org/orgs' })}
          >
            <Text style={styles.directoryText}>Browse Assembly Directory</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {renderSection('Joined Assemblies', joined)}
          {renderSection('Followed Assemblies', followed)}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.vellum },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#DCD8D0', backgroundColor: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  signedInText: { fontSize: 10, color: '#7A7570', marginTop: 2 },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 8, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#7A7570', padding: 12, paddingBottom: 4 },
  item: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0EDE6', backgroundColor: '#fff', alignItems: 'center' },
  itemImage: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: COLORS.navy, marginBottom: 2 },
  itemDesc: { fontSize: 11, color: '#7A7570', marginBottom: 4 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemMembers: { fontSize: 10, color: '#7A7570' },
  memberBadge: { fontSize: 9, color: COLORS.green, fontWeight: '700' },
  followingBadge: { fontSize: 9, color: COLORS.gold, fontWeight: '700' },
  unfollowButton: { backgroundColor: COLORS.navy, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 8 },
  unfollowText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  trustScore: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  trustText: { fontSize: 11, fontWeight: '700', color: COLORS.gold },
  loadingText: { marginTop: 12, fontSize: 13, color: COLORS.navy },
  emptyText: { fontSize: 15, color: '#7A7570', textAlign: 'center', marginBottom: 8 },
  hint: { fontSize: 12, color: '#7A7570', textAlign: 'center', paddingHorizontal: 28, lineHeight: 18 },
  errorTitle: { fontSize: 16, color: COLORS.red, fontWeight: '700', marginBottom: 8 },
  errorText: { fontSize: 12, color: '#7A7570', textAlign: 'center', marginBottom: 16, paddingHorizontal: 28 },
  signInButton: { backgroundColor: COLORS.navy, borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 },
  signInText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  directoryButton: { marginTop: 16, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10 },
  directoryText: { color: COLORS.navy, fontSize: 13, fontWeight: '700' },
});
