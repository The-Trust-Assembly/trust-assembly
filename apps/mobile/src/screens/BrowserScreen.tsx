/** Trust Assembly in-app browser and native/WebView bridge. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
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
import { useBrowserPage } from '../storage/browserPageContext';

interface BridgeMessage {
  type: string;
  requestId?: string;
  url?: string;
  count?: number;
  signalType?: string;
  title?: string;
  authors?: unknown;
  contentType?: string;
}

const PAGE_METADATA_SCRIPT = `
  (function () {
    function textFrom(selector, attribute) {
      var element = document.querySelector(selector);
      if (!element) return '';
      return String(attribute ? element.getAttribute(attribute) || '' : element.textContent || '').trim();
    }
    var title =
      textFrom('meta[property="og:title"]', 'content') ||
      textFrom('meta[name="twitter:title"]', 'content') ||
      textFrom('article h1') ||
      textFrom('main h1') ||
      textFrom('h1') ||
      String(document.title || '').trim();
    var authors = [];
    function addAuthor(value) {
      var name = String(value || '').replace(/^by\\s+/i, '').trim();
      if (name && name.length <= 100 && authors.indexOf(name) < 0) authors.push(name);
    }
    document.querySelectorAll('meta[name="author"], meta[property="article:author"], meta[name="byl"]').forEach(function (element) {
      addAuthor(element.getAttribute('content'));
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (element) {
      try {
        var parsed = JSON.parse(element.textContent || 'null');
        var queue = Array.isArray(parsed) ? parsed.slice() : [parsed];
        while (queue.length) {
          var item = queue.shift();
          if (!item || typeof item !== 'object') continue;
          if (Array.isArray(item['@graph'])) queue.push.apply(queue, item['@graph']);
          var author = item.author || item.creator;
          (Array.isArray(author) ? author : [author]).forEach(function (value) {
            if (typeof value === 'string') addAuthor(value);
            else if (value && value.name) addAuthor(value.name);
          });
        }
      } catch (_) {}
    });
    var host = String(location.hostname || '').toLowerCase();
    var contentType = /youtube|vimeo/.test(host) ? 'video'
      : /twitter|x\\.com|tiktok|facebook|reddit|linkedin/.test(host) ? 'shortform'
      : /podcast|spotify|soundcloud/.test(host) ? 'audio'
      : 'article';
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'TA_PAGE_METADATA',
      url: location.href,
      title: title.slice(0, 1000),
      authors: authors.slice(0, 10),
      contentType: contentType
    }));
  })();
  true;
`;

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
  const { updatePage } = useBrowserPage();
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
  const [currentAuthors, setCurrentAuthors] = useState<string[]>([]);
  const [currentContentType, setCurrentContentType] = useState('article');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [correctionCount, setCorrectionCount] = useState<number | undefined>();
  const [settings, setSettings] = useState<TASettings>({ showBadge: true, showTranslations: true });
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const url = normalizeBrowserUrl(currentUrl);
    if (url) updatePage({
      url,
      title: currentTitle,
      authors: currentAuthors,
      contentType: currentContentType,
    });
  }, [currentAuthors, currentContentType, currentTitle, currentUrl, updatePage]);

  const requestPageMetadata = useCallback(() => {
    webViewRef.current?.injectJavaScript(PAGE_METADATA_SCRIPT);
  }, []);

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
      case 'TA_PAGE_METADATA': {
        const metadataUrl = normalizeBrowserUrl(message.url || '');
        if (!metadataUrl || correctionCacheKey(metadataUrl) !== correctionCacheKey(topLevelUrl)) return;
        if (typeof message.title === 'string') setCurrentTitle(message.title.trim().slice(0, 1000));
        if (Array.isArray(message.authors)) {
          setCurrentAuthors(message.authors
            .filter((author): author is string => typeof author === 'string')
            .map((author) => author.trim())
            .filter(Boolean)
            .slice(0, 10));
        }
        if (typeof message.contentType === 'string' && ['article', 'video', 'shortform', 'audio', 'product'].includes(message.contentType)) {
          setCurrentContentType(message.contentType);
        }
        break;
      }
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
    setCurrentTitle('');
    setCurrentAuthors([]);
    setCurrentContentType('article');
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
    <View style={styles.container}>
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
          setCurrentTitle('');
          setCurrentAuthors([]);
          setCurrentContentType('article');
          setCorrectionCount(undefined);
        }}
        onNavigationStateChange={handleNavigation}
        onLoadEnd={() => {
          sendPreferencesToPage(currentUrl).catch(() => undefined);
          requestPageMetadata();
        }}
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
    </View>
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
