/**
 * Trust Assembly — Corrections Screen
 * Shows detailed corrections, affirmations, and translations for the current page.
 * Mirrors the "This Page" tab in the extension popup.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../utils/constants';
import { getCorrections } from '../api/trustAssemblyApi';
import type { CorrectionsResponse, Correction, Affirmation, Translation } from '../types/trustAssembly';

interface CorrectionsScreenProps {
  route: { params: { url: string } };
  navigation: any;
}

export default function CorrectionsScreen({ route, navigation }: CorrectionsScreenProps) {
  const { url } = route.params;
  const [data, setData] = useState<CorrectionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadData(); }, [url]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await getCorrections(url);
      setData(result);
    } catch (e) {
      console.warn('Error loading corrections:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={styles.loadingText}>Loading corrections...</Text>
      </View>
    );
  }

  const total = (data?.corrections || []).length + (data?.affirmations || []).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>This Page</Text>
        <Text style={styles.headerUrl}>{url || 'No URL'}</Text>
      </View>

      {total === 0 && (data?.translations || []).length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No corrections or affirmations found for this page.</Text>
        </View>
      ) : (
        <FlatList
          data={[...(data?.corrections || []), ...(data?.affirmations || [])]}
          keyExtractor={(item, i) => item.id || `item-${i}`}
          renderItem={({ item }: { item: Correction | Affirmation }) => {
            if (item.submissionType === 'affirmation') return renderAffirmation({ item: item as Affirmation });
            return renderCorrection({ item: item as Correction });
          }}
          ListHeaderComponent={() => (
            <>
              {(data?.translations || []).length > 0 && (
                <View>
                  <Text style={styles.sectionHeader}>Translations</Text>
                  <FlatList data={data!.translations} keyExtractor={(item, i) => item.id || `trans-${i}`} renderItem={renderTranslation} scrollEnabled={false} />
                </View>
              )}
              {(data?.corrections || []).length > 0 && <Text style={styles.sectionHeader}>Corrections ({(data?.corrections || []).length})</Text>}
              {(data?.affirmations || []).length > 0 && <Text style={styles.sectionHeader}>Affirmations ({(data?.affirmations || []).length})</Text>}
            </>
          )}
          onRefresh={loadData}
          refreshing={isLoading}
        />
            )}
    </View>
  );
}

function renderCorrection({ item }: { item: Correction }) {
  return (
    <View style={[styles.card, styles.correctionCard]}>
      <View style={styles.cardMeta}>
        <Text style={styles.correctionLabel}>🔴 Correction</Text>
        <Text style={styles.orgName}>{item.orgName || 'Assembly'}</Text>
        <Text style={styles.status}>● {item.status || 'approved'}</Text>
      </View>
      <Text style={styles.replacement}>{item.replacement}</Text>
      <Text style={styles.original}>{item.originalHeadline}</Text>
      {item.reasoning ? <Text style={styles.reasoning}>{item.reasoning}</Text> : null}
      <View style={styles.credit}>
        <Text style={styles.creditText}>by <Text style={styles.creditName}>{item.submittedBy || 'Anonymous'}</Text> · Trust: {item.trustScore || 0}</Text>
      </View>
    </View>
  );
}

function renderAffirmation({ item }: { item: Affirmation }) {
  return (
    <View style={[styles.card, styles.affirmationCard]}>
      <View style={styles.cardMeta}>
        <Text style={styles.affirmationLabel}>🟢 Affirmation</Text>
        <Text style={styles.orgName}>{item.orgName || 'Assembly'}</Text>
      </View>
      <Text style={styles.replacement}>{item.replacement}</Text>
      <Text style={styles.original}>{item.originalHeadline}</Text>
      {item.reasoning ? <Text style={styles.reasoning}>{item.reasoning}</Text> : null}
    </View>
  );
}

function renderTranslation({ item }: { item: Translation }) {
  return (
    <View style={[styles.card, styles.translationCard]}>
      <View style={styles.cardMeta}>
        <Text style={styles.translationLabel}>🔄 {item.type || 'Translation'}</Text>
        <Text style={styles.orgName}>{item.orgName || 'Assembly'}</Text>
      </View>
      <Text style={styles.original}>{item.original}</Text>
      <Text style={styles.replacement}>→ {item.translated}</Text>
      {item.evidence ? <Text style={styles.reasoning}>{item.evidence}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.vellum },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#DCD8D0', backgroundColor: '#fff' },
  backButton: { marginBottom: 8 },
  backText: { fontSize: 16, color: COLORS.navy, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy, marginBottom: 2 },
  headerUrl: { fontSize: 11, color: '#7A7570' },
  sectionHeader: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.navy, paddingHorizontal: 16, paddingVertical: 8 },
  card: { marginHorizontal: 16, marginVertical: 6, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCD8D0' },
  correctionCard: { borderLeftWidth: 3, borderLeftColor: COLORS.red },
  affirmationCard: { borderLeftWidth: 3, borderLeftColor: COLORS.green },
  translationCard: { borderLeftWidth: 3, borderLeftColor: COLORS.orange },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderBottomWidth: 1, borderBottomColor: '#F0EDE6' },
  correctionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.red },
  affirmationLabel: { fontSize: 11, fontWeight: '700', color: COLORS.green },
  translationLabel: { fontSize: 11, fontWeight: '700', color: COLORS.orange },
  orgName: { fontSize: 10, color: '#7A7570' },
  status: { fontSize: 10, color: '#7A7570', marginLeft: 'auto' },
  replacement: { fontSize: 14, fontWeight: '600', color: COLORS.navy, padding: 12, paddingBottom: 4 },
  original: { fontSize: 13, color: '#7A7570', paddingHorizontal: 12, paddingBottom: 4 },
  reasoning: { fontSize: 12, color: '#555', fontStyle: 'italic', padding: 12, paddingTop: 0 },
  credit: { padding: 8, borderTopWidth: 1, borderTopColor: '#F0EDE6' },
  creditText: { fontSize: 10, color: '#7A7570' },
  creditName: { fontWeight: '600', color: COLORS.navy },
  loadingText: { marginTop: 12, fontSize: 13, color: COLORS.navy },
  emptyText: { fontSize: 15, color: '#7A7570', textAlign: 'center', marginBottom: 8 },
});


