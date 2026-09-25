/** Trust Assembly in-app browser and native/WebView bridge. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { COLORS } from '../utils/constants';
import WebViewToolbar from '../components/WebViewToolbar';
import { getContentScript } from '../utils/contentScriptUtils';
import { INJECTED_CSS } from '../utils/injectedCss';
import { getCorrections, getPublicOverlayResource, getUserAssemblies } from '../api/trustAssemblyApi';
import { useAuth } from '../storage/authContext';
import {
  cacheCorrections,
  getCachedCorrections,
  getSettings,
  isSiteMuted,
  setSiteMuted,
} from '../storage/settingsStore';
import {
  correctionCacheKey,
  correctionUrlFromBridge,
  buildOverlayFetchRequest,
  DEFAULT_BROWSER_URL,
  extractSharedUrl,
  getDomain,
  normalizeBrowserUrl,
} from '../utils/urlUtils';
import type { CorrectionsResponse, TASettings } from '../types/trustAssembly';

interface BridgeMessage {
  type: string;
  requestId?: string;
  url?: string;
  count?: number;
  signalType?: string;
}

function javaScriptLiteral(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'null';
  return serialized
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default function BrowserScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const inFlightFetches = useRef(new Map<string, Promise<CorrectionsResponse>>());
  const assembliesRequestRef = useRef<{
    userId: string;
    request: ReturnType<typeof getUserAssemblies>;
  } | null>(null);
  const currentUrlRef = useRef(DEFAULT_BROWSER_URL);
  const pageGenerationRef = useRef(0);
  const initialLinkHandled = useRef(false);
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_BROWSER_URL);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_BROWSER_URL);
  const [currentTitle, setCurrentTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [correctionCount, setCorrectionCount] = useState<number | undefined>();
  const [settings, setSettings] = useState<TASettings>({ showBadge: true, showTranslations: true });
  const [isMuted, setIsMuted] = useState(false);

  const dispatchToPage = useCallback((message: unknown) => {
    const payload = javaScriptLiteral(message);
    webViewRef.current?.injectJavaScript(`
      (function () {
        var message = ${payload};
        if (typeof window.__TA_MOBILE_DISPATCH__ === 'function') {
          window.__TA_MOBILE_DISPATCH__(message);
          return;
        }
        var data = JSON.stringify(message);
        try { window.dispatchEvent(new MessageEvent('message', { data: data })); } catch (_) {}
        try {
          var event = document.createEvent('MessageEvent');
          event.initMessageEvent('message', true, true, data, '', '', null);
          document.dispatchEvent(event);
        } catch (_) {}
      })();
      true;
    `);
  }, []);

  const sendPreferencesToPage = useCallback(async (url: string, nextSettings?: TASettings) => {
    const resolvedSettings = nextSettings || await getSettings();
    const domain = getDomain(url);
    const muted = domain ? await isSiteMuted(domain) : false;
    setSettings(resolvedSettings);
    setIsMuted(muted);

    dispatchToPage({ type: 'TA_SETTINGS_CHANGED', settings: resolvedSettings });
    dispatchToPage({ type: 'TA_SITE_MUTE_CHANGED', domain, muted });
    // Compatibility with the initial mobile content-script port.
    dispatchToPage({ type: 'TA_SETTINGS_UPDATE', settings: resolvedSettings });
    dispatchToPage({ type: 'TA_MUTE_SITE', domain, muted });
  }, [dispatchToPage]);

  const syncAssembliesToPage = useCallback(async () => {
    if (!user) {
      assembliesRequestRef.current = null;
      dispatchToPage({
        type: 'TA_STORAGE_SYNC',
        values: { 'ta-assemblies': JSON.stringify({ joined: [], followed: [] }) },
      });
      return;
    }

    if (assembliesRequestRef.current?.userId !== user.id) {
      let request: ReturnType<typeof getUserAssemblies>;
      request = getUserAssemblies().finally(() => {
        if (assembliesRequestRef.current?.request === request) {
          assembliesRequestRef.current = null;
        }
      });
      assembliesRequestRef.current = {
        userId: user.id,
        request,
      };
    }
    const assemblies = await assembliesRequestRef.current.request;
    dispatchToPage({
      type: 'TA_STORAGE_SYNC',
      values: { 'ta-assemblies': JSON.stringify(assemblies) },
    });
  }, [dispatchToPage, user]);

  const fetchCorrectionData = useCallback((url: string): Promise<CorrectionsResponse> => {
    const key = correctionCacheKey(url);
    const existing = inFlightFetches.current.get(key);
    if (existing) return existing;

    const request = (async () => {
      try {
        // getCorrections deliberately uses the unauthenticated public endpoint.
        const fresh = await getCorrections(url);
        await cacheCorrections(url, fresh);
        return fresh;
      } catch (error) {
        const cached = await getCachedCorrections(url);
        if (cached) return cached;
        throw error;
      } finally {
        inFlightFetches.current.delete(key);
      }
    })();

    inFlightFetches.current.set(key, request);
    return request;
  }, []);

  const handleLegacyFetchRequest = useCallback(async (message: BridgeMessage) => {
    const articleUrl = correctionUrlFromBridge(message.url || '');
    if (!articleUrl) {
      if (message.requestId) {
        dispatchToPage({
          type: 'TA_FETCH_RESULT',
          requestId: message.requestId,
          response: { ok: false, error: 'Invalid correction URL' },
        });
      }
      return;
    }

    try {
      const data = await fetchCorrectionData(articleUrl);
      setCorrectionCount(data.corrections.length + data.affirmations.length);

      if (message.requestId) {
        dispatchToPage({
          type: 'TA_FETCH_RESULT',
          requestId: message.requestId,
          response: { ok: true, data },
        });
      } else {
        dispatchToPage({ type: 'TA_INJECT_DATA', url: articleUrl, settings, data });
      }
    } catch (error) {
      if (message.requestId) {
        dispatchToPage({
          type: 'TA_FETCH_RESULT',
          requestId: message.requestId,
          response: {
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to load corrections',
          },
        });
      }
    }
  }, [dispatchToPage, fetchCorrectionData, settings]);

  const handleCanonicalFetchRequest = useCallback(async (
    message: BridgeMessage,
    generation: number,
    topLevelUrl: string,
  ) => {
    if (!message.requestId || !message.url) return;
    const request = buildOverlayFetchRequest(message.url, topLevelUrl);
    if (!request) {
      dispatchToPage({
        type: 'TA_FETCH_RESULT',
        requestId: message.requestId,
        response: { ok: false, error: 'Blocked public API request' },
      });
      return;
    }

    try {
      let data: unknown;
      let nextCount: number | undefined;
      if (request.kind === 'corrections') {
        const corrections = await fetchCorrectionData(request.articleUrl);
        nextCount = corrections.corrections.length + corrections.affirmations.length;
        data = corrections;
      } else {
        data = await getPublicOverlayResource(request.path);
      }

      // Do not deliver a response into a different document after navigation.
      if (
        generation !== pageGenerationRef.current ||
        correctionCacheKey(topLevelUrl) !== correctionCacheKey(currentUrlRef.current)
      ) return;

      if (nextCount !== undefined) setCorrectionCount(nextCount);
      dispatchToPage({
        type: 'TA_FETCH_RESULT',
        requestId: message.requestId,
        response: { ok: true, data },
      });
    } catch (error) {
      if (
        generation !== pageGenerationRef.current ||
        correctionCacheKey(topLevelUrl) !== correctionCacheKey(currentUrlRef.current)
      ) return;
      dispatchToPage({
        type: 'TA_FETCH_RESULT',
        requestId: message.requestId,
        response: {
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to load public Trust Assembly data',
        },
      });
    }
  }, [dispatchToPage, fetchCorrectionData]);

  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    let message: BridgeMessage;
    try {
      const parsed: unknown = JSON.parse(event.nativeEvent.data);
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as BridgeMessage).type !== 'string') return;
      message = parsed as BridgeMessage;
    } catch {
      return;
    }

    const senderUrl = normalizeBrowserUrl(event.nativeEvent.url || '');
    const topLevelUrl = currentUrlRef.current;
    if (!senderUrl || correctionCacheKey(senderUrl) !== correctionCacheKey(topLevelUrl)) return;
    const generation = pageGenerationRef.current;

    switch (message.type) {
      case 'TA_FETCH':
        if (typeof message.requestId !== 'string' || message.requestId.length > 128) return;
        await handleCanonicalFetchRequest(message, generation, topLevelUrl);
        break;
      case 'TA_FETCH_CORRECTIONS':
        await handleLegacyFetchRequest({ ...message, url: topLevelUrl });
        break;
      case 'TA_COUNT':
      case 'TA_CORRECTIONS_PROCESSED':
        if (typeof message.count === 'number' && Number.isFinite(message.count)) {
          setCorrectionCount(Math.max(0, Math.floor(message.count)));
        }
        break;
      case 'TA_READY':
        await Promise.all([
          sendPreferencesToPage(currentUrl),
          syncAssembliesToPage(),
        ]);
        break;
      case 'TA_BADGE_CLICK':
        navigation.navigate('Corrections', { url: currentUrl });
        break;
      default:
        // The page is untrusted. Ignore unknown and state-changing commands.
        break;
    }
  }, [currentUrl, handleCanonicalFetchRequest, handleLegacyFetchRequest, navigation, sendPreferencesToPage, syncAssembliesToPage]);

  const navigateTo = useCallback((input: string) => {
    const nextUrl = normalizeBrowserUrl(input);
    if (!nextUrl) {
      Alert.alert('Invalid address', 'Enter a valid http:// or https:// address.');
      return;
    }
    setCorrectionCount(undefined);
    currentUrlRef.current = nextUrl;
    pageGenerationRef.current += 1;
    setCurrentUrl(nextUrl);
    setSourceUrl(nextUrl);
  }, []);

  useEffect(() => {
    const handleIncomingUrl = ({ url }: { url: string }) => {
      const target = extractSharedUrl(url);
      if (target) navigateTo(target);
    };

    const subscription = Linking.addEventListener('url', handleIncomingUrl);
    if (!initialLinkHandled.current) {
      initialLinkHandled.current = true;
      Linking.getInitialURL().then((url) => {
        const target = url ? extractSharedUrl(url) : null;
        if (target) navigateTo(target);
      }).catch(() => undefined);
    }
    return () => subscription.remove();
  }, [navigateTo]);

  useEffect(() => {
    const requestedUrl = route?.params?.url;
    if (typeof requestedUrl === 'string' && requestedUrl !== currentUrlRef.current) {
      navigateTo(requestedUrl);
      navigation.setParams?.({ url: undefined });
    }
  }, [navigateTo, navigation, route?.params?.url]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      sendPreferencesToPage(currentUrl).catch(() => undefined);
      syncAssembliesToPage().catch(() => undefined);
    });
    return unsubscribe;
  }, [currentUrl, navigation, sendPreferencesToPage, syncAssembliesToPage]);

  const handleNavigation = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    setCurrentTitle(state.title || '');
    if (state.url && state.url !== currentUrlRef.current) {
      pageGenerationRef.current += 1;
      currentUrlRef.current = state.url;
      setCurrentUrl(state.url);
      setCorrectionCount(undefined);
      sendPreferencesToPage(state.url).catch(() => undefined);
    }
  };

  const toggleMute = async () => {
    const domain = getDomain(currentUrl);
    if (!domain) return;
    const nextMuted = !isMuted;
    await setSiteMuted(domain, nextMuted);
    setIsMuted(nextMuted);
    dispatchToPage({ type: 'TA_SITE_MUTE_CHANGED', domain, muted: nextMuted });
    dispatchToPage({ type: 'TA_MUTE_SITE', domain, muted: nextMuted });
  };

  const injectedJavaScript = useMemo(() => {
    const contentScript = getContentScript();
    return `
      (function () {
        if (!document.getElementById('ta-ext-injected-css')) {
          var style = document.createElement('style');
          style.id = 'ta-ext-injected-css';
          style.textContent = ${javaScriptLiteral(INJECTED_CSS)};
          (document.head || document.documentElement).appendChild(style);
        }
        ${contentScript}
      })();
      true;
    `;
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <WebViewToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        correctionCount={settings.showBadge ? correctionCount : undefined}
        currentUrl={currentUrl}
        onBack={() => webViewRef.current?.goBack()}
        onBadgePress={() => navigation.navigate('Corrections', { url: currentUrl })}
        onForward={() => webViewRef.current?.goForward()}
        onNavigate={navigateTo}
        onRefresh={() => webViewRef.current?.reload()}
        onSubmitPage={() => navigation.navigate('Submit', { url: currentUrl, title: currentTitle })}
      />
      <View style={styles.siteControls}>
        <Text numberOfLines={1} style={styles.domainText}>{getDomain(currentUrl) || 'No page loaded'}</Text>
        <TouchableOpacity onPress={toggleMute} style={styles.muteButton}>
          <Text style={[styles.muteText, isMuted && styles.muteTextActive]}>
            {isMuted ? 'Unmute corrections' : 'Mute corrections'}
          </Text>
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUrl }}
        onMessage={handleWebViewMessage}
        onLoadStart={(event) => {
          const url = event.nativeEvent.url;
          pageGenerationRef.current += 1;
          currentUrlRef.current = url;
          setCurrentUrl(url);
          setCorrectionCount(undefined);
        }}
        onNavigationStateChange={handleNavigation}
        onLoadEnd={() => sendPreferencesToPage(currentUrl).catch(() => undefined)}
        onShouldStartLoadWithRequest={(request) => {
          const parsed = normalizeBrowserUrl(request.url);
          if (parsed) return true;
          if (/^(mailto|tel):/i.test(request.url)) {
            Linking.openURL(request.url).catch(() => undefined);
          }
          return false;
        }}
        injectedJavaScript={injectedJavaScript}
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        style={styles.webView}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.vellum },
  siteControls: {
    minHeight: 30,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCD8D0',
    backgroundColor: COLORS.vellum,
  },
  domainText: { flex: 1, color: '#7A7570', fontSize: 10 },
  muteButton: { paddingHorizontal: 6, paddingVertical: 5 },
  muteText: { fontSize: 10, color: COLORS.navy, fontWeight: '600' },
  muteTextActive: { color: COLORS.red },
  webView: { flex: 1 },
});
