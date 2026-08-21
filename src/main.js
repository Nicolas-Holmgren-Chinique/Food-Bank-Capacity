import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const fallbackNetworkData = {
  version: '1.0',
  schema: 'carespace.network',
  source: 'CareSpace demo network',
  scope: {
    type: 'COUNTY',
    geoid: '0500000US06073',
    fips: '06073',
    name: 'San Diego County, California',
    bounds: [[32.53, -117.60], [33.39, -116.08]],
    boundaryUrl: 'https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/State_County/MapServer/11/query?where=GEOID%3D%2706073%27&outFields=GEOID%2CNAME&outSR=4326&returnGeometry=true&f=geojson',
  },
  geography: {
    type: 'PUMA',
    vintage: 'demo',
    puma_geoid: 'DEMO-SD-PUMA-0001',
    name: 'San Diego County PUMA-ready demo area',
    parent: { type: 'COUNTY', geoid: '0500000US06073', name: 'San Diego County, California' },
  },
  focus: { latitude: 32.95, longitude: -117.12, zoom: 9 },
  signals: [
    {
      id: 'north',
      type: 'supply',
      label: 'Northside Market',
      meta: '84 meal equivalents',
      location: { latitude: 33.1192, longitude: -117.0864 },
    },
    {
      id: 'oak',
      type: 'capacity',
      label: 'Oak Street Kitchen',
      meta: 'Open until 9:00 pm',
      location: { latitude: 32.7157, longitude: -117.1611 },
    },
    {
      id: 'harbor',
      type: 'demand',
      label: 'Harbor House',
      meta: 'Needs 120 dinners',
      location: { latitude: 32.6401, longitude: -117.0842 },
    },
    {
      id: 'east',
      type: 'logistics',
      label: 'Eastside volunteers',
      meta: '2 vans available',
      location: { latitude: 32.7948, longitude: -116.9625 },
    },
    {
      id: 'cedar',
      type: 'demand',
      label: 'Cedar Grove Shelter',
      meta: '18 beds open',
      location: { latitude: 33.1959, longitude: -117.3795 },
    },
    {
      id: 'common',
      type: 'supply',
      label: 'Common Table',
      meta: 'Meals ready at 6:15 pm',
      location: { latitude: 32.6781, longitude: -117.0992 },
    },
  ],
};

const networkDataUrl = import.meta.env.VITE_NETWORK_DATA_URL || '/network-data.json';
let networkData = fallbackNetworkData;
let mapRuntime = null;

const fallbackDashboardData = {
  version: '1.0',
  schema: 'carespace.dashboard',
  source: 'CareSpace demo food access network',
  scope: fallbackNetworkData.scope,
  foodBanks: [
    {
      id: 'north-county-food-hub',
      name: 'North County Food Hub',
      area: 'Vista',
      kind: 'Food bank',
      status: 'Open today',
      hours: 'Until 6:00 pm',
      distanceMiles: 4.8,
      location: { latitude: 33.2007, longitude: -117.2425 },
      access: 'Walk-ins welcome · no referral required',
      inventory: [
        { category: 'Fresh produce', amount: '320 portions', note: 'Available today' },
        { category: 'Pantry staples', amount: '86 family boxes', note: 'Restock at 2:00 pm' },
        { category: 'Prepared meals', amount: '42 meals', note: 'Pickup by 5:30 pm' },
      ],
    },
    {
      id: 'central-care-food-bank',
      name: 'Central Care Food Bank',
      area: 'City Heights',
      kind: 'Food bank',
      status: 'Open today',
      hours: 'Until 7:00 pm',
      distanceMiles: 7.2,
      location: { latitude: 32.7481, longitude: -117.1014 },
      access: 'Walk-ins welcome · multilingual intake',
      inventory: [
        { category: 'Grocery boxes', amount: '124 boxes', note: 'Available today' },
        { category: 'Fresh produce', amount: '210 portions', note: 'Best before tomorrow' },
        { category: 'Baby essentials', amount: '18 kits', note: 'Ask at intake' },
      ],
      isDemoUserFoodBank: true,
    },
    {
      id: 'south-bay-pantry',
      name: 'South Bay Community Pantry',
      area: 'National City',
      kind: 'Community pantry',
      status: 'Open tomorrow',
      hours: '9:00 am – 4:00 pm',
      distanceMiles: 9.6,
      location: { latitude: 32.6781, longitude: -117.0992 },
      access: 'Appointment preferred · same-day help available',
      inventory: [
        { category: 'Pantry staples', amount: '64 family boxes', note: 'Limited supply' },
        { category: 'Culturally specific foods', amount: '38 boxes', note: 'Available tomorrow' },
        { category: 'Prepared meals', amount: '76 meals', note: 'Pickup after 4:00 pm' },
      ],
    },
    {
      id: 'east-county-table',
      name: 'East County Community Table',
      area: 'El Cajon',
      kind: 'Food distribution site',
      status: 'Open today',
      hours: 'Until 5:00 pm',
      distanceMiles: 12.4,
      location: { latitude: 32.7948, longitude: -116.9625 },
      access: 'Drive-through and walk-up service',
      inventory: [
        { category: 'Grocery boxes', amount: '92 boxes', note: 'Available today' },
        { category: 'Fresh produce', amount: '140 portions', note: 'Available today' },
        { category: 'Cold storage items', amount: '24 crates', note: 'Pickup by 4:30 pm' },
      ],
    },
  ],
};

const dashboardDataUrl = import.meta.env.VITE_DASHBOARD_DATA_URL || '/dashboard-data.json';
let dashboardData = fallbackDashboardData;
let dashboardRole = 'need';
let selectedFoodBankId = fallbackDashboardData.foodBanks[0].id;
let dashboardRuntime = null;

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
        <a href="#dashboard">Dashboard</a>
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
            <div class="toolbar-title"><span class="toolbar-icon">${icon('pin')}</span><div><strong id="networkFocusName">San Diego County</strong><small id="networkFocusMeta">Loading county signals…</small></div></div>
            <div class="map-filters" role="group" aria-label="Filter network signals">
              <button class="map-filter is-active" type="button" data-filter="all">All signals</button>
              <button class="map-filter" type="button" data-filter="supply"><span class="filter-dot dot-supply"></span>Food</button>
              <button class="map-filter" type="button" data-filter="demand"><span class="filter-dot dot-demand"></span>Need</button>
              <button class="map-filter" type="button" data-filter="capacity"><span class="filter-dot dot-capacity"></span>Capacity</button>
            </div>
            <button class="map-expand" type="button" data-report="resource" aria-label="Explore the network">Explore ${icon('arrow')}</button>
          </div>
          <div class="workspace-body">
            <div class="network-map live-map-shell" aria-label="Interactive map of San Diego County CareSpace signals">
              <div class="live-map" id="liveMap"></div>
              <div class="map-compass">N <span>↑</span></div>
              <div class="map-provider-badge" id="mapProviderBadge">Live map · loading</div>
              <div class="map-status" id="mapStatus"><i class="live-dot"></i> Loading live signals…</div>
            </div>
            <aside class="signal-panel" aria-label="Live network signals">
              <div class="panel-heading"><div><p class="panel-kicker">Live signals</p><h3>Where help can land</h3></div><span class="panel-count" data-panel-count>06</span></div>
              <div class="signal-list" data-signal-list></div>
              <div class="panel-footer"><span class="mini-avatar-stack"><i>AM</i><i>JR</i><i>SK</i></span><span data-panel-footer>+ 3 more organizations are active</span></div>
            </aside>
          </div>
        </div>
      </section>

      <section class="dashboard-section section-pad" id="dashboard">
        <div class="section-heading dashboard-heading" data-reveal>
          <div><p class="eyebrow"><span class="eyebrow-number">Your view</span> A personal doorway into the network</p><h2>Find food.<br /><span>Know what’s there.</span></h2></div>
          <p class="heading-aside standalone">A simple dashboard for people looking for food and the organizations making food available.</p>
        </div>

        <div class="dashboard-shell" data-reveal data-delay="100">
          <div class="dashboard-gate" data-dashboard-gate>
            <div class="dashboard-login-card">
              <div class="dashboard-login-mark"><span>${icon('pin')}</span></div>
              <p class="eyebrow">Demo access</p>
              <h3>Open your CareSpace dashboard.</h3>
              <p class="dashboard-login-intro">Choose the view that fits you. This prototype does not transmit or store credentials; production sign-in will connect here to the approved auth provider.</p>
              <div class="dashboard-role-switch" role="group" aria-label="Choose your dashboard role">
                <button type="button" class="dashboard-role is-active" data-demo-role="need">I need food</button>
                <button type="button" class="dashboard-role" data-demo-role="food-bank">I run a food bank</button>
              </div>
              <form class="dashboard-login-form" data-dashboard-login>
                <label class="dashboard-email-field"><span>Email for demo access</span><input type="email" name="email" placeholder="you@example.org" autocomplete="email" required /></label>
                <button class="button button-dark" type="submit" data-dashboard-submit>Enter as a person in need ${icon('arrow')}</button>
              </form>
              <p class="dashboard-login-footnote">No account required for this demo · organization-level data only</p>
            </div>
            <div class="dashboard-login-aside"><span class="dashboard-aside-number">01</span><p><strong>For people in need</strong><br />See food banks, pantry hours, access notes, and available inventory near you.</p><p><strong>For food banks</strong><br />See your inventory alongside nearby handoff partners and community demand.</p></div>
          </div>

          <div class="dashboard-app" data-dashboard-app hidden>
            <div class="dashboard-appbar"><div><span class="dashboard-pill" data-dashboard-role-pill>Person in need</span><h3 data-dashboard-title>Find food near you</h3><p data-dashboard-subtitle>Live food access across San Diego County.</p></div><button class="dashboard-signout" type="button" data-dashboard-logout>Sign out ${icon('arrow')}</button></div>
            <div class="dashboard-layout">
              <section class="dashboard-map-card" aria-label="Nearby food access">
                <div class="dashboard-card-heading"><div><p class="panel-kicker">Nearby food access</p><h4>What can land near you?</h4></div><span class="dashboard-live-label"><i class="live-dot"></i> Live feed</span></div>
                <div class="dashboard-location-bar"><label for="dashboard-location">Search within</label><input id="dashboard-location" data-dashboard-location value="San Diego County" /><button type="button" class="location-button" data-use-location aria-label="Use my location">${icon('pin')}</button></div>
                <div class="dashboard-map" id="dashboardMap" aria-label="Map of nearby food banks in San Diego County"><div class="dashboard-map-status" data-dashboard-map-status>Loading food access…</div></div>
                <p class="dashboard-map-footnote"><span>${icon('pin')} County scope</span><span>Approximate locations protect privacy</span></p>
              </section>
              <aside class="dashboard-results-card" aria-label="Nearby food locations"><div class="dashboard-card-heading"><div><p class="panel-kicker">Available nearby</p><h4>Food locations</h4></div><span class="panel-count" data-dashboard-result-count>04</span></div><div class="dashboard-results" data-dashboard-results></div></aside>
            </div>
            <section class="dashboard-inventory-card" data-dashboard-inventory aria-label="Food inventory overview"></section>
            <div class="dashboard-privacy-note">${icon('check')} Location stays at the county and service-area level in this demo. No individual need or case details are shown.</div>
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
      <div class="footer-top"><a class="brand footer-brand" href="#top"><span class="brand-mark" aria-hidden="true"><span></span><i></i></span><span class="brand-name">CareSpace</span></a><p>Food, need, capacity, and logistics<br />in the same room.</p><div class="footer-links"><a href="#network">Network</a><a href="#dashboard">Dashboard</a><a href="#community">Organizations</a><a href="#agents">Developers</a><a href="#about">About</a></div></div>
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function signalCoordinates(signal) {
  const latitude = Number(signal.location?.latitude);
  const longitude = Number(signal.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [latitude, longitude];
}

function serviceAreaBounds() {
  const bounds = networkData.scope?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  const [[south, west], [north, east]] = bounds.map((corner) => (Array.isArray(corner) ? corner.map(Number) : []));
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south >= north || west >= east) return null;
  return [[south, west], [north, east]];
}

function signalWithinScope(signal) {
  const coordinates = signalCoordinates(signal);
  if (!coordinates) return false;
  const bounds = serviceAreaBounds();
  if (!bounds) return true;
  const [[south, west], [north, east]] = bounds;
  const [latitude, longitude] = coordinates;
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}

function signalMatchesFilter(signal, filter) {
  return filter === 'all' || signal.type === filter || (filter === 'capacity' && signal.type === 'logistics');
}

function visibleSignals(filter) {
  return (networkData.signals ?? []).filter((signal) => signalWithinScope(signal) && signalMatchesFilter(signal, filter));
}

function signalIconName(type) {
  if (type === 'supply') return 'heart';
  if (type === 'demand') return 'users';
  return 'spark';
}

function signalIconClass(type) {
  if (type === 'supply') return 'icon-supply';
  if (type === 'demand') return 'icon-demand';
  return 'icon-capacity';
}

function renderSignalPanel(filter) {
  const list = $('[data-signal-list]');
  if (!list) return;

  const signals = visibleSignals(filter);
  const cards = signals.slice(0, 3);
  list.innerHTML = cards.length
    ? cards.map((signal) => `
      <button class="signal-card" type="button" data-focus="${escapeHtml(signal.id)}">
        <span class="signal-card-icon ${signalIconClass(signal.type)}">${icon(signalIconName(signal.type))}</span>
        <span><strong>${escapeHtml(signal.label)}</strong><small>${escapeHtml(signal.meta)}</small></span>
        <span class="signal-card-arrow">${icon('arrow')}</span>
      </button>`).join('')
    : '<p class="signal-empty">No signals match this filter yet.</p>';

  const count = $('[data-panel-count]');
  if (count) count.textContent = String(signals.length).padStart(2, '0');

  const footer = $('[data-panel-footer]');
  if (footer) {
    const remaining = Math.max(signals.length - cards.length, 0);
    footer.textContent = remaining ? `+ ${remaining} more signals are active` : 'Select a signal to inspect its location';
  }
}

function createSignalMarker(signal) {
  const coordinates = signalCoordinates(signal);
  if (!coordinates) return null;

  const marker = L.marker(coordinates, {
    icon: L.divIcon({
      className: `carespace-marker marker-${signal.type}`,
      html: '<span class="carespace-marker-pulse"></span><span class="carespace-marker-core"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -15],
    }),
    title: `${signal.label}: ${signal.meta}`,
  });

  const puma = signal.puma ?? networkData.geography;
  const pumaLabel = puma?.name ? `<small>PUMA area · ${escapeHtml(puma.name)}</small>` : '';
  marker.bindPopup(`
    <div class="map-popup">
      <strong>${escapeHtml(signal.label)}</strong>
      <span>${escapeHtml(signal.meta)}</span>
      ${pumaLabel}
    </div>`, { closeButton: false });
  return marker;
}

function createBoundaryLayer(map, boundary) {
  return L.geoJSON(boundary, {
    interactive: false,
    style: {
      color: '#4c9fa1',
      fillColor: '#b4e4bc',
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: '5 5',
    },
  }).addTo(map);
}

async function loadServiceAreaBoundaryLayer(map) {
  const boundary = networkData.scope?.boundary ?? networkData.geography?.boundary;
  if (boundary) return createBoundaryLayer(map, boundary);

  const boundaryUrl = networkData.scope?.boundaryUrl ?? networkData.geography?.boundaryUrl;
  if (!boundaryUrl) return null;

  try {
    const response = await fetch(boundaryUrl, { headers: { Accept: 'application/geo+json, application/json' } });
    if (!response.ok) throw new Error(`Boundary feed returned ${response.status}`);
    return createBoundaryLayer(map, await response.json());
  } catch (error) {
    console.warn('CareSpace service-area boundary unavailable; using county bounds.', error);
    return null;
  }
}

function setMapFilter(filter) {
  $$('.map-filter').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === filter));
  const signals = visibleSignals(filter);
  if (mapRuntime) {
    mapRuntime.markerLayer.clearLayers();
    mapRuntime.markers.clear();
    signals.forEach((signal) => {
      const marker = createSignalMarker(signal);
      if (!marker) return;
      mapRuntime.markers.set(signal.id, marker);
      marker.addTo(mapRuntime.markerLayer);
    });
  }

  renderSignalPanel(filter);
  const copy = filter === 'all'
    ? `Showing all ${signals.length} live signals`
    : `Showing ${signals.length} ${filter === 'supply' ? 'food available' : filter === 'demand' ? 'community need' : 'capacity and logistics'} signals`;
  const sourceNote = mapRuntime?.isFallback ? ' · demo feed' : '';
  $('#mapStatus').innerHTML = `<i class="live-dot"></i> ${copy}${sourceNote}`;
  announce(copy);
}

async function loadNetworkData() {
  const response = await fetch(networkDataUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Network feed returned ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.signals)) throw new Error('Network feed has no signals array');
  return { ...fallbackNetworkData, ...payload, signals: payload.signals };
}

async function initializeLiveMap() {
  const mapElement = $('#liveMap');
  if (!mapElement) return;

  let isFallback = false;
  try {
    networkData = await loadNetworkData();
  } catch (error) {
    isFallback = true;
    networkData = fallbackNetworkData;
    console.warn('CareSpace network feed unavailable; showing demo signals.', error);
  }

  const focus = networkData.focus ?? fallbackNetworkData.focus;
  const latitude = Number(focus.latitude) || fallbackNetworkData.focus.latitude;
  const longitude = Number(focus.longitude) || fallbackNetworkData.focus.longitude;
  const zoom = Number(focus.zoom) || fallbackNetworkData.focus.zoom;
  const bounds = serviceAreaBounds();

  try {
    const map = L.map(mapElement, {
      center: [latitude, longitude],
      zoom,
      minZoom: bounds ? 8 : 10,
      maxBounds: bounds ? L.latLngBounds(bounds) : undefined,
      maxBoundsViscosity: bounds ? 1 : undefined,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
      detectRetina: true,
    }).addTo(map);
    L.control.scale({ imperial: true, metric: false, position: 'bottomleft' }).addTo(map);
    const markerLayer = L.layerGroup().addTo(map);
    mapRuntime = {
      map,
      isFallback,
      scopeBounds: bounds,
      boundaryLayer: null,
      markerLayer,
      markers: new Map(),
    };

    const name = networkData.scope?.name || networkData.geography?.name || 'Service area';
    const type = networkData.geography?.type || 'local';
    $('#networkFocusName').textContent = name;
    $('#networkFocusMeta').textContent = `${visibleSignals('all').length} signals · ${type} ready`;
    $('#mapProviderBadge').textContent = `${name} · ${type}-ready`;
    setMapFilter('all');
    void loadServiceAreaBoundaryLayer(map).then((boundaryLayer) => {
      if (mapRuntime?.map === map) mapRuntime.boundaryLayer = boundaryLayer;
    });
    requestAnimationFrame(() => map.invalidateSize());
  } catch (error) {
    console.error('CareSpace map could not initialize.', error);
    mapElement.innerHTML = '<div class="map-error">The live map is unavailable right now. The network feed is still available in <a href="/network-data.json" target="_blank" rel="noreferrer">JSON format</a>.</div>';
    $('#mapStatus').innerHTML = '<i class="live-dot"></i> Network feed available';
  }
}

function dashboardScopeBounds() {
  const bounds = dashboardData.scope?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  const [[south, west], [north, east]] = bounds.map((corner) => (Array.isArray(corner) ? corner.map(Number) : []));
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south >= north || west >= east) return null;
  return [[south, west], [north, east]];
}

function foodBanksInScope() {
  const bounds = dashboardScopeBounds();
  return (dashboardData.foodBanks ?? []).filter((foodBank) => {
    const coordinates = signalCoordinates(foodBank);
    if (!coordinates || !bounds) return Boolean(coordinates);
    const [[south, west], [north, east]] = bounds;
    const [latitude, longitude] = coordinates;
    return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
  });
}

function dashboardSearchResults() {
  const query = $('[data-dashboard-location]')?.value.trim().toLowerCase() || '';
  const banks = foodBanksInScope();
  if (!query || query === 'san diego county' || query === 'near me') return banks;
  return banks.filter((foodBank) => `${foodBank.name} ${foodBank.area} ${foodBank.kind}`.toLowerCase().includes(query));
}

function createDashboardMarker(foodBank) {
  const coordinates = signalCoordinates(foodBank);
  if (!coordinates) return null;
  const marker = L.marker(coordinates, {
    icon: L.divIcon({
      className: 'carespace-marker marker-supply dashboard-marker',
      html: '<span class="carespace-marker-pulse"></span><span class="carespace-marker-core"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -15],
    }),
    title: `${foodBank.name} · ${foodBank.area}`,
  });
  marker.bindPopup(`
    <div class="map-popup">
      <strong>${escapeHtml(foodBank.name)}</strong>
      <span>${escapeHtml(foodBank.area)} · ${escapeHtml(foodBank.status)}</span>
      <small>${escapeHtml(foodBank.hours)}</small>
    </div>`, { closeButton: false });
  return marker;
}

function renderDashboardMarkers() {
  if (!dashboardRuntime) return;
  const visibleIds = new Set(dashboardSearchResults().map((foodBank) => foodBank.id));
  dashboardRuntime.markerLayer.clearLayers();
  dashboardRuntime.markers.clear();
  foodBanksInScope().forEach((foodBank) => {
    const marker = createDashboardMarker(foodBank);
    if (!marker) return;
    marker.setOpacity(visibleIds.has(foodBank.id) ? 1 : 0.22);
    dashboardRuntime.markers.set(foodBank.id, marker);
    marker.addTo(dashboardRuntime.markerLayer);
  });
}

function renderDashboardResults() {
  const list = $('[data-dashboard-results]');
  if (!list) return;
  const results = dashboardSearchResults();
  list.innerHTML = results.length
    ? results.map((foodBank) => `
      <button class="dashboard-result" type="button" data-food-bank="${escapeHtml(foodBank.id)}">
        <span class="dashboard-result-icon">${icon('heart')}</span>
        <span class="dashboard-result-copy"><strong>${escapeHtml(foodBank.name)}</strong><small>${escapeHtml(foodBank.area)} · ${escapeHtml(foodBank.kind)}</small><em>${escapeHtml(foodBank.access)}</em></span>
        <span class="dashboard-result-meta"><b>${escapeHtml(String(foodBank.distanceMiles))} mi</b><small>${escapeHtml(foodBank.status)}</small></span>
      </button>`).join('')
    : '<p class="dashboard-empty">No food locations match that search yet. Try another San Diego County city.</p>';
  const count = $('[data-dashboard-result-count]');
  if (count) count.textContent = String(results.length).padStart(2, '0');
}

function renderDashboardInventory() {
  const container = $('[data-dashboard-inventory]');
  if (!container) return;
  const foodBanks = foodBanksInScope();
  const selected = dashboardRole === 'food-bank'
    ? foodBanks.find((foodBank) => foodBank.isDemoUserFoodBank) ?? foodBanks[0]
    : foodBanks.find((foodBank) => foodBank.id === selectedFoodBankId) ?? foodBanks[0];
  if (!selected) {
    container.innerHTML = '<p class="dashboard-empty">Inventory will appear when food access data is available.</p>';
    return;
  }

  const title = dashboardRole === 'food-bank' ? 'Your inventory' : `Inventory at ${escapeHtml(selected.name)}`;
  const intro = dashboardRole === 'food-bank'
    ? 'Keep today’s available food visible to people and partners nearby.'
    : `${escapeHtml(selected.status)} · ${escapeHtml(selected.hours)} · ${escapeHtml(selected.access)}`;
  const action = dashboardRole === 'food-bank'
    ? `<button class="text-button" type="button" data-dashboard-report>Update inventory ${icon('arrow')}</button>`
    : `<button class="text-button" type="button" data-dashboard-request="${escapeHtml(selected.id)}">Request help from this location ${icon('arrow')}</button>`;
  container.innerHTML = `
    <div class="dashboard-inventory-heading"><div><p class="panel-kicker">${dashboardRole === 'food-bank' ? 'Operator view' : 'Food available'}</p><h4>${title}</h4><p>${intro}</p></div>${action}</div>
    <div class="dashboard-inventory-list">${(selected.inventory ?? []).map((item) => `<div class="dashboard-inventory-row"><span class="inventory-spark">${icon('spark')}</span><span><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.note)}</small></span><b>${escapeHtml(item.amount)}</b></div>`).join('')}</div>`;
}

function focusDashboardFoodBank(id) {
  const foodBank = foodBanksInScope().find((candidate) => candidate.id === id);
  if (!foodBank) return;
  selectedFoodBankId = foodBank.id;
  renderDashboardInventory();
  const coordinates = signalCoordinates(foodBank);
  const marker = dashboardRuntime?.markers.get(foodBank.id);
  if (dashboardRuntime?.map && coordinates) {
    dashboardRuntime.map.setView(coordinates, Math.max(dashboardRuntime.map.getZoom(), 12), { animate: true });
    marker?.openPopup();
  }
}

function initializeDashboardMap() {
  const mapElement = $('#dashboardMap');
  if (!mapElement || dashboardRuntime) return;
  const center = dashboardData.scope?.center ?? { latitude: 32.95, longitude: -117.12, zoom: 9 };
  const bounds = dashboardScopeBounds();
  const map = L.map(mapElement, {
    center: [Number(center.latitude), Number(center.longitude)],
    zoom: Number(center.zoom) || 9,
    minZoom: bounds ? 8 : 10,
    maxBounds: bounds ? L.latLngBounds(bounds) : undefined,
    maxBoundsViscosity: bounds ? 1 : undefined,
    zoomControl: true,
    scrollWheelZoom: false,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
    detectRetina: true,
  }).addTo(map);
  L.control.scale({ imperial: true, metric: false, position: 'bottomleft' }).addTo(map);
  dashboardRuntime = { map, boundaryLayer: null, markerLayer: L.layerGroup().addTo(map), markers: new Map() };
  renderDashboardMarkers();
  void loadServiceAreaBoundaryLayer(map).then((boundaryLayer) => {
    if (dashboardRuntime?.map === map) dashboardRuntime.boundaryLayer = boundaryLayer;
  });
  requestAnimationFrame(() => map.invalidateSize());
}

function renderDashboard() {
  const isFoodBank = dashboardRole === 'food-bank';
  $('[data-dashboard-role-pill]').textContent = isFoodBank ? 'Food bank operator' : 'Person in need';
  $('[data-dashboard-title]').textContent = isFoodBank ? 'Keep your inventory visible' : 'Find food near you';
  $('[data-dashboard-subtitle]').textContent = isFoodBank
    ? 'See your inventory and nearby partners across San Diego County.'
    : 'See open food banks, access notes, and available inventory across San Diego County.';
  $('[data-dashboard-map-status]').textContent = `${foodBanksInScope().length} food locations in San Diego County`;
  renderDashboardResults();
  renderDashboardInventory();
  renderDashboardMarkers();
}

async function loadDashboardData() {
  const response = await fetch(dashboardDataUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Dashboard feed returned ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.foodBanks)) throw new Error('Dashboard feed has no foodBanks array');
  return { ...fallbackDashboardData, ...payload, scope: { ...fallbackDashboardData.scope, ...payload.scope }, foodBanks: payload.foodBanks };
}

function setDashboardRole(role) {
  dashboardRole = role === 'food-bank' ? 'food-bank' : 'need';
  selectedFoodBankId = dashboardRole === 'food-bank'
    ? (dashboardData.foodBanks.find((foodBank) => foodBank.isDemoUserFoodBank)?.id ?? dashboardData.foodBanks[0]?.id)
    : dashboardData.foodBanks[0]?.id;
  $$('[data-demo-role]').forEach((button) => button.classList.toggle('is-active', button.dataset.demoRole === dashboardRole));
  const submit = $('[data-dashboard-submit]');
  if (submit) submit.innerHTML = `${dashboardRole === 'food-bank' ? 'Enter as a food bank' : 'Enter as a person in need'} ${icon('arrow')}`;
}

async function enterDashboard() {
  const gate = $('[data-dashboard-gate]');
  const dashboardApp = $('[data-dashboard-app]');
  gate.hidden = true;
  dashboardApp.hidden = false;
  dashboardApp.classList.add('is-loading');
  try {
    dashboardData = await loadDashboardData();
  } catch (error) {
    dashboardData = fallbackDashboardData;
    console.warn('CareSpace dashboard feed unavailable; showing demo inventory.', error);
  }
  setDashboardRole(dashboardRole);
  initializeDashboardMap();
  renderDashboard();
  dashboardApp.classList.remove('is-loading');
  announce(`${dashboardRole === 'food-bank' ? 'Food bank' : 'Person in need'} dashboard opened.`);
  requestAnimationFrame(() => dashboardRuntime?.map.invalidateSize());
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
$('[data-signal-list]').addEventListener('click', (event) => {
  const button = event.target.closest('[data-focus]');
  if (!button) return;
  const signal = networkData.signals.find((candidate) => candidate.id === button.dataset.focus);
  if (!signal) return;

  const filter = signal.type === 'logistics' ? 'capacity' : signal.type;
  setMapFilter(filter);
  $('#network').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const coordinates = signalCoordinates(signal);
  const marker = mapRuntime?.markers.get(signal.id);
  if (mapRuntime?.map && coordinates) {
    mapRuntime.map.setView(coordinates, Math.max(mapRuntime.map.getZoom(), 14), { animate: true });
    marker?.openPopup();
  }
});

$$('[data-demo-role]').forEach((button) => button.addEventListener('click', () => setDashboardRole(button.dataset.demoRole)));
$('[data-dashboard-login]').addEventListener('submit', (event) => {
  event.preventDefault();
  void enterDashboard();
});

const dashboardApp = $('[data-dashboard-app]');
dashboardApp.addEventListener('click', (event) => {
  const result = event.target.closest('[data-food-bank]');
  if (result) {
    focusDashboardFoodBank(result.dataset.foodBank);
    return;
  }
  if (event.target.closest('[data-dashboard-report]')) {
    openModal('supply');
    return;
  }
  const request = event.target.closest('[data-dashboard-request]');
  if (request) announce('A food request draft has been started for this location.');
});

$('[data-dashboard-location]').addEventListener('input', () => {
  renderDashboardResults();
  renderDashboardMarkers();
});

$('[data-use-location]').addEventListener('click', () => {
  if (!navigator.geolocation) {
    announce('Location access is not available in this browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const location = [coords.latitude, coords.longitude];
      const bounds = dashboardScopeBounds();
      const inside = bounds && location[0] >= bounds[0][0] && location[0] <= bounds[1][0] && location[1] >= bounds[0][1] && location[1] <= bounds[1][1];
      if (!inside) {
        announce('CareSpace is currently scoped to San Diego County.');
        return;
      }
      const nearest = foodBanksInScope().sort((a, b) => {
        const aLocation = signalCoordinates(a);
        const bLocation = signalCoordinates(b);
        return Math.hypot(aLocation[0] - location[0], aLocation[1] - location[1]) - Math.hypot(bLocation[0] - location[0], bLocation[1] - location[1]);
      })[0];
      $('[data-dashboard-location]').value = 'Near me';
      renderDashboardResults();
      renderDashboardMarkers();
      if (nearest) focusDashboardFoodBank(nearest.id);
      announce(nearest ? `Showing the closest food location: ${nearest.name}.` : 'No food locations are available yet.');
    },
    () => announce('Location access was not available. Search by city instead.'),
    { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
  );
});

$('[data-dashboard-logout]').addEventListener('click', () => {
  dashboardApp.hidden = true;
  $('[data-dashboard-gate]').hidden = false;
  if (dashboardRuntime) {
    dashboardRuntime.map.remove();
    dashboardRuntime = null;
  }
  announce('You have been signed out of the demo dashboard.');
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

void initializeLiveMap();

setInterval(() => {
  $$('.topline-time').forEach((element) => {
    element.textContent = 'Updated just now';
  });
}, 30000);
