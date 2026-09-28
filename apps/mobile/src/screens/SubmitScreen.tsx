/**
 * Trust Assembly Mobile App — Submit Screen
 *
 * Form to submit corrections, affirmations, inline body edits,
 * and vault artifacts (standing corrections, arguments, beliefs,
 * translations). Ported from extensions/chrome/popup.js submit form.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, Linking, ActivityIndicator } from 'react-native';
import { COLORS } from '../utils/constants';
import { submitCorrection, submitVault, saveDraft, getDraft, getDrafts, getDraftByUrl, refreshUserAssemblies, deleteDraft } from '../api/trustAssemblyApi';
import { getFormState, saveFormState, clearFormState, FormState } from '../storage/settingsStore';
import { useAuth } from '../storage/authContext';
import type { Assembly, SubmissionDraft } from '../types/trustAssembly';
import { correctionCacheKey, normalizeBrowserUrl } from '../utils/urlUtils';
import { useBrowserPage } from '../storage/browserPageContext';

interface SubmitScreenProps {
  route?: { params?: { url?: string; title?: string } };
  navigation?: any;
}

// Platform-adaptive labels for the submit form
const FORM_LABELS: Record<string, { headline: string; replacement: string; author: string; url: string }> = {
  video: { headline: 'Video Title', replacement: 'Corrected Title', author: 'Channel / Creator', url: 'Video URL' },
  shortform: { headline: 'Original Post Text', replacement: 'Corrected Post', author: 'Account', url: 'Post URL' },
  audio: { headline: 'Episode Title', replacement: 'Corrected Title', author: 'Host / Speaker', url: 'Episode URL' },
  product: { headline: 'Product Name / Title', replacement: 'Corrected Claim', author: 'Brand / Seller', url: 'Product URL' },
  article: { headline: 'Original Headline', replacement: 'Corrected Headline', author: 'Author(s)', url: 'Article URL' },
};

const CONTENT_TYPE_OPTIONS = [
  { value: 'article', label: 'Article' },
  { value: 'video', label: 'Video' },
  { value: 'shortform', label: 'Short Post' },
  { value: 'audio', label: 'Audio' },
  { value: 'product', label: 'Product' },
];

const VAULT_SECTIONS = [
  { key: 'correction' as const, label: 'Standing Corrections', color: COLORS.red, desc: 'Factual assertions with supporting evidence.' },
  { key: 'argument' as const, label: 'Arguments', color: COLORS.orange, desc: 'Logical arguments or refutations.' },
  { key: 'belief' as const, label: 'Foundational Beliefs', color: COLORS.purple, desc: 'Core axioms or starting premises, not claims of fact.' },
  { key: 'translation' as const, label: 'Translations', color: COLORS.teal, desc: 'Plain-language replacements for jargon, spin, or propaganda.' },
];

const TRANSLATION_TYPES = [
  { value: 'clarity', label: 'Clarity' },
  { value: 'anti-propaganda', label: 'Anti-Propaganda' },
  { value: 'euphemism', label: 'Euphemism' },
  { value: 'satirical', label: 'Satirical' },
];

export default function SubmitScreen({ route, navigation }: SubmitScreenProps) {
  const routeUrl = route?.params?.url || '';
  const routeTitle = route?.params?.title || '';
  const { page: browserPage } = useBrowserPage();
  const activePageUrl = normalizeBrowserUrl(browserPage.url) || normalizeBrowserUrl(routeUrl) || '';
  const activePageTitle = browserPage.title || routeTitle;
  const activePageAuthors = browserPage.authors;
  const activeContentType = browserPage.contentType;
  const [sourceUrl, setSourceUrl] = useState(activePageUrl);
  const [submitType, setSubmitType] = useState<'correction' | 'affirmation'>('correction');
  const [headline, setHeadline] = useState('');
  const [replacement, setReplacement] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [userAssemblies, setUserAssemblies] = useState<{ joined: Assembly[]; followed: Assembly[] }>({ joined: [], followed: [] });
  const [assembliesLoading, setAssembliesLoading] = useState(false);
  const [assembliesError, setAssembliesError] = useState<string | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [inlineEdits, setInlineEdits] = useState<Array<{ id: string; original: string; replacement: string; reasoning?: string }>>([]);
  const [vaultItems, setVaultItems] = useState({
    correction: Array<{ id: string; assertion: string; evidence: string }>(),
    argument: Array<{ id: string; content: string }>(),
    belief: Array<{ id: string; content: string }>(),
    translation: Array<{ id: string; original: string; translated: string; translationType: string }>(),
  });
  const [vaultSectionsOpen, setVaultSectionsOpen] = useState<Record<string, boolean>>({});
  const [vaultBodyOpen, setVaultBodyOpen] = useState(false);
  const [inlineEditsOpen, setInlineEditsOpen] = useState(false);
  const [drafts, setDrafts] = useState<SubmissionDraft<FormState>[]>([]);
  const [pendingUrlDraft, setPendingUrlDraft] = useState<SubmissionDraft<FormState> | null>(null);
  const [contentType, setContentType] = useState('article');
  const lastAutoPageKey = useRef('');
  const lastAutoTitle = useRef('');
  const { user } = useAuth();

  const applyFormState = useCallback((draftData: Partial<FormState>) => {
    setSubmitType(draftData.submitType || 'correction');
    setHeadline(draftData.headline || '');
    setReplacement(draftData.replacement || '');
    setReasoning(draftData.reasoning || '');
    setSelectedAuthors(draftData.selectedAuthors || []);
    setSelectedOrgIds(draftData.selectedOrgIds || []);
    setInlineEdits(draftData.inlineEdits || []);
    setVaultItems({
      correction: draftData.vaultItems?.correction || [],
      argument: draftData.vaultItems?.argument || [],
      belief: draftData.vaultItems?.belief || [],
      translation: draftData.vaultItems?.translation || [],
    });
    setVaultSectionsOpen(draftData.vaultSectionsOpen || {});
    setVaultBodyOpen(draftData.vaultBodyOpen || false);
    setInlineEditsOpen(draftData.inlineEditsOpen || false);
    if (draftData.contentType) setContentType(draftData.contentType);
    if (draftData.url) setSourceUrl(draftData.url);
  }, []);

  const loadAssemblies = useCallback(async () => {
    if (!user) {
      setUserAssemblies({ joined: [], followed: [] });
      setAssembliesLoading(false);
      setAssembliesError(null);
      return;
    }

    setAssembliesLoading(true);
    setAssembliesError(null);
    try {
      setUserAssemblies(await refreshUserAssemblies());
    } catch (error) {
      setAssembliesError(error instanceof Error ? error.message : 'Could not load your assemblies.');
    } finally {
      setAssembliesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAssemblies();
  }, [loadAssemblies]);

  // ── Load drafts and form state on mount ──
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [draftList, saved] = await Promise.all([getDrafts(), getFormState()]);
        setDrafts(draftList as SubmissionDraft<FormState>[]);

        if (activePageUrl) {
          const pageKey = correctionCacheKey(activePageUrl);
          const pageChanged = pageKey !== lastAutoPageKey.current;
          setSourceUrl(activePageUrl);
          if (pageChanged) {
            setHeadline(activePageTitle);
            setSelectedAuthors(activePageAuthors);
            setPendingUrlDraft(null);
          } else if (activePageTitle) {
            setHeadline((current) => (!current || current === lastAutoTitle.current) ? activePageTitle : current);
          }
          if (!pageChanged && activePageAuthors.length > 0) {
            setSelectedAuthors((current) => current.length > 0 ? current : activePageAuthors);
          }
          if (activeContentType) setContentType(activeContentType);
          lastAutoPageKey.current = pageKey;
          lastAutoTitle.current = activePageTitle;
          const urlDraft = await getDraftByUrl(activePageUrl) as SubmissionDraft<FormState> | null;
          if (urlDraft) setPendingUrlDraft(urlDraft);
        }

        const savedUrl = saved.url ? normalizeBrowserUrl(saved.url) : null;
        if (!activePageUrl || (savedUrl && correctionCacheKey(savedUrl) === correctionCacheKey(activePageUrl))) {
          applyFormState(saved);
        }
      } catch (e) {
        console.warn('Error loading submit data:', e);
      }
    };
    loadData();
  }, [activeContentType, activePageAuthors, activePageTitle, activePageUrl, applyFormState, user]);

  // ── Auto-save form state (debounced) ──
  useEffect(() => {
    if (!autoSave || !user) return;
    const timer = setTimeout(() => {
      if (!headline && !replacement && !reasoning && selectedOrgIds.length === 0 && selectedAuthors.length === 0 && inlineEdits.length === 0) return;
      saveFormState({
        url: normalizeBrowserUrl(sourceUrl) || sourceUrl,
        contentType,
        submitType,
        headline,
        replacement,
        reasoning,
        selectedAuthors,
        selectedOrgIds,
        inlineEdits,
        vaultItems,
        vaultSectionsOpen: vaultSectionsOpen as { correction: boolean; argument: boolean; belief: boolean; translation: boolean },
        vaultBodyOpen,
        inlineEditsOpen,
      } as FormState);
    }, 1000);
    return () => clearTimeout(timer);
  }, [headline, replacement, reasoning, selectedOrgIds, selectedAuthors, inlineEdits, vaultItems, vaultSectionsOpen, vaultBodyOpen, inlineEditsOpen, autoSave, user, submitType, sourceUrl, contentType]);

  // ── Handlers ──
  const toggleSubmitType = (type: 'correction' | 'affirmation') => {
    setSubmitType(type);
  };

  const toggleOrg = (orgId: string) => {
    const idx = selectedOrgIds.indexOf(orgId);
    if (idx >= 0) {
      setSelectedOrgIds(selectedOrgIds.filter(id => id !== orgId));
    } else {
      setSelectedOrgIds([...selectedOrgIds, orgId]);
    }
  };

  const handleAuthorAdd = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && selectedAuthors.length < 10 && !selectedAuthors.includes(trimmed)) {
      setSelectedAuthors([...selectedAuthors, trimmed]);
    }
  };

  const removeAuthor = (name: string) => {
    setSelectedAuthors(selectedAuthors.filter(a => a !== name));
  };

  const addInlineEdit = () => {
    const newEdit = { id: Date.now().toString(), original: '', replacement: '', reasoning: '' };
    setInlineEdits([...inlineEdits, newEdit]);
    setInlineEditsOpen(true);
  };

  const removeInlineEdit = (id: string) => {
    setInlineEdits(inlineEdits.filter(e => e.id !== id));
  };

  const updateInlineEdit = (id: string, field: string, value: string) => {
    setInlineEdits(inlineEdits.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const toggleInlineEdits = () => {
    setInlineEditsOpen(!inlineEditsOpen);
  };

  const toggleVaultBody = () => {
    setVaultBodyOpen(!vaultBodyOpen);
  };

  const toggleVaultSection = (key: string) => {
    setVaultSectionsOpen({ ...vaultSectionsOpen, [key]: !vaultSectionsOpen[key] });
  };

  const addVaultItem = (type: 'correction' | 'argument' | 'belief' | 'translation') => {
    const defaults: Record<string, any> = {
      correction: { id: Date.now().toString(), assertion: '', evidence: '' },
      argument: { id: Date.now().toString(), content: '' },
      belief: { id: Date.now().toString(), content: '' },
      translation: { id: Date.now().toString(), original: '', translated: '', translationType: 'clarity' },
    };
    setVaultItems({ ...vaultItems, [type]: [...vaultItems[type], defaults[type]] });
  };

  const removeVaultItem = (type: string, index: number) => {
    const items = [...(vaultItems[type as keyof typeof vaultItems] as any[])];
    items.splice(index, 1);
    setVaultItems({ ...vaultItems, [type]: items });
  };

    const updateVaultItem = (type: string, index: number, field: string, value: string) => {
    const items = [...(vaultItems[type as keyof typeof vaultItems] as any[])];
    items[index] = { ...items[index], [field]: value };
    setVaultItems({ ...vaultItems, [type]: items });
  };

  // ── Submit Handler (ported from popup.js doSubmit) ──
  const handleSubmit = async () => {
    const normalizedUrl = normalizeBrowserUrl(sourceUrl);
    const selectedOrgs = selectedOrgIds;

    if (!normalizedUrl) {
      Alert.alert('Error', 'Enter a valid http:// or https:// source URL.');
      return;
    }
    if (selectedOrgs.length === 0) {
      Alert.alert('Error', 'Select at least one assembly.');
      return;
    }
    if (!headline || !reasoning) {
      Alert.alert('Error', 'Headline and reasoning are required.');
      return;
    }
    if (submitType === 'correction' && !replacement) {
      Alert.alert('Error', 'A corrected headline is required for corrections.');
      return;
    }

    setIsSubmitting(true);
    try {
      const evidence = [{ url: normalizedUrl, explanation: 'Source article under review' }];
      const validInlineEdits = inlineEdits
        .filter(e => e.original.trim() && e.replacement.trim())
        .map(e => ({
          original: e.original.trim(),
          replacement: e.replacement.trim(),
          reasoning: e.reasoning?.trim() || null,
        }));

      const result = await submitCorrection({
        submissionType: submitType,
        url: normalizedUrl,
        originalHeadline: headline.trim(),
        replacement: submitType === 'affirmation' ? null : replacement.trim(),
        reasoning: reasoning.trim(),
        author: selectedAuthors.length > 0 ? selectedAuthors.join(', ') : null,
        orgIds: selectedOrgs,
        evidence,
        inlineEdits: validInlineEdits.length > 0 ? validInlineEdits : undefined,
      });

      if (result.error) {
        Alert.alert('Error', result.error);
        return;
      }

      const submissionIds = result.submissions?.map((submission) => submission.id)
        || (result.id ? [result.id] : []);
      const submissionTargets = submissionIds
        .map((submissionId, index) => ({ submissionId, orgId: selectedOrgs[index] }))
        .filter((target): target is { submissionId: string; orgId: string } => Boolean(target.orgId));
      const vaultRequests = [];

      for (const target of submissionTargets) {
        for (const item of vaultItems.correction) {
          if (item.assertion.trim() && item.evidence.trim()) {
            vaultRequests.push(submitVault({
              ...target,
              type: 'vault',
              assertion: item.assertion.trim(),
              evidence: item.evidence.trim(),
            }));
          }
        }
        for (const item of vaultItems.argument) {
          if (item.content.trim()) {
            vaultRequests.push(submitVault({ ...target, type: 'argument', content: item.content.trim() }));
          }
        }
        for (const item of vaultItems.belief) {
          if (item.content.trim()) {
            vaultRequests.push(submitVault({ ...target, type: 'belief', content: item.content.trim() }));
          }
        }
        for (const item of vaultItems.translation) {
          if (item.original.trim() && item.translated.trim()) {
            vaultRequests.push(submitVault({
              ...target,
              type: 'translation',
              original: item.original.trim(),
              translated: item.translated.trim(),
              translationType: item.translationType || 'clarity',
            }));
          }
        }
      }

      const vaultResults = await Promise.allSettled(vaultRequests);
      const vaultFailureCount = vaultResults.filter((settled) => (
        settled.status === 'rejected' || Boolean(settled.value.error)
      )).length;
      const vaultSuccessCount = vaultResults.length - vaultFailureCount;

      const orgCount = selectedOrgs.length;
      let message = submitType === 'affirmation'
        ? `Affirmation submitted to ${orgCount} assembly${orgCount > 1 ? 's' : ''}. It will appear after review.`
        : `Correction submitted to ${orgCount} assembly${orgCount > 1 ? 's' : ''}. It will appear after review.`;
      if (validInlineEdits.length > 0) message += ` ${validInlineEdits.length} body correction(s) included.`;
      if (vaultSuccessCount > 0) message += ` ${vaultSuccessCount} vault artifact(s) linked.`;
      if (vaultFailureCount > 0) message += ` ${vaultFailureCount} vault artifact(s) could not be saved.`;

      Alert.alert(vaultFailureCount > 0 ? 'Partially submitted' : 'Success', message);
      await clearFormState();

      const matching = drafts.find(
        (draft) => correctionCacheKey(draft.url) === correctionCacheKey(normalizedUrl),
      );
      if (matching) {
        await deleteDraft(matching.id);
        setDrafts((current) => current.filter((draft) => draft.id !== matching.id));
      }
      setPendingUrlDraft(null);
      setHeadline('');
      setReplacement('');
      setReasoning('');
      setSelectedAuthors([]);
      setInlineEdits([]);
      setVaultItems({ correction: [], argument: [], belief: [], translation: [] });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Draft Handlers ──
  const handleSaveDraft = async () => {
    const normalizedUrl = normalizeBrowserUrl(sourceUrl);
    if (!normalizedUrl) {
      Alert.alert('Error', 'Enter a valid source URL first.');
      return;
    }

    const formStateToSave: FormState = {
      url: normalizedUrl,
      contentType,
      submitType,
      headline,
      replacement,
      reasoning,
      selectedAuthors,
      selectedOrgIds,
      inlineEdits,
      vaultItems,
      vaultSectionsOpen: vaultSectionsOpen as { correction: boolean; argument: boolean; belief: boolean; translation: boolean },
      vaultBodyOpen,
      inlineEditsOpen,
    };

    const result = await saveDraft(normalizedUrl, headline || 'Untitled', formStateToSave);

    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      Alert.alert('Draft saved!');
      const updatedDrafts = await getDrafts();
      setDrafts(updatedDrafts as SubmissionDraft<FormState>[]);
    }
  };

  const handleLoadDraft = async (draft: SubmissionDraft<FormState>) => {
    const fullDraft = draft.draftData
      ? draft
      : await getDraft(draft.id) as SubmissionDraft<FormState> | null;
    if (!fullDraft?.draftData) {
      Alert.alert('Unable to load draft', 'The saved draft could not be retrieved.');
      return;
    }
    setSourceUrl(fullDraft.url);
    applyFormState({ ...fullDraft.draftData, url: fullDraft.url });
    setPendingUrlDraft(null);
  };

  const handleDeleteDraft = async (id: string) => {
    const deleted = await deleteDraft(id);
    if (!deleted) {
      Alert.alert('Unable to delete draft', 'Please try again.');
      return;
    }
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const getDomain = (urlStr: string) => {
    try { return new URL(urlStr).hostname.replace('www.', ''); } catch { return ''; }
  };

  // ── Render ──
  const labels = FORM_LABELS[contentType] || FORM_LABELS.article;
  const joinedOrgs = userAssemblies.joined;
  const isAffirm = submitType === 'affirmation';

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.card}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>Sign in to submit</Text>
          <Text style={styles.emptyText}>Sign in to submit corrections, affirmations, and vault artifacts for your assemblies.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation?.navigate('Auth')}>
            <Text style={styles.primaryBtnText}>Go to Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://trustassembly.org/register')}>
            <Text style={styles.link}>Don't have an account? Register on trustassembly.org</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (assembliesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.loadingText}>Loading your assemblies…</Text>
      </View>
    );
  }

  if (assembliesError) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.card}>
          <Text style={styles.emptyIcon}>⚠</Text>
          <Text style={styles.emptyTitle}>Assemblies could not be loaded</Text>
          <Text style={styles.emptyText}>{assembliesError}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={loadAssemblies}>
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (joinedOrgs.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.card}>
          <Text style={styles.emptyIcon}>⚖</Text>
          <Text style={styles.emptyText}>You must be a member of at least one assembly to submit.</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://trustassembly.org/orgs')}>
            <Text style={styles.link}>Join an assembly on trustassembly.org</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.title}>Submit to Trust Assembly</Text>

        {/* Submission type toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, !isAffirm ? styles.typeBtnActiveCorrection : styles.typeBtnInactive]}
            onPress={() => toggleSubmitType('correction')}
          >
            <Text style={[styles.typeBtnText, !isAffirm ? styles.typeBtnTextActive : null]}>Correction</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, isAffirm ? styles.typeBtnActiveAffirmation : styles.typeBtnInactive]}
            onPress={() => toggleSubmitType('affirmation')}
          >
            <Text style={[styles.typeBtnText, isAffirm ? styles.typeBtnTextActive : null]}>Affirmation</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.workflowNote, isAffirm && styles.workflowNoteAffirmation]}>
          <Text style={styles.workflowNoteTitle}>
            {isAffirm ? 'Affirm a page you have verified' : 'Correct the current page'}
          </Text>
          <Text style={styles.workflowNoteText}>
            {isAffirm
              ? 'Affirmations confirm that a specific page is accurate and important. Open an article in Browser, verify it against evidence, then switch back here or tap Use Page to submit it for assembly review.'
              : 'Open an article in Browser, then switch back here or tap Use Page to carry its URL, headline, authors, and content type into this form.'}
          </Text>
          {!activePageUrl && (
            <TouchableOpacity
              style={styles.workflowButton}
              onPress={() => navigation?.navigate('Browser')}
            >
              <Text style={styles.workflowButtonText}>Open Browser</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content type picker */}
        <View style={styles.row}>
          <Text style={styles.label}>Content Type</Text>
          {CONTENT_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, contentType === opt.value && styles.chipSelected]}
              onPress={() => setContentType(opt.value)}
            >
              <Text style={[styles.chipText, contentType === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* URL field */}
        <View style={styles.field}>
          <Text style={styles.label}>Source URL</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Enter article URL"
            value={sourceUrl}
            onChangeText={setSourceUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        {/* Headline field */}
        <View style={styles.field}>
          <Text style={styles.label}>{labels.headline}</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="The original headline as published"
            value={headline}
            onChangeText={setHeadline}
            multiline
          />
        </View>

        {/* Replacement field (hidden for affirmation) */}
        {submitType === 'correction' && (
          <View style={styles.field}>
            <Text style={styles.label}>{labels.replacement}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Write the corrected headline"
              value={replacement}
              onChangeText={setReplacement}
              multiline
            />
          </View>
        )}

        {/* Reasoning field */}
        <View style={styles.field}>
          <Text style={styles.label}>Reasoning (required)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder={isAffirm
              ? 'Why is this page accurate? What independent evidence supports it?'
              : 'Why is the original misleading? What evidence supports the correction?'}
            value={reasoning}
            onChangeText={setReasoning}
            multiline
          />
        </View>

        {/* Authors tags */}
        <View style={styles.field}>
          <Text style={styles.label}>{labels.author}</Text>
          <View style={styles.tagContainer}>
            {selectedAuthors.map((a, i) => (
              <View key={i} style={styles.authorTag}>
                <Text style={styles.authorTagText}>{a}</Text>
                <TouchableOpacity onPress={() => removeAuthor(a)}>
                  <Text style={styles.authorTagRemove}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Type author name and press Enter"
            onSubmitEditing={e => handleAuthorAdd(e.nativeEvent.text)}
            returnKeyType="done"
          />
        </View>

        {/* Assembly chips */}
        <View style={styles.field}>
          <Text style={styles.label}>Assemblies</Text>
          <View style={styles.chipContainer}>
            {joinedOrgs.map(org => (
              <TouchableOpacity
                key={org.id}
                style={[styles.orgChip, selectedOrgIds.includes(org.id) && styles.orgChipSelected]}
                onPress={() => toggleOrg(org.id)}
              >
                <Text style={[styles.orgChipText, selectedOrgIds.includes(org.id) && styles.orgChipTextSelected]}>{org.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Auto-save toggle */}
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Auto-save drafts</Text>
          <Switch value={autoSave} onValueChange={setAutoSave} />
        </View>

        {/* Inline edits section */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={toggleInlineEdits}>
            <Text style={styles.sectionTitle}>{inlineEditsOpen ? '− Body Corrections' : '+ Body Corrections (optional)'}</Text>
          </TouchableOpacity>
          {inlineEditsOpen && (
            <>
              {inlineEdits.map((edit, i) => (
                <View key={edit.id} style={styles.inlineEditEntry}>
                  <View style={styles.inlineEditHeader}>
                    <Text style={styles.inlineEditNumber}>Body Edit #{i + 1}</Text>
                    <TouchableOpacity onPress={() => removeInlineEdit(edit.id)}>
                      <Text style={styles.removeBtn}>× Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Original text from article"
                    value={edit.original}
                    onChangeText={val => updateInlineEdit(edit.id, 'original', val)}
                    multiline
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Corrected text"
                    value={edit.replacement}
                    onChangeText={val => updateInlineEdit(edit.id, 'replacement', val)}
                    multiline
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Why this change? (optional)"
                    value={edit.reasoning || ''}
                    onChangeText={val => updateInlineEdit(edit.id, 'reasoning', val)}
                    multiline
                  />
                </View>
              ))}
              <TouchableOpacity style={styles.addBtn} onPress={addInlineEdit}>
                <Text style={styles.addBtnText}>+ Add another body correction</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {/* Vault Artifacts section */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={toggleVaultBody}>
            <Text style={styles.sectionTitle}>{vaultBodyOpen ? '- Vault Artifacts (optional)' : '+ Vault Artifacts (optional)'}</Text>
          </TouchableOpacity>
          {vaultBodyOpen && (
            <>
              {VAULT_SECTIONS.map(section => (
                <View key={section.key} style={styles.vaultTypeRow}>
                  <TouchableOpacity style={styles.vaultTypeHeader} onPress={() => toggleVaultSection(section.key)}>
                    <Text style={styles.vaultTypeLabel}>{section.label}</Text>
                    <Text style={styles.vaultTypeToggle}>{vaultSectionsOpen[section.key] ? "-" : "+"}</Text>
                  </TouchableOpacity>
                  {vaultSectionsOpen[section.key] && (
                    <View style={styles.vaultTypeBody}>
                      <Text style={styles.vaultTypeDesc}>{section.desc}</Text>
                      {(vaultItems[section.key] as any[]).map((item: any, i: number) => (
                        <View key={item.id} style={styles.vaultItemEntry}>
                          <Text style={styles.vaultItemNum}>#{i + 1}</Text>
                          {section.key === 'correction' && (
                            <>
                              <TextInput style={styles.textInput} placeholder="Factual assertion"
                                value={item.assertion || ''} 
                                onChangeText={val => updateVaultItem('correction', i, 'assertion', val)} multiline />
                              <TextInput style={styles.textInput} placeholder="Supporting evidence or source URL"
                                value={item.evidence || ''} 
                                onChangeText={val => updateVaultItem('correction', i, 'evidence', val)} multiline />
                            </>
                          )}
                          {(section.key === 'argument' || section.key === 'belief') && (
                            <TextInput style={[styles.textInput, styles.textArea]} placeholder="Enter content..."
                              value={item.content || ''}
                              onChangeText={val => updateVaultItem(section.key, i, 'content', val)} multiline />
                          )}
                          {section.key === 'translation' && (
                            <>
                              <TextInput style={styles.textInput} placeholder="Original term or phrase"
                                value={item.original || ''}
                                onChangeText={val => updateVaultItem('translation', i, 'original', val)} multiline />
                              <TextInput style={styles.textInput} placeholder="Plain-language replacement"
                                value={item.translated || ''}
                                onChangeText={val => updateVaultItem('translation', i, 'translated', val)} multiline />
                              <Text style={styles.label}>Type</Text>
                              {TRANSLATION_TYPES.map(tt => (
                                <TouchableOpacity key={tt.value}
                                  style={[styles.chip, item.translationType === tt.value && styles.chipSelected]}
                                  onPress={() => updateVaultItem('translation', i, 'translationType', tt.value)}>
                                  <Text style={[styles.chipText, item.translationType === tt.value && styles.chipTextSelected]}>{tt.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </>
                          )}
                        </View>
                      ))}
                      <TouchableOpacity style={styles.addBtn} onPress={() => addVaultItem(section.key)}>
                        <Text style={styles.addBtnText}>+ Add another {section.label}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </View>

        {/* Pending URL draft banner */}
        {pendingUrlDraft && (
          <View style={styles.draftBanner}>
            <Text style={styles.draftBannerText}>Saved draft found for this page</Text>
            <View style={styles.draftBannerActions}>
              <TouchableOpacity style={styles.draftBannerBtn} onPress={() => handleLoadDraft(pendingUrlDraft)}>
                <Text style={styles.draftBannerBtnText}>Load</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.draftBannerBtn} onPress={() => setPendingUrlDraft(null)}>
                <Text style={styles.draftBannerBtnTextSecondary}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Saved drafts list */}
        {drafts && drafts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saved Drafts ({drafts.length})</Text>
            {drafts.slice(0, 5).map(d => (
              <View key={d.id} style={styles.draftListItem}>
                <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <Text style={styles.draftItemTitle} numberOfLines={1}>{d.title || '(no headline)'}</Text>
                  <Text style={styles.draftItemDomain}>{getDomain(d.url)}</Text>
                </View>
                <View style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                  <TouchableOpacity style={styles.draftListItemBtn} onPress={() => handleLoadDraft(d)}>
                    <Text style={styles.draftListItemBtnText}>Load</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.draftListItemBtn} onPress={() => handleDeleteDraft(d.id)}>
                    <Text style={styles.draftListItemBtnTextDel}>Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Submit buttons */}
        <View style={styles.submitRow}>
          <TouchableOpacity
            style={[styles.submitBtn, isAffirm ? styles.submitBtnAffirmation : styles.submitBtnCorrection]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Submitting…' : (isAffirm ? 'Submit Affirmation' : 'Submit Correction')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveDraftBtn} onPress={handleSaveDraft}>
            <Text style={styles.saveDraftBtnText}>Save Draft</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  scrollContent: { padding: 12, backgroundColor: COLORS.vellum },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: COLORS.vellum },
  loadingText: { fontSize: 13, color: COLORS.navy },
  card: { backgroundColor: COLORS.linen, borderRadius: 12, padding: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  emptyIcon: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 13, color: COLORS.navy, textAlign: 'center', marginBottom: 16 },
  primaryBtn: { backgroundColor: COLORS.gold, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: COLORS.navy, fontSize: 14, fontWeight: '700' },
  link: { color: COLORS.gold, fontSize: 12, textAlign: 'center' },
  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.navy },
  typeBtnInactive: { backgroundColor: 'transparent' },
  typeBtnActiveCorrection: { backgroundColor: COLORS.red },
  typeBtnActiveAffirmation: { backgroundColor: COLORS.green },
  workflowNote: { marginBottom: 16, padding: 12, borderRadius: 6, backgroundColor: '#F8EEE9', borderLeftWidth: 3, borderLeftColor: COLORS.red },
  workflowNoteAffirmation: { backgroundColor: '#EAF4EE', borderLeftColor: COLORS.green },
  workflowNoteTitle: { color: COLORS.navy, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  workflowNoteText: { color: '#5A5650', fontSize: 11, lineHeight: 17 },
  workflowButton: { alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  workflowButtonText: { color: COLORS.navy, fontSize: 11, fontWeight: '700' },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.navy },
  typeBtnTextActive: { color: COLORS.linen },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.navy, marginBottom: 4 },
  textInput: { borderWidth: 1, borderColor: '#DCD8D0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: COLORS.navy, backgroundColor: COLORS.vellum },
  textArea: { minHeight: 50, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#2a2518', backgroundColor: 'transparent' },
  chipSelected: { backgroundColor: 'rgba(212,168,67,0.13)', borderColor: COLORS.gold },
  chipText: { fontSize: 11, color: '#8a8278' },
  chipTextSelected: { color: COLORS.gold, fontWeight: '700' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  orgChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#2a2518', backgroundColor: 'transparent' },
  orgChipSelected: { backgroundColor: 'rgba(212,168,67,0.13)', borderColor: COLORS.gold },
  orgChipText: { fontSize: 11, color: '#8a8278', fontFamily: 'monospace', letterSpacing: 0.5 },
  orgChipTextSelected: { color: COLORS.gold, fontWeight: '700' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  authorTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0EDE6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  authorTagText: { fontSize: 12, color: COLORS.navy },
  authorTagRemove: { fontSize: 16, color: COLORS.red, marginLeft: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  field: { marginBottom: 12 },
  section: { marginBottom: 12, borderTopWidth: 1, borderColor: '#DCD8D0', paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.navy },
  inlineEditEntry: { backgroundColor: COLORS.vellum, borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EBE8E2' },
  inlineEditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  inlineEditNumber: { fontSize: 11, fontWeight: '600', color: COLORS.navy },
  removeBtn: { fontSize: 12, color: COLORS.red },
  addBtn: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#DCD8D0', borderRadius: 4, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 11, color: COLORS.gold },
  vaultTypeRow: { marginBottom: 8 },
  vaultTypeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  vaultTypeLabel: { fontSize: 13, fontWeight: '600', color: COLORS.navy },
  vaultTypeToggle: { fontSize: 16, color: '#7A7570' },
  vaultTypeBody: { paddingLeft: 8, borderLeftWidth: 2, borderColor: '#EBE8E2' },
  vaultTypeDesc: { fontSize: 10, color: '#7A7570', marginBottom: 6 },
  vaultItemEntry: { backgroundColor: COLORS.vellum, borderRadius: 6, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: '#EBE8E2' },
    vaultItemNum: { fontSize: 10, color: '#7A7570', marginBottom: 4 },
  draftBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: COLORS.gold, borderRadius: 4, marginBottom: 8 },
  draftBannerText: { fontSize: 11, color: '#7A7570' },
  draftBannerActions: { flexDirection: 'row', gap: 6 },
  draftBannerBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  draftBannerBtnText: { fontSize: 10, color: COLORS.green },
  draftBannerBtnTextSecondary: { fontSize: 10, color: '#7A7570' },
  draftListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 4, marginBottom: 3, backgroundColor: COLORS.vellum, borderWidth: 1, borderColor: '#EBE8E2', borderRadius: 3 },
  draftItemTitle: { fontSize: 11, color: COLORS.navy },
  draftItemDomain: { fontSize: 9, color: '#7A7570' },
  draftListItemBtn: { paddingHorizontal: 4, paddingVertical: 1 },
  draftListItemBtnText: { fontSize: 9, color: COLORS.green },
  draftListItemBtnTextDel: { fontSize: 9, color: COLORS.red },
  submitRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  submitBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  submitBtnCorrection: { backgroundColor: COLORS.red },
  submitBtnAffirmation: { backgroundColor: COLORS.green },
  submitBtnText: { color: COLORS.linen, fontSize: 14, fontWeight: '700' },
  saveDraftBtn: { flex: 0, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: COLORS.gold, borderRadius: 8, alignItems: 'center' },
  saveDraftBtnText: { color: COLORS.navy, fontSize: 12, fontWeight: '700' },
});
