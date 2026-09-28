/**
 * Trust Assembly — Mobile App
 * Android + iOS apps that replicate the browser extension functionality.
 * 
 * Features:
 * - In-app browser (WebView) with injected content script
 * - Inline headline corrections (red strikethrough)
 * - Inline affirmations (green checkmark)
 * - Inline translation annotations (dotted underline + hover tooltips)
 * - Floating badge with correction count
 * - Side panel with full correction details
 * - Auth login/logout
 * - Settings (badge toggle, translations toggle)
 * - Site mute toggle
 * - Submit corrections/affirmations
 * - Assembly following
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/storage/authContext';
import AuthScreen from './src/screens/AuthScreen';
import CorrectionsScreen from './src/screens/CorrectionsScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from './src/utils/constants';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Corrections: { url: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Corrections" component={CorrectionsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={{ flex: 1, backgroundColor: COLORS.vellum }}
      >
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
