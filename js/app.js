// Configuration du projet Supabase.
// Utilise l'URL du projet + une clé publique sb_publishable_... (ou anon).
// Ne mets JAMAIS une clé secret / service_role dans le code du navigateur.
const SUPABASE_URL = 'https://hnrpamcjvozgwevejdsj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WlfgRI9EU48YT6eqxb8wIA_Y59RUD-D';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const categoryLabels = {
  alimentation: 'Alimentation', logement: 'Logement', factures: 'Factures', transport: 'Transport',
  sante: 'Santé', vetements: 'Vêtements', sorties: 'Sorties', loisirs: 'Loisirs',
  'achats-divers': 'Achats divers', epargne: 'Épargne'
};
const envelopeLabels = { needs: 'Besoins', wants: 'Envies', savings: 'Épargne' };
const envelopeIcons = { needs: '⌂', wants: '♡', savings: '⌁' };
const envelopeColors = { needs: '#5389e8', wants: '#e46c68', savings: '#168b6b', available: '#dfe6e2' };

let supabaseClient;
let currentUser;
let profile = { monthly_income: 0, full_name: '', avatar_path: null, avatar_url: null, profile_setup_completed: false };
let operations = [];
let incomeEntries = [];
let selectedMonth = localDate().slice(0, 7);
let isRegisterMode = false;
let toastTimer;

document.addEventListener('DOMContentLoaded', start);

async function start() {
  if (!window.supabase?.createClient) {
    showSetupNotice('La bibliothèque Supabase ne s’est pas chargée. Vérifie ta connexion Internet et recharge la page.');
    return;
  }
  if (SUPABASE_URL.startsWith('COLLE_') || SUPABASE_PUBLISHABLE_KEY.startsWith('COLLE_')) {
    showSetupNotice();
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  bindEvents();
  buildMonthOptions();
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) showToast(error.message, true);
  if (session?.user) await enterApp(session.user);
  else showAuth();

  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuth();
    }
  });
}

function bindEvents() {
  $('#auth-form').addEventListener('submit', handleAuthSubmit);
  $('#auth-switch').addEventListener('click', toggleAuthMode);
  $('#google-auth-button').addEventListener('click', () => signInWithProvider('google'));
  $('#setup-avatar-input').addEventListener('change', (event) => handleAvatarSelection(event.target, $('#setup-avatar-preview')));
  $('#settings-avatar-input').addEventListener('change', (event) => handleAvatarSelection(event.target, $('#settings-avatar-preview')));
  $('#profile-setup-form').addEventListener('submit', saveFirstProfile);
  $('#profile-form').addEventListener('submit', saveProfileSettings);
  $('#signout-button').addEventListener('click', signOut);
  $('#settings-signout-button').addEventListener('click', signOut);
  $('#month-select').addEventListener('change', async (event) => {
    selectedMonth = event.target.value;
    await loadOperations();
    renderBudget();
  });
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#add-operation-button').addEventListener('click', () => openOperationDialog());
  $$('.add-operation-trigger').forEach((button) => button.addEventListener('click', () => openOperationDialog()));
  $('#edit-income-button').addEventListener('click', () => {
    $('#income-input').value = profile.monthly_income || '';
    showView('settings');
    $('#income-input').focus();
  });
  $('#income-form').addEventListener('submit', saveIncome);
  $('#see-all-button').addEventListener('click', () => showView('transactions'));
  $('#operation-form').addEventListener('submit', saveOperation);
  $('#close-dialog').addEventListener('click', closeOperationDialog);
  $('#cancel-dialog').addEventListener('click', closeOperationDialog);
  $('#operation-dialog').addEventListener('click', (event) => {
    if (event.target === $('#operation-dialog')) closeOperationDialog();
  });
  $('#add-income-button').addEventListener('click', () => openIncomeDialog());
  $('#income-entry-form').addEventListener('submit', saveIncomeEntry);
  $('#close-income-dialog').addEventListener('click', closeIncomeDialog);
  $('#cancel-income-dialog').addEventListener('click', closeIncomeDialog);
  $('#income-dialog').addEventListener('click', (event) => {
    if (event.target === $('#income-dialog')) closeIncomeDialog();
  });
}

function showSetupNotice(message) {
  const notice = $('#setup-notice');
  if (message) $('.setup-notice__card p').textContent = message;
  notice.hidden = false;
}

function showAuth() {
  $('#auth-view').hidden = false;
  $('#app-view').hidden = true;
  $('#profile-setup-view').hidden = true;
}

function showApp() {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  $('#profile-setup-view').hidden = true;
}

function showProfileSetup(name = '', avatarUrl = null) {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = true;
  $('#profile-setup-view').hidden = false;
  $('#setup-name').value = name;
  $('#profile-setup-error').hidden = true;
  setImagePreview($('#setup-avatar-preview'), avatarUrl);
  $('#setup-avatar-fallback').hidden = Boolean(avatarUrl);
  $('#setup-name').focus();
}

function showView(view) {
  const views = { dashboard: 'dashboard-view', transactions: 'transactions-view', settings: 'settings-view' };
  Object.entries(views).forEach(([key, id]) => { $(`#${id}`).hidden = key !== view; });
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  $('#auth-title').textContent = isRegisterMode ? 'Créer ton compte' : 'Ravi de te revoir';
  $('.auth-intro').textContent = isRegisterMode ? 'Quelques secondes pour commencer à suivre ton budget.' : 'Connecte-toi pour retrouver ton budget du mois.';
  $('#auth-submit').textContent = isRegisterMode ? 'Créer mon compte' : 'Se connecter';
  $('#auth-password').autocomplete = isRegisterMode ? 'new-password' : 'current-password';
  $('#auth-switch-copy').textContent = isRegisterMode ? 'Tu as déjà un compte ?' : 'Pas encore de compte ?';
  $('#auth-switch').textContent = isRegisterMode ? 'Se connecter' : 'Créer un compte';
  $('#auth-error').hidden = true;
  $('#auth-error').textContent = '';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const button = $('#auth-submit');
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  setBusy(button, true, isRegisterMode ? 'Création…' : 'Connexion…');
  $('#auth-error').hidden = true;

  const result = isRegisterMode
    ? await supabaseClient.auth.signUp({ email, password })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  setBusy(button, false);
  if (result.error) {
    showAuthError(prettyAuthError(result.error.message));
    return;
  }
  if (isRegisterMode) {
    if (result.data.session) await enterApp(result.data.user);
    else {
      showAuthError('Compte créé. Vérifie ta boîte e-mail pour confirmer ton adresse, puis connecte-toi.', false);
    }
    return;
  }
  if (result.data.user) await enterApp(result.data.user);
}

async function signInWithProvider(provider) {
  const button = $('#google-auth-button');
  const label = 'Google';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  $('.social-label', button).textContent = 'Redirection…';
  $('#social-auth-error').hidden = true;
  const redirectTo = new URL('./', window.location.href).href;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: { redirectTo }
  });
  if (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    $('.social-label', button).textContent = label;
    const errorElement = $('#social-auth-error');
    errorElement.textContent = /provider is not enabled/i.test(error.message)
      ? `La connexion ${label} n’est pas encore activée dans Supabase.`
      : prettyAuthError(error.message);
    errorElement.hidden = false;
  }
}

function showAuthError(message, isError = true) {
  const error = $('#auth-error');
  error.textContent = message;
  error.classList.toggle('is-success', !isError);
  error.hidden = false;
}

function prettyAuthError(message) {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/user already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail. Essaie de te connecter.';
  if (/password should be at least/i.test(message)) return 'Choisis un mot de passe plus long (au moins 8 caractères).';
  if (/email not confirmed/i.test(message)) return 'Confirme ton adresse depuis l’e-mail reçu avant de te connecter.';
  return message;
}

async function enterApp(user) {
  currentUser = user;
  selectedMonth = localDate().slice(0, 7);
  $('#month-select').value = selectedMonth;
  const { data, error } = await supabaseClient.from('profiles')
    .select('monthly_income, full_name, avatar_path, avatar_url, profile_setup_completed, email')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    showApp();
    showToast('Le profil ne peut pas être chargé. Exécute la migration supabase_migration_profile_avatar.sql dans Supabase.', true);
    return;
  }
  profile = data || { monthly_income: 0, full_name: '', avatar_path: null, avatar_url: null, profile_setup_completed: false };
  const metadata = user.user_metadata || {};
  if (!profile.full_name && metadata.full_name) profile.full_name = metadata.full_name;
  if (!profile.avatar_url && metadata.avatar_url) profile.avatar_url = metadata.avatar_url;
  if (!data || profile.full_name !== data.full_name || profile.avatar_path !== data.avatar_path || profile.avatar_url !== data.avatar_url) {
    const { error: saveError } = await supabaseClient.from('profiles').upsert({
      user_id: currentUser.id,
      email: currentUser.email || '',
      monthly_income: profile.monthly_income || 0,
      full_name: profile.full_name || '',
      avatar_path: profile.avatar_path || null,
      avatar_url: profile.avatar_url || null
    });
    if (saveError) showToast('Les informations du profil n’ont pas pu être enregistrées.', true);
  }
  if (!profile.profile_setup_completed || !profile.full_name || (!profile.avatar_path && !profile.avatar_url)) {
    const avatarUrl = await getProfileAvatarUrl();
    showProfileSetup(profile.full_name || '', avatarUrl);
    return;
  }
  showApp();
  await loadUserData();
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast(error.message, true);
  else showAuth();
}

async function loadUserData() {
  if (!currentUser) return;
  const identity = currentUser.email || 'Mon compte';
  $('#user-email').textContent = profile.full_name || identity;
  $('#settings-email').textContent = identity;
  $('#settings-name').value = profile.full_name || '';
  $('#income-input').value = profile.monthly_income || '';
  const avatarUrl = await getProfileAvatarUrl();
  renderAvatar(profile.full_name || identity, avatarUrl);
  setImagePreview($('#settings-avatar-preview'), avatarUrl);
  await loadOperations();
  renderBudget();
}

async function readSelectedAvatar(input) {
  const file = input.files?.[0];
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Choisis une image JPG, PNG ou WebP.', true);
    input.value = '';
    return null;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('La photo doit faire 2 Mo maximum.', true);
    input.value = '';
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handleAvatarSelection(input, preview) {
  const data = await readSelectedAvatar(input);
  if (!data) return;
  setImagePreview(preview, data);
}

function setImagePreview(image, url) {
  if (!image) return;
  image.src = url || '';
  image.hidden = !url;
  if (image.id === 'settings-avatar-preview') $('#settings-avatar-fallback').hidden = Boolean(url);
  if (image.id === 'setup-avatar-preview') $('#setup-avatar-fallback').hidden = Boolean(url);
}

function renderAvatar(name, url) {
  const avatar = $('#user-avatar');
  const image = $('#user-avatar-image');
  avatar.firstChild.textContent = (name || 'C').trim().charAt(0).toUpperCase();
  setImagePreview(image, url);
}

async function uploadProfilePhoto(dataUrl) {
  if (!dataUrl || !currentUser) return null;
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${currentUser.id}/profile.${extension}`;
    const { error } = await supabaseClient.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    return path;
  } catch (error) {
    showToast('La photo n’a pas pu être envoyée. Vérifie le bucket avatars et ses règles dans Supabase.', true);
    return null;
  }
}

async function getProfileAvatarUrl() {
  if (profile.avatar_path) {
    const { data, error } = await supabaseClient.storage.from('avatars').createSignedUrl(profile.avatar_path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return profile.avatar_url || null;
}

async function persistProfile(fullName, avatarData) {
  const cleanName = fullName.trim();
  if (!cleanName) throw new Error('Saisis ton nom.');
  let avatarPath = profile.avatar_path;
  if (avatarData) {
    avatarPath = await uploadProfilePhoto(avatarData);
    if (!avatarPath) throw new Error('La photo n’a pas pu être enregistrée.');
  }
  const changes = {
    user_id: currentUser.id,
    email: currentUser.email || '',
    monthly_income: profile.monthly_income || 0,
    full_name: cleanName,
    avatar_path: avatarPath || null,
    avatar_url: profile.avatar_url || null,
    profile_setup_completed: true
  };
  const { error } = await supabaseClient.from('profiles').upsert(changes);
  if (error) throw error;
  profile = { ...profile, ...changes };
  await loadUserData();
}

async function saveFirstProfile(event) {
  event.preventDefault();
  const button = $('#save-profile-setup');
  const avatarData = await readSelectedAvatar($('#setup-avatar-input'));
  if (!avatarData && !profile.avatar_path && !profile.avatar_url) {
    $('#profile-setup-error').textContent = 'Choisis une photo de profil.';
    $('#profile-setup-error').hidden = false;
    return;
  }
  setBusy(button, true, 'Enregistrement…');
  try {
    await persistProfile($('#setup-name').value, avatarData);
    showApp();
    showView('dashboard');
    showToast('Ton profil est prêt.');
  } catch (error) {
    $('#profile-setup-error').textContent = error.message;
    $('#profile-setup-error').hidden = false;
  } finally { setBusy(button, false); }
}

async function saveProfileSettings(event) {
  event.preventDefault();
  const button = $('button[type="submit"]', $('#profile-form'));
  const avatarData = await readSelectedAvatar($('#settings-avatar-input'));
  setBusy(button, true, 'Enregistrement…');
  try {
    await persistProfile($('#settings-name').value, avatarData);
    showToast('Profil mis à jour.');
  } catch (error) { showToast(error.message, true); }
  finally { setBusy(button, false); }
}

async function loadOperations() {
  if (!currentUser) return;
  const [expenseResult, incomeResult] = await Promise.all([
    supabaseClient.from('expenses')
    .select('id, date, label, category, amount, envelope, month')
    .eq('user_id', currentUser.id).eq('month', selectedMonth)
    .order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabaseClient.from('income_entries')
      .select('id, date, label, amount, month')
      .eq('user_id', currentUser.id).eq('month', selectedMonth)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
  ]);
  if (expenseResult.error) {
    showToast('Impossible de charger les dépenses : ' + expenseResult.error.message, true);
    return;
  }
  operations = expenseResult.data || [];
  incomeEntries = incomeResult.error ? [] : incomeResult.data || [];
  renderOperations();
  if (incomeResult.error) showToast('Pour enregistrer un virement, exécute la migration SQL des entrées d’argent dans Supabase.', true);
}

async function saveIncome(event) {
  event.preventDefault();
  const amount = Number($('#income-input').value);
  if (!Number.isFinite(amount) || amount < 0) return showToast('Saisis un revenu valide.', true);
  const button = $('button[type="submit"]', $('#income-form'));
  setBusy(button, true, 'Enregistrement…');
  const { data, error } = await supabaseClient.from('profiles')
    .upsert({ user_id: currentUser.id, email: currentUser.email || '', monthly_income: amount })
    .select('monthly_income, full_name, avatar_path, avatar_url').single();
  setBusy(button, false);
  if (error) return showToast('Le revenu n’a pas pu être enregistré : ' + error.message, true);
  profile = { ...profile, ...data };
  renderBudget();
  showToast('Ton revenu mensuel a été mis à jour.');
  showView('dashboard');
}

function openOperationDialog(operation = null) {
  const form = $('#operation-form');
  form.reset();
  $('#operation-id').value = operation?.id || '';
  $('#dialog-title').textContent = operation ? 'Modifier l’opération' : 'Ajouter une opération';
  $('#save-operation').textContent = operation ? 'Enregistrer les changements' : 'Enregistrer';
  $('#operation-label').value = operation?.label || '';
  $('#operation-amount').value = operation?.amount ?? '';
  $('#operation-date').value = operation?.date || localDate();
  $('#operation-category').value = operation?.category || 'alimentation';
  $('#operation-envelope').value = operation?.envelope || 'needs';
  $('#operation-error').hidden = true;
  $('#operation-dialog').showModal();
  $('#operation-label').focus();
}

function openIncomeDialog(entry = null) {
  $('#income-entry-form').reset();
  $('#income-entry-id').value = entry?.id || '';
  $('#income-dialog-title').textContent = entry ? 'Modifier cette entrée' : 'Ajouter de l’argent';
  $('#save-income-entry').textContent = entry ? 'Enregistrer les changements' : 'Ajouter au budget';
  $('#income-entry-label').value = entry?.label || '';
  $('#income-entry-amount').value = entry?.amount ?? '';
  $('#income-entry-date').value = entry?.date || localDate();
  $('#income-entry-error').hidden = true;
  $('#income-dialog').showModal();
  $('#income-entry-label').focus();
}

function closeIncomeDialog() {
  $('#income-dialog').close();
}

async function saveIncomeEntry(event) {
  event.preventDefault();
  const amount = Number($('#income-entry-amount').value);
  const date = $('#income-entry-date').value;
  const label = $('#income-entry-label').value.trim();
  if (!label || !date || !Number.isFinite(amount) || amount <= 0) {
    $('#income-entry-error').textContent = 'Vérifie le libellé, la date et le montant. Le montant doit être supérieur à 0 €.';
    $('#income-entry-error').hidden = false;
    return;
  }
  const payload = {
    user_id: currentUser.id,
    label,
    amount: Math.round(amount * 100) / 100,
    date,
    month: date.slice(0, 7)
  };
  const id = $('#income-entry-id').value;
  const button = $('#save-income-entry');
  setBusy(button, true, 'Enregistrement…');
  const query = id
    ? supabaseClient.from('income_entries').update(payload).eq('id', id).eq('user_id', currentUser.id)
    : supabaseClient.from('income_entries').insert(payload);
  const { error } = await query;
  setBusy(button, false);
  if (error) {
    const migrationMissing = /income_entries|schema cache|does not exist/i.test(error.message);
    $('#income-entry-error').textContent = migrationMissing
      ? 'La table des virements n’est pas encore activée. Exécute supabase_migration_income_entries.sql dans Supabase, puis réessaie.'
      : 'Impossible d’ajouter cette somme : ' + error.message;
    $('#income-entry-error').hidden = false;
    return;
  }
  closeIncomeDialog();
  showToast(id ? 'Entrée d’argent mise à jour.' : 'Argent ajouté au budget du mois.');
  if (payload.month !== selectedMonth) {
    selectedMonth = payload.month;
    $('#month-select').value = selectedMonth;
  }
  await loadOperations();
  renderBudget();
}

function closeOperationDialog() {
  $('#operation-dialog').close();
}

async function saveOperation(event) {
  event.preventDefault();
  const amount = Number($('#operation-amount').value);
  const date = $('#operation-date').value;
  const label = $('#operation-label').value.trim();
  if (!label || !date || !Number.isFinite(amount) || amount <= 0) {
    showOperationError('Vérifie le libellé, la date et le montant. Le montant doit être supérieur à 0 €.');
    return;
  }
  const payload = {
    user_id: currentUser.id,
    label,
    amount: Math.round(amount * 100) / 100,
    date,
    month: date.slice(0, 7),
    category: $('#operation-category').value,
    envelope: $('#operation-envelope').value
  };
  const id = $('#operation-id').value;
  const button = $('#save-operation');
  setBusy(button, true, 'Enregistrement…');
  const query = id
    ? supabaseClient.from('expenses').update(payload).eq('id', id).eq('user_id', currentUser.id)
    : supabaseClient.from('expenses').insert(payload);
  const { error } = await query;
  setBusy(button, false);
  if (error) {
    showOperationError('Impossible d’enregistrer cette opération : ' + error.message);
    return;
  }
  closeOperationDialog();
  showToast(id ? 'Opération mise à jour.' : 'Opération ajoutée.');
  if (payload.month !== selectedMonth) {
    selectedMonth = payload.month;
    $('#month-select').value = selectedMonth;
  }
  await loadOperations();
  renderBudget();
}

function showOperationError(message) {
  const error = $('#operation-error');
  error.textContent = message;
  error.hidden = false;
}

async function deleteOperation(id) {
  if (!window.confirm('Supprimer cette opération ?')) return;
  const { error } = await supabaseClient.from('expenses').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) return showToast('La suppression a échoué : ' + error.message, true);
  showToast('Opération supprimée.');
  await loadOperations();
  renderBudget();
}

async function deleteIncomeEntry(id) {
  if (!window.confirm('Supprimer cette entrée d’argent ?')) return;
  const { error } = await supabaseClient.from('income_entries').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) return showToast('La suppression a échoué : ' + error.message, true);
  showToast('Entrée d’argent supprimée.');
  await loadOperations();
  renderBudget();
}

function renderBudget() {
  const recurringIncome = Number(profile.monthly_income) || 0;
  const extraIncome = incomeEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const income = recurringIncome + extraIncome;
  const totals = { needs: 0, wants: 0, savings: 0 };
  operations.forEach((operation) => { totals[operation.envelope] += Number(operation.amount) || 0; });
  const targets = { needs: income * .5, wants: income * .3, savings: income * .2 };
  const rawRemaining = {
    needs: Math.max(0, targets.needs - totals.needs),
    wants: Math.max(0, targets.wants - totals.wants),
    savings: Math.max(0, targets.savings - totals.savings)
  };
  const overspend = {
    needs: Math.max(0, totals.needs - targets.needs),
    wants: Math.max(0, totals.wants - targets.wants),
    savings: Math.max(0, totals.savings - targets.savings)
  };
  const totalOverspend = overspend.needs + overspend.wants + overspend.savings;
  const remainingBeforeAdjustment = rawRemaining.needs + rawRemaining.wants + rawRemaining.savings;
  const effectiveRemaining = {};
  Object.keys(rawRemaining).forEach((key) => {
    const share = remainingBeforeAdjustment > 0 ? rawRemaining[key] / remainingBeforeAdjustment : 0;
    effectiveRemaining[key] = Math.max(0, rawRemaining[key] - Math.min(totalOverspend, remainingBeforeAdjustment) * share);
  });
  const available = Math.max(0, income - totals.needs - totals.wants - totals.savings);
  $('#income-amount').textContent = currency.format(income);
  $('#income-caption').textContent = extraIncome > 0
    ? `${currency.format(recurringIncome)} de base + ${currency.format(extraIncome)} reçu ce mois.`
    : 'Tes repères sont calculés à partir de ce montant.';
  $('#donut-income').textContent = currency.format(income);
  $('#budget-month-label').textContent = monthFormat.format(new Date(`${selectedMonth}-02T12:00:00`));
  $('#transaction-month-heading').textContent = monthFormat.format(new Date(`${selectedMonth}-02T12:00:00`));

  setText('#legend-needs', currency.format(totals.needs));
  setText('#legend-wants', currency.format(totals.wants));
  setText('#legend-savings', currency.format(totals.savings));
  setText('#legend-available', currency.format(available));
  const chartValues = [totals.needs, totals.wants, totals.savings, available];
  const chartTotal = chartValues.reduce((sum, value) => sum + value, 0);
  if (chartTotal > 0) {
    let cursor = 0;
    const stops = chartValues.map((value, index) => {
      const start = cursor;
      cursor += value / chartTotal * 100;
      return `${Object.values(envelopeColors)[index]} ${start}% ${cursor}%`;
    });
    $('#budget-donut').style.background = `conic-gradient(${stops.join(', ')})`;
  } else $('#budget-donut').style.background = `conic-gradient(${envelopeColors.available} 0 100%)`;

  updateEnvelope('needs', totals.needs, targets.needs, effectiveRemaining.needs, 'utilisé', overspend.needs);
  updateEnvelope('wants', totals.wants, targets.wants, effectiveRemaining.wants, 'utilisé', overspend.wants);
  updateEnvelope('savings', totals.savings, targets.savings, effectiveRemaining.savings, 'mis de côté', overspend.savings);
  const adjustment = $('#budget-adjustment');
  adjustment.hidden = totalOverspend <= 0;
  if (totalOverspend > 0) {
    $('#budget-adjustment-text').textContent = `Les enveloppes dépassent leurs objectifs de ${currency.format(totalOverspend)} au total. Le reste disponible a été réduit dans les autres enveloppes, en fonction de ce qu’il leur restait.`;
  }
}

function updateEnvelope(key, amount, target, effectiveLeft, verb, overAmount) {
  const percentage = target > 0 ? amount / target * 100 : amount > 0 ? 100 : 0;
  const capped = Math.min(percentage, 100);
  const prefix = key === 'needs' ? 'needs' : key === 'wants' ? 'wants' : 'savings';
  const card = $(`.envelope-card--${key}`);
  const rawLeft = Math.max(0, target - amount);
  const wasReduced = rawLeft - effectiveLeft > .01;
  const amountId = key === 'savings' ? '#savings-saved' : `#${prefix}-spent`;
  setText(amountId, currency.format(amount));
  setText(`#${prefix}-target`, currency.format(target));
  setText(`#${prefix}-left`, currency.format(effectiveLeft));
  setText(`#${prefix}-status`, overAmount > 0
    ? `${Math.round(percentage)}% ${verb} · +${currency.format(overAmount)}`
    : `${Math.round(percentage)}% ${verb}${wasReduced ? ' · réduit' : ''}`);
  $(`#${prefix}-progress`).style.width = `${capped}%`;
  $(`#${prefix}-left`).classList.toggle('over-budget', overAmount > 0);
  card.classList.toggle('is-over', overAmount > 0);
}

function renderOperations() {
  const recentList = $('#recent-list');
  const allList = $('#all-transactions');
  const ledger = [
    ...operations.map((operation) => ({ ...operation, type: 'expense' })),
    ...incomeEntries.map((entry) => ({ ...entry, type: 'income' }))
  ].sort((a, b) => b.date.localeCompare(a.date));
  recentList.replaceChildren(...ledger.slice(0, 4).map(makeOperationRow));
  allList.replaceChildren(...ledger.map(makeOperationRow));
  $('#recent-empty').hidden = ledger.length > 0;
  $('#transactions-empty').hidden = ledger.length > 0;
  $('#transaction-count').textContent = `${ledger.length} opération${ledger.length > 1 ? 's' : ''}`;
}

function makeOperationRow(operation) {
  const row = document.createElement('article');
  row.className = 'operation-row';
  const title = document.createElement('div');
  title.className = 'operation-title';
  const icon = document.createElement('span');
  icon.className = 'operation-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = operation.type === 'income' ? '↙' : envelopeIcons[operation.envelope] || '·';
  const nameWrap = document.createElement('div');
  nameWrap.style.minWidth = '0';
  const name = document.createElement('div');
  name.className = 'operation-name';
  name.textContent = operation.label;
  const category = document.createElement('div');
  category.className = 'operation-category';
  category.textContent = operation.type === 'income' ? 'Entrée d’argent' : categoryLabels[operation.category] || operation.category;
  nameWrap.append(name, category);
  title.append(icon, nameWrap);

  const date = document.createElement('span');
  date.className = 'operation-date';
  date.textContent = new Date(`${operation.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const tag = document.createElement('span');
  tag.className = operation.type === 'income' ? 'envelope-tag envelope-tag--income' : `envelope-tag envelope-tag--${operation.envelope}`;
  tag.textContent = operation.type === 'income' ? 'Virement reçu' : envelopeLabels[operation.envelope] || 'Autre';
  const amount = document.createElement('strong');
  amount.className = 'operation-amount';
  amount.textContent = `${operation.type === 'income' ? '+' : '−'} ${currency.format(Number(operation.amount) || 0)}`;
  if (operation.type === 'income') amount.classList.add('operation-amount--income');
  const actions = document.createElement('div');
  actions.className = 'operation-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'icon-button'; edit.setAttribute('aria-label', `Modifier ${operation.label}`); edit.title = 'Modifier'; edit.textContent = '✎';
  edit.addEventListener('click', () => operation.type === 'income' ? openIncomeDialog(operation) : openOperationDialog(operation));
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'icon-button icon-button--delete'; remove.setAttribute('aria-label', `Supprimer ${operation.label}`); remove.title = 'Supprimer'; remove.textContent = '×';
  remove.addEventListener('click', () => operation.type === 'income' ? deleteIncomeEntry(operation.id) : deleteOperation(operation.id));
  actions.append(edit, remove);
  row.append(title, date, tag, amount, actions);
  return row;
}

function buildMonthOptions() {
  const select = $('#month-select');
  const now = new Date();
  select.replaceChildren();
  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 2, 12);
    const option = document.createElement('option');
    option.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    option.textContent = monthFormat.format(date);
    if (option.value === selectedMonth) option.selected = true;
    select.append(option);
  }
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setText(selector, value) { $(selector).textContent = value; }

function setBusy(button, busy, busyText = 'Patiente…') {
  if (!busy) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
    return;
  }
  button.dataset.originalText = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyText;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
}
