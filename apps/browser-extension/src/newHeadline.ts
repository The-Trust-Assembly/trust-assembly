// Script for new_headline.html implementing NewHeadline.tsx-like behavior

const MAX_HEADLINE_LENGTH = 120;

const form = document.getElementById('new-headline-form') as HTMLFormElement | null;
const originalArea = document.getElementById('nh-original') as HTMLTextAreaElement | null;
const replacementArea = document.getElementById('nh-replacement') as HTMLTextAreaElement | null;
const originalCount = document.getElementById('nh-original-count');
const replacementCount = document.getElementById('nh-replacement-count');
const originalError = document.getElementById('nh-original-error');
const replacementError = document.getElementById('nh-replacement-error');
const citationsContainer = document.getElementById('nh-citations');
const citationsError = document.getElementById('nh-citations-error');
const cancelButton = document.getElementById('nh-cancel');

type Citation = { url: string; explanation: string };
let citations: Citation[] = [{ url: '', explanation: '' }];

function renderCitations(): void {
  if (!citationsContainer) return;
  citationsContainer.innerHTML = '';
  citations.forEach((citation, idx) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '8px';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://...';
    urlInput.value = citation.url;
    urlInput.style.width = '100%';
    urlInput.style.boxSizing = 'border-box';
    urlInput.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      citations[idx] = { ...citations[idx], url: value };
      if (idx === citations.length - 1 && value.trim() !== '') {
        citations.push({ url: '', explanation: '' });
      }
      trimTrailingEmpty();
      renderCitations();
      if (citationsError) citationsError.style.display = 'none';
    });
    wrap.appendChild(urlInput);

    const expl = document.createElement('textarea');
    expl.placeholder = 'Optional explanation (e.g. what this citation supports)';
    expl.value = citation.explanation;
    expl.rows = 2;
    expl.style.width = '100%';
    expl.style.boxSizing = 'border-box';
    expl.style.fontSize = '12px';
    expl.style.marginTop = '4px';
    expl.addEventListener('input', (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      citations[idx] = { ...citations[idx], explanation: value };
    });
    wrap.appendChild(expl);

    citationsContainer.appendChild(wrap);
  });
}

function trimTrailingEmpty(): void {
  while (
    citations.length > 1 &&
    citations[citations.length - 1].url === '' &&
    citations[citations.length - 2].url === ''
  ) {
    citations.pop();
  }
}

function updateCounts(): void {
  const o = originalArea?.value.length ?? 0;
  const r = replacementArea?.value.length ?? 0;
  if (originalCount) originalCount.textContent = `${o} / ${MAX_HEADLINE_LENGTH}`;
  if (replacementCount) replacementCount.textContent = `${r} / ${MAX_HEADLINE_LENGTH}`;
}

function clearErrors(): void {
  if (originalError) originalError.style.display = 'none';
  if (replacementError) replacementError.style.display = 'none';
  if (citationsError) citationsError.style.display = 'none';
}

function validate(): { originalHeadline?: string; replacementHeadline?: string; citations?: string } {
  const errors: { originalHeadline?: string; replacementHeadline?: string; citations?: string } = {};
  const original = originalArea?.value ?? '';
  const replacement = replacementArea?.value ?? '';
  if (!original.trim()) {
    errors.originalHeadline = 'Original headline is required.';
  } else if (original.length > MAX_HEADLINE_LENGTH) {
    errors.originalHeadline = `Original headline must be at most ${MAX_HEADLINE_LENGTH} characters.`;
  }
  if (!replacement.trim()) {
    errors.replacementHeadline = 'Replacement headline is required.';
  } else if (replacement.length > MAX_HEADLINE_LENGTH) {
    errors.replacementHeadline = `Replacement headline must be at most ${MAX_HEADLINE_LENGTH} characters.`;
  }
  const hasCitation = citations.some((c) => c.url.trim() !== '');
  if (!hasCitation) {
    errors.citations = 'At least one citation URL is required.';
  }

  if (originalError) {
    originalError.textContent = errors.originalHeadline ?? '';
    originalError.style.display = errors.originalHeadline ? 'block' : 'none';
  }
  if (replacementError) {
    replacementError.textContent = errors.replacementHeadline ?? '';
    replacementError.style.display = errors.replacementHeadline ? 'block' : 'none';
  }
  if (citationsError) {
    citationsError.textContent = errors.citations ?? '';
    citationsError.style.display = errors.citations ? 'block' : 'none';
  }

  return errors;
}

function initDefaults(): void {
  if (originalArea) originalArea.value = 'New Study Proves Coffee Cures Cancer';
  if (replacementArea)
    replacementArea.value =
      'Study Finds Correlation Between Coffee Consumption and Lower Risk of Certain Cancers';
  citations = [{ url: '', explanation: '' }];
  renderCitations();
  updateCounts();
  clearErrors();
}

// wire handlers
originalArea?.addEventListener('input', updateCounts);
replacementArea?.addEventListener('input', updateCounts);

cancelButton?.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const errors = validate();
  if (Object.keys(errors).length === 0) {
    console.log({
      originalHeadline: originalArea?.value ?? '',
      replacementHeadline: replacementArea?.value ?? '',
      citations,
    });
  }
});

// kickoff
initDefaults();

