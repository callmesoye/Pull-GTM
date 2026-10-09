// Settings stays in one document. Rendering profile data never needs to replace the General form.
export function renderSettingsProfile({ cloud = {}, profile, profileLoading = false, profileError = '', escape }) {
  if (!cloud.user) {
    return '<p class="settings-help">Sign in to save an account profile and access your private cloud workspace.</p><button class="button secondary" data-action="account">Sign in or create account</button>';
  }
  if (!cloud.verified) {
    return '<p class="settings-help">Your account connection needs checking before profile changes can be saved.</p><button class="button secondary" data-action="account">Check account connection</button>';
  }
  if (profileLoading) return '<p class="settings-help" role="status">Loading your profile…</p>';
  if (profileError) {
    return `<p class="form-error" role="alert">${escape(profileError)}</p><p class="settings-help">Open your account to check the connection, then return to Settings.</p><button class="button secondary" data-action="account">Open account</button>`;
  }
  return `<form id="profile-form" class="settings-form">
    <div class="field"><label for="profile-name">Display name</label><input id="profile-name" name="display_name" autocomplete="name" maxlength="100" value="${escape(profile?.display_name || '')}" aria-describedby="profile-name-help"><small id="profile-name-help">Optional. Use the name you want to appear on your account.</small></div>
    <p id="profile-error" class="form-error" role="alert"></p>
    <div class="settings-actions"><button type="submit" class="button primary">Save profile</button></div>
  </form>`;
}

export function renderSettingsView({ state, cloud = {}, profile, profileLoading = false, profileError = '', escape }) {
  const signedIn = Boolean(cloud.user);
  const googleAvailable = Boolean(cloud.providers?.google);
  const sections = [['general', 'General'], ['account', 'Account'], ['security', 'Security'], ['engage', 'Engage'], ['connections', 'Connections'], ['data', 'Data']];
  const email = cloud.user?.email || '';
  const accountStatus = signedIn ? cloud.verified ? 'Signed in' : 'Connection needs checking' : 'Not signed in';
  const prospectCount = new Intl.NumberFormat().format(state.prospects?.length || 0);
  const draftCount = new Intl.NumberFormat().format(Object.keys(state.drafts || {}).length);
  return `<div class="settings-view">
    <nav class="settings-index" aria-label="Settings sections"><span class="settings-index-label">On this page</span>${sections.map(([key, label], index) => `<a href="#settings/${key}" ${index === 0 ? 'aria-current="location"' : ''}>${label}</a>`).join('')}</nav>
    <div class="settings-content">
      <section id="settings/general" class="settings-section" tabindex="-1" aria-labelledby="settings-general-title">
        <div class="settings-section-heading"><h2 id="settings-general-title">General</h2><p>Define the business and workspace you use to review prospects.</p></div>
        <div class="settings-card"><form id="workspace-form" class="settings-form">
          <div class="field"><label for="identity">Workspace name</label><input id="identity" name="identity" value="${escape(state.identity)}" required maxlength="100" autocomplete="organization"></div>
          <div class="field"><label for="context">Workspace identity</label><select id="context" name="context" aria-describedby="context-help"><option value="company" ${state.context === 'company' ? 'selected' : ''}>Company</option><option value="personal" ${state.context === 'personal' ? 'selected' : ''}>Personal profile</option></select><small id="context-help">This describes who you represent. It does not connect a platform account.</small></div>
          <div class="field"><label for="website">Website</label><input type="url" id="website" name="website" value="${escape(state.website)}" placeholder="https://yourcompany.com" autocomplete="url" maxlength="2048"><small>Optional. Add your business website.</small></div>
          <div class="field"><label for="offer">Business brief</label><textarea id="offer" name="offer" maxlength="1000" aria-describedby="offer-help" placeholder="Describe the customer problem and the outcome you offer.">${escape(state.offer)}</textarea><small id="offer-help">Keep the customer problem and your offer specific.</small></div>
          <label class="checkbox-label"><input type="checkbox" name="remember" ${state.remember ? 'checked' : ''}><span>Keep this workspace on this browser. Anyone using this browser can access it.</span></label>
          <p id="workspace-error" class="form-error" role="alert"></p>
          <div class="settings-actions"><button class="button primary" type="submit">Save workspace</button></div>
        </form></div>
      </section>
      <section id="settings/account" class="settings-section" tabindex="-1" aria-labelledby="settings-account-title">
        <div class="settings-section-heading"><h2 id="settings-account-title">Account</h2><p>Your profile and sign-in account are separate from your business brief.</p></div>
        <div class="settings-card">
          <div class="settings-status-line"><h3>Account access</h3><span class="badge ${signedIn && cloud.verified ? 'fit' : 'review'}">${accountStatus}</span></div>
          ${signedIn ? `<div class="field settings-readonly"><label for="settings-email">Account email</label><input id="settings-email" type="email" name="account_email" readonly value="${escape(email)}" autocomplete="email" aria-describedby="settings-email-help"><small id="settings-email-help">This email identifies your sign-in account. It cannot be edited here.</small></div>` : ''}
          <div id="settings-profile" aria-busy="${Boolean(profileLoading)}">${renderSettingsProfile({ cloud, profile, profileLoading, profileError, escape })}</div>
          ${signedIn ? '<div class="settings-inline-link"><button class="link-button" data-action="account">Manage cloud saves and account</button></div>' : ''}
        </div>
      </section>
      <section id="settings/security" class="settings-section" tabindex="-1" aria-labelledby="settings-security-title">
        <div class="settings-section-heading"><h2 id="settings-security-title">Security</h2><p>Choose an available method to sign in to Pull.</p></div>
        <div class="settings-card settings-provider-list">
          <div class="settings-provider-row"><div><h3>Email and password</h3><p>Use the email sign-in form. New accounts may require email confirmation.</p></div><div class="settings-provider-actions"><span class="badge ${cloud.configured ? 'fit' : 'review'}">${cloud.configured ? 'Sign-in form available' : 'Cloud setup pending'}</span><button class="button secondary small" data-action="account">${signedIn ? 'Open account' : 'Sign in with email'}</button></div></div>
          <div class="settings-provider-row"><div><h3>Google sign-in</h3><p>Google signs you into Pull. It does not connect your Gmail inbox.</p></div><div class="settings-provider-actions"><span class="badge ${googleAvailable ? 'fit' : 'review'}">${googleAvailable ? 'Available' : 'Setup pending'}</span>${signedIn ? '<button class="button secondary small" data-action="account">Open account</button>' : `<button class="button secondary small" data-action="cloud-google" ${googleAvailable ? '' : 'disabled'}>Continue with Google</button>`}</div></div>
        </div>
      </section>
      <section id="settings/engage" class="settings-section" tabindex="-1" aria-labelledby="settings-engage-title">
        <div class="settings-section-heading"><h2 id="settings-engage-title">Engage</h2><p>Prepare messages here, then review channel availability before sending.</p></div>
        <div class="settings-card settings-provider-list">
          <div class="settings-provider-row"><div><h3>Outreach drafts</h3><p>Write and export editable messages for prospects you have reviewed.</p></div><div class="settings-provider-actions"><span class="badge fit">Available</span><button class="button secondary small" data-view="drafts">Open outreach</button></div></div>
          <div class="settings-provider-row"><div><h3>Connected mailbox</h3><p>No mailbox or sending provider is connected. Draft preparation does not send a message or sync replies.</p></div><div class="settings-provider-actions"><span class="badge review">Not connected</span><button class="button secondary small" data-view="connections">View channels</button></div></div>
        </div>
      </section>
      <section id="settings/connections" class="settings-section" tabindex="-1" aria-labelledby="settings-connections-title">
        <div class="settings-section-heading"><h2 id="settings-connections-title">Connections</h2><p>Keep data sources and messaging channels in one place.</p></div>
        <div class="settings-card settings-provider-list">
          <div class="settings-provider-row"><div><h3>Your AI assistant</h3><p>Connect your preferred AI app to your private Pull workspace with a guided setup.</p></div><button class="button secondary small" data-view="connect">Connect your AI</button></div>
          <div class="settings-provider-row"><div><h3>Prospect import</h3><p>Import a CSV list you own. Sources, dates, and unknown information stay with each record.</p></div><div class="settings-provider-actions"><span class="badge fit">Available</span><button class="button secondary small" data-action="import">Import a list</button></div></div>
          <div class="settings-provider-row"><div><h3>Channel setup</h3><p>Review the supported actions and requirements for each channel.</p></div><button class="button secondary small" data-view="connections">Open connections</button></div>
        </div>
      </section>
      <section id="settings/data" class="settings-section" tabindex="-1" aria-labelledby="settings-data-title">
        <div class="settings-section-heading"><h2 id="settings-data-title">Data</h2><p>Back up your current work before clearing it from this browser.</p></div>
        <div class="settings-card"><div class="settings-provider-row"><div><h3>Workspace backup</h3><p>Your current workspace contains ${prospectCount} prospects and ${draftCount} drafts. Download a backup of your list, shortlist, drafts, brief, and activity.</p></div><button class="button secondary small" data-action="backup">Download backup</button></div></div>
        <div class="settings-card settings-danger"><div class="settings-provider-row"><div><h3>Clear local workspace</h3><p>This clears the working copy and saved browser data. A saved cloud workspace remains in your account. You will confirm before anything is cleared.</p></div><button class="button danger small" data-action="reset">Clear local workspace</button></div></div>
      </section>
    </div>
  </div>`;
}

let detachPrevious = () => {};
export function attachSettingsNavigation() {
  detachPrevious();
  const root = document.querySelector('.settings-view');
  if (!root) return () => {};
  const links = [...root.querySelectorAll('.settings-index a[href^="#settings/"]')];
  const sections = [...root.querySelectorAll('.settings-section')];
  const offset = Number.parseFloat(getComputedStyle(root).getPropertyValue('--settings-offset')) || 104;
  let observer;
  const setCurrent = id => links.forEach(link => {
    if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const update = () => {
    const passed = sections.filter(section => section.getBoundingClientRect().top <= offset + 80);
    setCurrent((passed.at(-1) || sections[0]).id);
  };
  const onClick = event => {
    const link = event.target.closest('.settings-index a');
    if (link) setCurrent(link.hash.slice(1)); // Native anchor updates URL, focus position, and document scroll.
  };
  root.addEventListener('click', onClick);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(update, { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, .15, .3, .5, 1] });
    sections.forEach(section => observer.observe(section));
  }
  const frame = requestAnimationFrame(() => {
    const section = sections.find(item => '#' + item.id === location.hash);
    if (section) section.scrollIntoView({ behavior: 'auto', block: 'start' });
    update();
  });
  const detach = () => {
    observer?.disconnect();
    cancelAnimationFrame(frame);
    root.removeEventListener('click', onClick);
  };
  detachPrevious = detach;
  return detach;
}
