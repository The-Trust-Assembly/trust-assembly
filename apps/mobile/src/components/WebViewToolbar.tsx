/**
 * Trust Assembly — WebView Toolbar
 * 
 * A navigation toolbar that sits above the WebView, mirroring the
 * browser extension experience. Provides back/forward/refresh/reload
 * and a badge for corrections count.
 */

import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';

interface ToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  currentUrl: string;
  onNavigate: (url: string) => void;
  onSubmitPage: () => void;
  correctionCount?: number;
  onBadgePress?: () => void;
}

export default function WebViewToolbar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onRefresh,
  currentUrl,
  onNavigate,
  onSubmitPage,
  correctionCount,
  onBadgePress,
}: ToolbarProps) {
  const [address, setAddress] = useState(currentUrl);

  useEffect(() => {
    setAddress(currentUrl);
  }, [currentUrl]);

  const submitAddress = () => onNavigate(address);

  return (
    <View style={styles.container}>
      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={[styles.button, !canGoBack && styles.buttonDisabled]}
          onPress={onBack}
          disabled={!canGoBack}
        >
          <Ionicons name="arrow-back" size={20} color={canGoBack ? COLORS.navy : '#ccc'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !canGoForward && styles.buttonDisabled]}
          onPress={onForward}
          disabled={!canGoForward}
        >
          <Ionicons name="arrow-forward" size={20} color={canGoForward ? COLORS.navy : '#ccc'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onRefresh} accessibilityLabel="Reload page">
          <Ionicons name="reload" size={20} color={COLORS.navy} />
        </TouchableOpacity>
        <TextInput
          accessibilityLabel="Web address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setAddress}
          onSubmitEditing={submitAddress}
          placeholder="Enter a web address"
          returnKeyType="go"
          selectTextOnFocus
          style={styles.addressInput}
          value={address}
        />
        {correctionCount !== undefined && correctionCount > 0 && onBadgePress && (
          <TouchableOpacity style={styles.badgeButton} onPress={onBadgePress} accessibilityLabel={`${correctionCount} Trust Assembly reviews`}>
            <View style={[styles.badge, { backgroundColor: COLORS.gold }]}>
              <Text style={styles.badgeText}>{correctionCount > 99 ? '99+' : correctionCount}</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.submitButton} onPress={onSubmitPage} accessibilityLabel="Use this page in the submission form">
          <Ionicons name="create-outline" size={18} color={COLORS.navy} />
          <Text style={styles.submitButtonText}>Use Page</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.vellum,
    borderBottomWidth: 1,
    borderBottomColor: '#DCD8D0',
    minHeight: 52,
    paddingHorizontal: 8,
  },
  navigationRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCD8D0',
    backgroundColor: '#fff',
    color: COLORS.navy,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  submitButton: {
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F0EDE6',
  },
  submitButtonText: {
    color: COLORS.navy,
    fontSize: 9,
    fontWeight: '700',
  },
  badgeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
        justifyContent: 'center',
    marginRight: 4,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
