/**
 * Trust Assembly — Bottom Tab Navigator
 * 
 * Mirrors the browser extension popup tabs:
 * - This Page (corrections for current URL)
 * - Submit (new correction/affirmation form)
 * - Assemblies (following / joining)
 * - Design (test mode — mirrors popup Design tab)
 * - Settings (badge toggle, translations toggle, site mute)
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BrowserScreen from '../screens/BrowserScreen';
import SubmitScreen from '../screens/SubmitScreen';
import AssembliesScreen from '../screens/AssembliesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { COLORS } from '../utils/constants';

export type TabParamList = {
  Browser: { url?: string } | undefined;
  Submit: { url?: string; title?: string } | undefined;
  Assemblies: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
          switch (route.name) {
            case 'Browser': iconName = 'globe'; break;
            case 'Submit': iconName = 'create'; break;
            case 'Assemblies': iconName = 'people'; break;
            case 'Settings': iconName = 'settings'; break;
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.navy,
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: COLORS.vellum,
          borderTopColor: '#DCD8D0',
          paddingBottom: 5,
          height: 60,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Browser" component={BrowserScreen} />
      <Tab.Screen name="Submit" component={SubmitScreen} />
      <Tab.Screen name="Assemblies" component={AssembliesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
