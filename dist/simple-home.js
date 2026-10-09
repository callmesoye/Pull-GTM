// Pure view renderer. Counts and activity come from the actual workspace state.
// The shell pattern follows the supplied light-reference layout; Pull identity is preserved.
export function renderSimpleHome({ state, items = [], next, labels, escape, icons }) {
  const icon = name => typeof icons === 'function' ? icons(name) : '';
  const count = value => new Intl.NumberFormat().format(value);
  const stage = ['setup', 'import', 'prospects', 'drafts'].includes(next) ? next : 'import';
  const purpose = {
    business:{label:'Business growth',headline:'Find the right businesses to help.',detail:'Set your audience, import a list you own, and review the evidence behind every match.',import:'Import a customer or prospect list'},
    trade:{label:'Trade & commerce',headline:'Turn real enquiries into your next conversation.',detail:'For car dealers, property sellers, retailers and service traders. Bring listings or enquiries you already have; Pull helps you qualify and follow up.',import:'Import listings or enquiries'},
    career:{label:'Career growth',headline:'Make your next introduction count.',detail:'Build a private list of companies and contacts you know, review fit, then prepare a thoughtful introduction.',import:'Import companies or contacts'}
  }[state.persona] || {label:'Business growth',headline:'Find the right businesses to help.',detail:'Set your audience, import a list you own, and review every match.',import:'Import a prospect list'};
  const tasks = {
    setup: ['Set up your workspace', 'Add your business details so you have a clear brief for prospect review and outreach.', 'Set up workspace', 'data-action="workspace"'],
    import: ['Add your first list', 'Import a CSV you have permission to use. Pull shows source details and gaps before you shortlist anyone.', purpose.import, 'data-action="import"'],
    prospects: ['Review your audience matches', 'Check each person’s source and context, then choose who belongs on your shortlist.', 'Review prospects', 'data-view="prospects"'],
    drafts: ['Prepare your next message', 'Create an editable draft for each reviewed prospect. Nothing is sent until a channel is connected.', 'Open outreach', 'data-view="drafts"']
  };
  const [title, description, action, target] = tasks[stage];
  const totals = [
    ['fit', 'Audience matches', items.filter(person => person.status === 'fit').length],
    ['review', 'Need evidence', items.filter(person => person.status === 'review').length],
    ['excluded', 'Outside audience', items.filter(person => person.status === 'excluded').length]
  ];
  const activity = Array.isArray(state.audit) ? state.audit.slice(0, 4) : [];
  const timestamp = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) : 'Time unavailable';
  };
  return `<section class="home-purpose panel"><div><span class="section-kicker">${escape(purpose.label)}</span><h2>${escape(purpose.headline)}</h2><p>${escape(purpose.detail)}</p></div><button class="button secondary small" data-action="workspace">Change my goal</button></section><div class="simple-home-grid">
    <section class="panel home-next" aria-labelledby="next-task-title">
      <p class="small-print">Next task</p>
      <h2 id="next-task-title">${title}</h2>
      <p>${description}</p>
      <div class="home-next-actions"><button class="button primary" ${target}>${action}${icon('arrow')}</button>${state.mode === 'empty' ? '<button class="link-button" data-action="sample">Try an example</button>' : '<button class="link-button" data-view="results">View activity</button>'}<button class="link-button" data-action="ai-mode">Think it through with Pull AI</button></div>
    </section>
    <section class="panel home-overview" aria-labelledby="audience-overview-title">
      <h2 id="audience-overview-title">Audience overview</h2>
      <div class="home-metric"><strong>${count(items.length)}</strong><span>unique prospects${state.mode === 'example' ? ' · example data' : ''}</span></div>
      ${totals.map(([status, label, total]) => `<button class="overview-row" data-quality="${status}"><span class="legend ${status}" aria-hidden="true"></span><span>${label}</span><strong>${count(total)}</strong>${icon('arrow')}</button>`).join('')}
    </section>
  </div>
  <section class="panel home-activity" aria-labelledby="recent-activity-title">
    <div class="panel-head"><h2 id="recent-activity-title">Recent activity</h2>${activity.length ? '<button class="link-button" data-view="results">View all activity</button>' : ''}</div>
    ${activity.length ? `<ol class="activity-list">${activity.map(entry => `<li><span class="activity-symbol" aria-hidden="true">${icon('check')}</span><div><strong>${escape(entry.action)}</strong><p>${escape(entry.detail)}</p></div><span class="activity-time"><time datetime="${escape(entry.at)}">${escape(timestamp(entry.at))}</time><small>${entry.mode === 'example' ? 'Example data' : 'Workspace action'}</small></span></li>`).join('')}</ol>` : `<div class="home-activity-empty"><div><div class="empty-icon" aria-hidden="true">${icon('results')}</div><h3>No activity yet</h3><p>Imports, prospect reviews, and prepared drafts will appear here.</p></div></div>`}
  </section>
  ${state.setup ? `<section class="home-brief" aria-labelledby="business-brief-title"><div><h2 id="business-brief-title">${escape(state.identity)} · ${state.context === 'company' ? 'Company workspace' : 'Personal workspace'}</h2><p>${state.offer ? escape(state.offer) : 'Add a customer problem and the outcome your business offers.'}</p></div><button class="link-button" data-action="workspace">Edit workspace brief</button></section>` : ''}`;
}
