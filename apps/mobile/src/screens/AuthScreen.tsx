/**
 * Trust Assembly — Auth Screen
 * 
 * Login/logout screen (port of popup.html login section).
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, Linking } from 'react-native';
import { COLORS } from '../utils/constants';
import { useAuth } from '../storage/authContext';

export default function AuthScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }
    setIsSubmitting(true);
    const success = await login(username, password);
    setIsSubmitting(false);
    if (!success) {
      Alert.alert('Login Failed', 'Invalid credentials. Please try again.');
    } else if (navigation?.canGoBack?.()) {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Trust Assembly</Text>
        <Text style={styles.subtitle}>Sign in to verify news with the community</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Username or Email"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          <Text style={styles.loginButtonText}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>
          By signing in, you agree to verify information with the community.
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://trustassembly.org/register')}>
          <Text style={styles.registerLink}>Create an account on trustassembly.org</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vellum,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#7A7570',
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DCD8D0',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
    color: COLORS.navy,
  },
  loginButton: {
    backgroundColor: COLORS.navy,
    borderRadius: 6,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  hint: {
    fontSize: 11,
    color: '#7A7570',
    textAlign: 'center',
  },
  registerLink: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
});
