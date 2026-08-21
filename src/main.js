import './styles.css';

const networkNodes = [
  { id: 'north', type: 'supply', label: 'Northside Market', meta: '84 meal equivalents', x: 17, y: 30 },
  { id: 'oak', type: 'capacity', label: 'Oak Street Kitchen', meta: 'Open until 9:00 pm', x: 44, y: 19 },
  { id: 'harbor', type: 'demand', label: 'Harbor House', meta: 'Needs 120 dinners', x: 70, y: 38 },
  { id: 'east', type: 'logistics', label: 'Eastside volunteers', meta: '2 vans available', x: 32, y: 65 },
  { id: 'cedar', type: 'demand', label: 'Cedar Grove Shelter', meta: '18 beds open', x: 79, y: 72 },
  { id: 'common', type: 'supply', label: 'Common Table', meta: 'Meals ready at 6:15 pm', x: 57, y: 78 },
];

const markerMarkup = networkNodes
  .map(
    (node) => `
      <button class="map-node node-${node.type}" style="--node-x:${node.x}%;--node-y:${node.y}%" data-type="${node.type}" aria-label="${node.label}: ${node.meta}">
        <span class="node-pulse"></span>
        <span class="node-core"></span>
        <span class="node-tooltip"><strong>${node.label}</strong><small>${node.meta}</small></span>
      </button>`,
  )
  .join('');

const icon = (name) => {
  const paths = {
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m7 9 5 5 5-5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="1.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    heart: '<path d="M20.8 8.7c0 5.5-8.8 10.4-8.8 10.4S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    spark: '<path d="m12 3 1.5 6.5L20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5L12 3Z"/>',
    users: '<path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 20v-1.7a3.3 3.3 0 0 0-2.5-3.2M16.5 3.1a4 4 0 0 1 0 7.8"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.spark}</svg>`;
};

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="#top" aria-label="CareSpace home">
        <span class="brand-mark" aria-hidden="true"><span></span><i></i></span>
        <span class="brand-name">CareSpace</span>
      </a>

      <nav class="desktop-nav" aria-label="Main navigation">
        <a href="#network">Network</a>
        <a href="#how-it-works">How it works</a>
        <a href="#community">For organizations</a>
        <a href="#agents">For agents</a>
      </nav>

      <div class="header-actions">
        <a class="text-link header-about" href="#about">About <span>${icon('arrow')}</span></a>
        <button class="button button-small button-coral" type="button" data-report="resource">Share a resource ${icon('arrow')}</button>
      </div>
      <button class="menu-button" type="button" aria-label="Open navigation" aria-expanded="false" data-menu>${icon('menu')}</button>
    </header>

    <main id="top">
      <section class="hero section-pad">
        <div class="hero-copy" data-reveal>
          <p class="eyebrow"><span class="eyebrow-dot"></span> A coordination layer for community care</p>
          <h1>Food exists.<br /><em>Need exists.</em><br />CareSpace connects them.</h1>
          <p class="hero-intro">A living map of food, capacity, and people ready to help — so the next good thing can reach the right place in time.</p>
          <div class="hero-actions">
            <a class="button button-dark" href="#network">Find food ${icon('arrow')}</a>
            <button class="button button-outline" type="button" data-report="supply">Offer food ${icon('arrow')}</button>
          </div>
          <div class="hero-note"><span class="note-check">${icon('check')}</span><span>Built for people. Accessible to agents.</span></div>
        </div>

        <div class="hero-visual" data-reveal data-delay="120">
          <div class="hero-visual-topline"><span><i class="live-dot"></i> Live network</span><span class="topline-time">Updated just now</span></div>
          <div class="network-preview">
            <div class="preview-grid"></div>
            <div class="preview-route route-one"></div>
            <div class="preview-route route-two"></div>
            <div class="preview-route route-three"></div>
            <span class="preview-node preview-supply p-one"><b></b><small>84</small></span>
            <span class="preview-node preview-capacity p-two"><b></b><small>open</small></span>
            <span class="preview-node preview-demand p-three"><b></b><small>120</small></span>
            <span class="preview-node preview-logistics p-four"><b></b><small>2 vans</small></span>
            <div class="preview-center"><span class="center-ring"></span><strong>120</strong><small>meals in motion</small></div>
            <div class="preview-label label-one"><span class="tiny-key key-supply"></span>Food available</div>
            <div class="preview-label label-two"><span class="tiny-key key-demand"></span>Need reported</div>
          </div>
          <div class="preview-footer">
            <div><strong>87%</strong><span>of today’s signals<br />have a next step</span></div>
            <div class="preview-avatars"><span>AM</span><span>JR</span><span>+</span></div>
            <span class="preview-footer-caption">12 organizations active</span>
          </div>
        </div>
      </section>

      <section class="signal-strip" aria-label="CareSpace network highlights">
        <div class="signal-strip-inner section-pad">
          <span class="signal-label">Right now across the network</span>
          <div class="signal-item"><strong>3,240</strong><span>meals available</span></div>
          <div class="signal-item"><strong>18</strong><span>places need food</span></div>
          <div class="signal-item"><strong>42</strong><span>capacity openings</span></div>
          <div class="signal-item"><strong>9</strong><span>logistics teams ready</span></div>
          <span class="signal-live"><i class="live-dot"></i> updating live</span>
        </div>
      </section>

      <section class="network-section section-pad" id="network">
        <div class="section-heading network-heading" data-reveal>
          <div>
            <p class="eyebrow"><span class="eyebrow-number">01</span> The network</p>
            <h2>See what exists.<br /><span>See what can move.</span></h2>
          </div>
          <div class="heading-aside"><p>Community resources are always changing. CareSpace makes the changing picture visible — and gives each signal somewhere to go.</p><a class="text-link" href="#how-it-works">Learn the rhythm ${icon('arrow')}</a></div>
        </div>

        <div class="network-workspace" data-reveal data-delay="100">
          <div class="workspace-toolbar">
            <div class="toolbar-title"><span class="toolbar-icon">${icon('pin')}</span><div><strong>Central neighborhood</strong><small>Within 5 miles · 48 signals</small></div></div>
            <div class="map-filters" role="group" aria-label="Filter network signals">
              <button class="map-filter is-active" type="button" data-filter="all">All signals</button>
              <button class="map-filter" type="button" data-filter="supply"><span class="filter-dot dot-supply"></span>Food</button>
              <button class="map-filter" type="button" data-filter="demand"><span class="filter-dot dot-demand"></span>Need</button>
              <button class="map-filter" type="button" data-filter="capacity"><span class="filter-dot dot-capacity"></span>Capacity</button>
            </div>
            <button class="map-expand" type="button" data-report="resource" aria-label="Explore the network">Explore ${icon('arrow')}</button>
          </div>
          <div class="workspace-body">
            <div class="network-map" aria-label="Illustrated map of local CareSpace signals">
              <div class="map-water"></div><div class="map-road road-a"></div><div class="map-road road-b"></div><div class="map-road road-c"></div><div class="map-road road-d"></div>
              <div class="map-block block-a"></div><div class="map-block block-b"></div><div class="map-block block-c"></div><div class="map-block block-d"></div><div class="map-block block-e"></div><div class="map-block block-f"></div>
              <svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M17 30 C27 22 33 23 44 19 S60 30 70 38"/><path d="M32 65 C40 54 50 62 57 78 S70 80 79 72"/><path d="M44 19 C49 38 46 56 57 78"/></svg>
              ${markerMarkup}
              <div class="map-compass">N <span>↑</span></div>
              <div class="map-scale"><span></span><small>1 mile</small></div>
              <div class="map-status" id="mapStatus"><i class="live-dot"></i> Showing all 48 live signals</div>
            </div>
            <aside class="signal-panel" aria-label="Live network signals">
              <div class="panel-heading"><div><p class="panel-kicker">Live signals</p><h3>Where help can land</h3></div><span class="panel-count">06</span></div>
              <div class="signal-list">
                <button class="signal-card" type="button" data-focus="supply"><span class="signal-card-icon icon-supply">${icon('heart')}</span><span><strong>Meals ready</strong><small>Northside Market · 84 portions</small></span><span class="signal-card-arrow">${icon('arrow')}</span></button>
                <button class="signal-card" type="button" data-focus="demand"><span class="signal-card-icon icon-demand">${icon('users')}</span><span><strong>Dinner needed</strong><small>Harbor House · today by 7 pm</small></span><span class="signal-card-arrow">${icon('arrow')}</span></button>
                <button class="signal-card" type="button" data-focus="capacity"><span class="signal-card-icon icon-capacity">${icon('spark')}</span><span><strong>Kitchen open</strong><small>Oak Street · 2,400 sq ft free</small></span><span class="signal-card-arrow">${icon('arrow')}</span></button>
              </div>
              <div class="panel-footer"><span class="mini-avatar-stack"><i>AM</i><i>JR</i><i>SK</i></span><span>+ 9 more organizations are active</span></div>
            </aside>
          </div>
        </div>
      </section>

      <section class="how-section section-pad" id="how-it-works">
        <div class="section-heading compact-heading" data-reveal>
          <div><p class="eyebrow"><span class="eyebrow-number">02</span> The handoff</p><h2>From signal<br /><span>to shared action.</span></h2></div>
          <p class="heading-aside standalone">CareSpace turns a fragmented moment into a clear next step — for the people coordinating it and the people counting on it.</p>
        </div>
        <div class="steps-grid" data-reveal data-delay="100">
          <article class="step-card"><div class="step-top"><span class="step-number">01</span><span class="step-icon">${icon('arrowUp')}</span></div><h3>Report</h3><p>Share what you have, what you need, or where there’s room to help.</p><span class="step-caption">A clear signal beats a hidden resource.</span></article>
          <article class="step-card step-accent"><div class="step-top"><span class="step-number">02</span><span class="step-icon">${icon('spark')}</span></div><h3>Match</h3><p>CareSpace reads place, time, quantity, capacity, and fit together.</p><span class="step-caption">The right food. The right place. The right time.</span></article>
          <article class="step-card"><div class="step-top"><span class="step-number">03</span><span class="step-icon">${icon('arrow')}</span></div><h3>Move</h3><p>People and logistics teams see the next handoff and know what’s expected.</p><span class="step-caption">Less chasing. More moving.</span></article>
          <article class="step-card"><div class="step-top"><span class="step-number">04</span><span class="step-icon">${icon('check')}</span></div><h3>Confirm</h3><p>Close the loop, keep the network fresh, and make the next match smarter.</p><span class="step-caption">Every delivery improves the picture.</span></article>
        </div>
      </section>

      <section class="community-section section-pad" id="community">
        <div class="section-heading community-heading" data-reveal>
          <div><p class="eyebrow"><span class="eyebrow-number">03</span> Make a signal</p><h2>There’s a place<br /><span>for your yes.</span></h2></div>
          <p class="heading-aside standalone">Whether you’re holding extra meals, finding a safe landing place, or opening a door — your signal helps the network respond.</p>
        </div>
        <div class="community-grid" data-reveal data-delay="100">
          <article class="community-card card-food"><div class="card-orbit orbit-one"></div><div class="community-card-icon">${icon('heart')}</div><div class="card-copy"><p class="card-label">For food suppliers</p><h3>Turn extra into<br />a next meal.</h3><p>Restaurants, grocers, farms, and kitchens can share what’s ready and when it can move.</p><button class="text-button" type="button" data-report="supply">I have food ${icon('arrow')}</button></div><span class="card-index">A</span></article>
          <article class="community-card card-need"><div class="card-orbit orbit-two"></div><div class="community-card-icon">${icon('users')}</div><div class="card-copy"><p class="card-label">For recipient organizations</p><h3>Make the need<br />visible.</h3><p>Shelters, food banks, community kitchens, and mutual aid groups can report demand without exposing people.</p><button class="text-button" type="button" data-report="demand">I need food ${icon('arrow')}</button></div><span class="card-index">B</span></article>
          <article class="community-card card-capacity"><div class="card-orbit orbit-three"></div><div class="community-card-icon">${icon('spark')}</div><div class="card-copy"><p class="card-label">For capacity & logistics</p><h3>Open a door<br />for the handoff.</h3><p>Share refrigeration, kitchen hours, storage, vans, beds, volunteers, and the time you can help.</p><button class="text-button" type="button" data-report="capacity">I have capacity ${icon('arrow')}</button></div><span class="card-index">C</span></article>
        </div>
      </section>

      <section class="trust-section section-pad" id="about">
        <div class="trust-card" data-reveal>
          <div class="trust-visual"><div class="trust-circle circle-a"></div><div class="trust-circle circle-b"></div><div class="trust-circle circle-c"></div><span class="trust-visual-word">care<br />moves</span></div>
          <div class="trust-copy"><p class="eyebrow"><span class="eyebrow-number">04</span> A clearer map, a safer network</p><h2>Visibility without<br /><span>exposure.</span></h2><p>CareSpace maps organizations, resources, and community-level need — not the private details of the people being served.</p><div class="trust-points"><span>${icon('check')} Community-level signals</span><span>${icon('check')} Freshness & provenance</span><span>${icon('check')} Scoped access</span></div><a class="text-link light-link" href="#agents">Read the trust model ${icon('arrow')}</a></div>
        </div>
      </section>

      <section class="agents-section section-pad" id="agents">
        <div class="agents-copy" data-reveal><p class="eyebrow"><span class="eyebrow-number">05</span> Built for people. Accessible to agents.</p><h2>Let the network<br /><em>stay in sync.</em></h2><p>CareSpace is designed as a coordination layer, not a closed directory. People can use the interface. Authorized agents can discover capabilities, report signals, and search for matches through a clear API.</p><a class="button button-dark" href="/capabilities.json" target="_blank" rel="noreferrer">View capabilities ${icon('arrow')}</a></div>
        <div class="api-card" data-reveal data-delay="120"><div class="api-topbar"><span><i></i><i></i><i></i></span><span class="api-label">care-space / public capability</span><button class="copy-button" type="button" data-copy aria-label="Copy API example">${icon('copy')} <span>Copy</span></button></div><pre><code><span class="code-comment">// discover what the network can do</span>
<span class="code-method">GET</span> <span class="code-path">/api/v1/capabilities</span>

{
  <span class="code-key">"service"</span>: <span class="code-string">"CareSpace"</span>,
  <span class="code-key">"version"</span>: <span class="code-string">"1.0"</span>,
  <span class="code-key">"can"</span>: [
    <span class="code-string">"discover"</span>,
    <span class="code-string">"report"</span>,
    <span class="code-string">"match"</span>
  ]
}</code></pre><div class="api-footer"><span><i class="live-dot"></i> Accessible by declaration</span><span>Scoped credentials · human confirmation</span></div></div>
      </section>

      <section class="impact-section section-pad">
        <div class="impact-inner" data-reveal><div><p class="eyebrow eyebrow-light"><span class="eyebrow-number">06</span> The measure of a match</p><h2>Good coordination<br /><span>leaves a trace.</span></h2></div><div class="impact-metrics"><div><strong>120</strong><span>meals redirected<br />in one example match</span></div><div><strong>14m</strong><span>from report to<br />a proposed next step</span></div><div><strong>1</strong><span>shared picture<br />for the whole network</span></div></div></div>
      </section>

      <section class="final-cta section-pad" data-reveal>
        <div class="final-cta-mark"><span></span><i></i></div><p class="eyebrow">Start where you are</p><h2>The next meal is<br /><em>already somewhere.</em></h2><p>Help it find its next place.</p><div class="final-actions"><button class="button button-coral" type="button" data-report="resource">Share a resource ${icon('arrow')}</button><a class="button button-outline" href="#network">Explore the network ${icon('arrow')}</a></div>
      </section>
    </main>

    <footer class="site-footer section-pad">
      <div class="footer-top"><a class="brand footer-brand" href="#top"><span class="brand-mark" aria-hidden="true"><span></span><i></i></span><span class="brand-name">CareSpace</span></a><p>Food, need, capacity, and logistics<br />in the same room.</p><div class="footer-links"><a href="#network">Network</a><a href="#community">Organizations</a><a href="#agents">Developers</a><a href="#about">About</a></div></div>
      <div class="footer-bottom"><span>© <span data-year></span> CareSpace</span><span>Carefully coordinated on <a href="https://heurchain.com" target="_blank" rel="noreferrer">HeurChain</a></span><span>Privacy is part of the product.</span></div>
    </footer>
  </div>

  <div class="modal-layer" hidden data-modal-layer>
    <div class="modal-backdrop" data-close-modal></div>
    <section class="report-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button class="modal-close" type="button" aria-label="Close dialog" data-close-modal>${icon('close')}</button>
      <div class="modal-content" data-modal-content></div>
    </section>
  </div>
  <div class="sr-only" aria-live="polite" data-live-announcement></div>
`;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const modalLayer = $('[data-modal-layer]');
const modalContent = $('[data-modal-content]');
const announcement = $('[data-live-announcement]');

const reportCopy = {
  resource: {
    kicker: 'Join the living network',
    title: 'What can CareSpace help move?',
    intro: 'Choose the signal that best describes your next step. This first revision is a guided doorway into the network.',
    options: [
      ['supply', 'I have food', 'Meals, groceries, produce, or ingredients ready to share'],
      ['demand', 'I need food', 'A community-level need at a shelter, pantry, kitchen, or program'],
      ['capacity', 'I have capacity', 'Storage, kitchen time, transportation, beds, or volunteers'],
    ],
  },
  supply: { kicker: 'Make food visible', title: 'I have food to share.', intro: 'Tell the network what is ready, where it can be picked up, and when the window closes.', fields: ['What is available?', 'Where is it?', 'When can it move?'] },
  demand: { kicker: 'Make the need visible', title: 'I need food for a community.', intro: 'Share the size and timing of the need without sharing private information about the people you serve.', fields: ['What is needed?', 'Where should it land?', 'When is it needed?'] },
  capacity: { kicker: 'Open a door', title: 'I have capacity to help.', intro: 'Let the network know what kind of space, transport, or time is available.', fields: ['What can you offer?', 'Where is it?', 'When is it open?'] },
};

function fieldMarkup(label, index) {
  const inputId = `report-field-${index}`;
  return `<label class="form-field" for="${inputId}"><span>${label}</span><input id="${inputId}" name="field-${index}" type="text" placeholder="Add a detail" required /></label>`;
}

function renderModal(kind) {
  const copy = reportCopy[kind] ?? reportCopy.resource;
  if (copy.options) {
    modalContent.innerHTML = `<p class="eyebrow">${copy.kicker}</p><h2 id="modal-title">${copy.title}</h2><p class="modal-intro">${copy.intro}</p><div class="modal-options">${copy.options.map(([value, title, detail]) => `<button class="modal-option" type="button" data-report="${value}"><span class="modal-option-icon icon-${value}">${icon(value === 'supply' ? 'heart' : value === 'demand' ? 'users' : 'spark')}</span><span><strong>${title}</strong><small>${detail}</small></span><span class="signal-card-arrow">${icon('arrow')}</span></button>`).join('')}</div>`;
    return;
  }
  modalContent.innerHTML = `<p class="eyebrow">${copy.kicker}</p><h2 id="modal-title">${copy.title}</h2><p class="modal-intro">${copy.intro}</p><form class="report-form" data-report-form><div class="form-grid">${copy.fields.map(fieldMarkup).join('')}</div><label class="form-consent"><input type="checkbox" required /><span>I’m sharing an organization-level signal, not private information about an individual.</span></label><button class="button button-dark form-submit" type="submit">Preview my signal ${icon('arrow')}</button><p class="form-footnote">No account required for this prototype. Your details stay in this browser.</p></form>`;
}

function openModal(kind = 'resource') {
  renderModal(kind);
  modalLayer.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => $('.modal-option, .report-form input', modalLayer)?.focus(), 0);
}

function closeModal() {
  modalLayer.hidden = true;
  document.body.classList.remove('modal-open');
}

function announce(message) {
  announcement.textContent = message;
  setTimeout(() => {
    announcement.textContent = '';
  }, 4000);
}

function setMapFilter(filter) {
  $$('.map-filter').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === filter));
  $$('.map-node').forEach((node) => {
    const isVisible = filter === 'all' || node.dataset.type === filter || (filter === 'capacity' && node.dataset.type === 'logistics');
    node.classList.toggle('is-muted', !isVisible);
  });
  const copy = filter === 'all' ? 'Showing all 48 live signals' : `Showing ${filter === 'supply' ? 'food available' : filter === 'demand' ? 'community need' : 'capacity and logistics'} signals`;
  $('#mapStatus').innerHTML = `<i class="live-dot"></i> ${copy}`;
  announce(copy);
}

$$('[data-report]').forEach((element) => {
  element.addEventListener('click', (event) => {
    event.preventDefault();
    openModal(element.dataset.report);
  });
});

$$('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modalLayer.hidden) closeModal();
});

modalLayer.addEventListener('click', (event) => {
  const option = event.target.closest('[data-report]');
  if (!option || option.closest('[data-close-modal]')) return;
  event.preventDefault();
  openModal(option.dataset.report);
});

modalLayer.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-report-form]')) return;
  event.preventDefault();
  modalContent.innerHTML = `<div class="success-state"><span class="success-icon">${icon('check')}</span><p class="eyebrow">Signal drafted</p><h2>Your next step is visible.</h2><p>In the live CareSpace network, this signal would now be checked for fit, time, capacity, and a possible handoff.</p><button class="button button-dark" type="button" data-close-modal>Back to the network ${icon('arrow')}</button></div>`;
  announce('Your CareSpace signal has been drafted.');
  modalContent.querySelector('[data-close-modal]').addEventListener('click', closeModal);
});

$$('[data-filter]').forEach((button) => button.addEventListener('click', () => setMapFilter(button.dataset.filter)));
$$('[data-focus]').forEach((button) => {
  button.addEventListener('click', () => {
    setMapFilter(button.dataset.focus === 'capacity' ? 'capacity' : button.dataset.focus);
    $('#network').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

const menuButton = $('[data-menu]');
const desktopNav = $('.desktop-nav');
menuButton.addEventListener('click', () => {
  const isOpen = desktopNav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});
$$('.desktop-nav a').forEach((link) => link.addEventListener('click', () => {
  desktopNav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const apiExample = `GET /api/v1/capabilities\n\n{\n  "service": "CareSpace",\n  "version": "1.0",\n  "can": ["discover", "report", "match"]\n}`;
$('[data-copy]').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(apiExample);
    $('[data-copy]').innerHTML = `${icon('check')} <span>Copied</span>`;
    announce('API example copied to your clipboard.');
    setTimeout(() => {
      $('[data-copy]').innerHTML = `${icon('copy')} <span>Copy</span>`;
    }, 1800);
  } catch {
    announce('Copy is not available in this browser.');
  }
});

document.querySelector('[data-year]').textContent = new Date().getFullYear();

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 })
  : null;

$$('[data-reveal]').forEach((element) => {
  const delay = element.dataset.delay;
  if (delay) element.style.setProperty('--reveal-delay', `${delay}ms`);
  if (revealObserver) revealObserver.observe(element);
  else element.classList.add('is-visible');
});

setInterval(() => {
  $$('.topline-time').forEach((element) => {
    element.textContent = 'Updated just now';
  });
}, 30000);
