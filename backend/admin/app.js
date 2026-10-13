// VerifiedWorks admin panel. Plain JS, no build step.
(function () {
  const TOKEN_KEY = 'vw.admin.token';
  const TABS = ['overview', 'keys', 'users', 'withdrawals', 'settings'];
  const $ = (id) => document.getElementById(id);

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function setToken(t) {
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  async function call(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`/admin/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Can't reach the server. Is the backend running?");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') {
      setToken(null);
      show('login');
    }
    if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
    return data;
  }

  function show(view) {
    for (const v of ['setup', 'login', 'panel']) $(`view-${v}`).hidden = v !== view;
    $('session').hidden = view !== 'panel';
    $('tabs').hidden = view !== 'panel';
  }

  // Wires a form: disables the button while busy, shows errors and success messages
  function handle(form, fn) {
    const err = form.querySelector('[data-error]');
    const ok = form.querySelector('[data-success]');
    const btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) err.textContent = '';
      if (ok) ok.textContent = '';
      btn.disabled = true;
      try {
        const msg = await fn(Object.fromEntries(new FormData(form)));
        if (msg && ok) ok.textContent = msg;
      } catch (ex) {
        if (err) err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Formatting helpers
  const money = (cents, currency = 'USD') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.colSpan) node.colSpan = opts.colSpan;
    if (opts.title) node.title = opts.title;
    if (opts.type) node.type = opts.type;
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    for (const c of children) if (c) node.append(c);
    return node;
  }

  function userCell(name, email) {
    return el('td', {}, [document.createTextNode(name), el('span', { className: 'sub', text: email })]);
  }

  function pill(text, kind) {
    return el('span', { className: `pill ${kind || ''}`, text });
  }

  function fillTable(tbody, rows, cols, emptyText) {
    tbody.replaceChildren();
    if (!rows.length) {
      tbody.append(el('tr', {}, [el('td', { className: 'empty', colSpan: cols, text: emptyText })]));
      return;
    }
    for (const r of rows) tbody.append(r);
  }

  let toastTimer;
  function toast(text, kind = 'good') {
    const t = $('toast');
    t.textContent = text;
    t.className = `toast ${kind}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  async function copy(text, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      // Clipboard needs https or localhost; fall back to a prompt the admin can copy from
      window.prompt('Copy this:', text);
    }
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function pager(container, { page, pageSize, total }, go) {
    container.replaceChildren();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (total <= pageSize) {
      container.append(el('span', { className: 'muted small', text: total ? plural(total, 'result') : '' }));
      return;
    }
    const prev = el('button', { className: 'btn small', type: 'button', text: 'Previous', onClick: () => go(page - 1) });
    const next = el('button', { className: 'btn small', type: 'button', text: 'Next', onClick: () => go(page + 1) });
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
    container.append(prev, el('span', { className: 'muted small', text: `Page ${page} of ${pages}, ${plural(total, 'result')}` }), next);
  }

  // A small dialog that collects a few fields. Resolves when onSubmit succeeds, or null on cancel.
  function openDialog({ title, text = '', fields, okText = 'Save', onSubmit }) {
    const dlg = $('dlg');
    const form = $('dlg-form');
    const err = form.querySelector('[data-error]');
    $('dlg-title').textContent = title;
    $('dlg-text').textContent = text;
    $('dlg-text').hidden = !text;
    $('dlg-ok').textContent = okText;
    err.textContent = '';

    const box = $('dlg-fields');
    box.replaceChildren();
    for (const f of fields) {
      const label = el('label', {}, [document.createTextNode(f.label)]);
      let input;
      if (f.options) {
        input = el('select');
        for (const [value, name] of f.options) {
          const o = el('option', { text: name });
          o.value = value;
          input.append(o);
        }
      } else {
        input = el('input');
        input.type = f.type || 'text';
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.min !== undefined) input.min = f.min;
        if (f.max !== undefined) input.max = f.max;
        if (f.step !== undefined) input.step = f.step;
        if (f.maxLength) input.maxLength = f.maxLength;
        if (f.required) input.required = true;
        input.spellcheck = false;
        input.autocomplete = 'off';
      }
      input.name = f.name;
      if (f.value !== undefined) input.value = f.value;
      label.append(input);
      if (f.hint) label.append(el('span', { className: 'hint', text: f.hint }));
      box.append(label);
      if (f.onChange) input.addEventListener('change', () => f.onChange(input, form));
    }

    return new Promise((resolve) => {
      const ok = $('dlg-ok');
      const close = (value) => {
        form.removeEventListener('submit', submit);
        $('dlg-cancel').removeEventListener('click', cancel);
        dlg.removeEventListener('cancel', cancel);
        dlg.close();
        resolve(value);
      };
      const cancel = (e) => { e.preventDefault(); close(null); };
      const submit = async (e) => {
        e.preventDefault();
        err.textContent = '';
        ok.disabled = true;
        try {
          close(await onSubmit(Object.fromEntries(new FormData(form))));
        } catch (ex) {
          err.textContent = ex.message;
        } finally {
          ok.disabled = false;
        }
      };
      form.addEventListener('submit', submit);
      $('dlg-cancel').addEventListener('click', cancel);
      dlg.addEventListener('cancel', cancel);
      dlg.showModal();
      const first = box.querySelector('input, select');
      if (first) first.focus();
    });
  }

  const LENGTH_OPTIONS = [
    ['0', 'Lifetime'],
    ['7', '7 days'],
    ['30', '30 days'],
    ['90', '90 days'],
    ['365', '1 year'],
  ];

  // ---------- Overview ----------

  // Keys from before the admin-only change can still come from a payment
  const SOURCE_LABEL = { paypal: 'Paid', free: 'Free', test: 'Test', admin: 'Admin' };

  function accessPill(access, source) {
    if (access === 'active') {
      const kind = source === 'paypal' ? 'good' : source === 'test' ? 'test' : source === 'admin' ? 'admin' : 'free';
      return pill(source === 'admin' ? 'Admin key' : source === 'test' ? 'Test key' : source === 'free' ? 'Free key' : 'Paid', kind);
    }
    if (access === 'expired') return pill('Expired', 'bad');
    if (access === 'revoked') return pill('Revoked', 'bad');
    return pill('No access');
  }

  async function loadSummary() {
    const s = await call('/summary');
    const u = s.users;

    $('s-users').textContent = u.total;
    $('s-users-sub').textContent = `${u.last7Days} this week, ${u.last30Days} in 30 days`;
    $('s-access').textContent = u.withAccess;
    $('s-access-sub').textContent = `${plural(s.keys.givenLast30Days, 'key')} given in 30 days`;
    $('s-waiting').textContent = u.waiting;
    $('s-unassigned').textContent = s.keys.unassigned;

    fillTable(
      $('waiting-body'),
      s.waiting.map((r) =>
        el('tr', {}, [
          userCell(r.username, r.email),
          el('td', { className: 'num', text: date(r.joinedAt) }),
          el('td', { className: 'right' }, [
            el('button', { className: 'btn small primary', type: 'button', text: 'Give key', onClick: () => giveKey(r).then((ok) => ok && loadSummary()) }),
          ]),
        ]),
      ),
      3,
      'Nobody is waiting',
    );

    fillTable(
      $('users-body'),
      s.recentUsers.map((r) =>
        el('tr', {}, [
          userCell(r.username, r.email),
          el('td', { className: 'num', text: date(r.joinedAt) }),
          el('td', {}, [accessPill(r.access, r.source)]),
        ]),
      ),
      3,
      'No users yet',
    );
  }

  // ---------- Card keys ----------

  const keysView = { state: '', q: '', page: 1 };

  function accessText(k) {
    if (k.state === 'unassigned') return k.lifetime ? 'Lifetime once given' : `${plural(k.validDays, 'day')} once given`;
    if (k.lifetime) return 'Lifetime';
    if (k.state === 'expired') return `Ended ${date(k.expiresAt)}`;
    if (k.state === 'revoked') return k.expiresAt ? `Until ${date(k.expiresAt)}` : 'Lifetime';
    return `${plural(k.daysLeft, 'day')} left, until ${date(k.expiresAt)}`;
  }

  function statePill(state) {
    return {
      active: pill('Active', 'good'),
      unassigned: pill('Unassigned', 'admin'),
      expired: pill('Expired', 'bad'),
      revoked: pill('Revoked', 'bad'),
    }[state];
  }

  function keyActions(k) {
    const box = el('div', { className: 'actions' });
    const btn = (text, fn, kind = '') =>
      box.append(el('button', { className: `btn small ${kind}`, type: 'button', text, onClick: fn }));

    if (k.state === 'unassigned') btn('Assign', () => assignKey(k));
    if (k.user && k.source === 'admin' && k.state !== 'revoked') btn('Unassign', () => unassignKey(k));
    if (!k.lifetime && k.state !== 'revoked') btn('Extend', () => extendKey(k));
    btn('Note', () => editNote(k));
    if (k.state === 'revoked') btn('Restore', () => keyAction(k, 'restore', 'Key restored'));
    else btn('Revoke', () => revokeKey(k), 'danger');
    if (k.source === 'admin') btn('Delete', () => deleteKey(k), 'danger');
    return box;
  }

  async function loadKeys() {
    const params = new URLSearchParams({ page: String(keysView.page) });
    if (keysView.state) params.set('state', keysView.state);
    if (keysView.q) params.set('q', keysView.q);
    const r = await call(`/keys?${params}`);

    for (const chip of $('key-filters').querySelectorAll('.chip')) {
      const s = chip.dataset.state;
      chip.classList.toggle('on', s === keysView.state);
      chip.setAttribute('aria-selected', String(s === keysView.state));
      chip.querySelector('span').textContent = r.counts[s || 'all'] ?? 0;
    }

    fillTable(
      $('keys-body'),
      r.keys.map((k) =>
        el('tr', {}, [
          el('td', {}, [
            el('button', { className: 'code', type: 'button', text: k.code, title: 'Copy key', onClick: () => copy(k.code, 'Key copied') }),
            k.note ? el('span', { className: 'sub', text: k.note }) : null,
          ]),
          k.user ? userCell(k.user.username, k.user.email) : el('td', { className: 'muted', text: 'Nobody yet' }),
          el('td', {}, [statePill(k.state), el('span', { className: 'sub', text: accessText(k) })]),
          el('td', {}, [pill(SOURCE_LABEL[k.source] || k.source, k.source === 'paypal' ? 'good' : k.source === 'admin' ? 'admin' : k.source === 'test' ? 'test' : 'free')]),
          el('td', { className: 'num', text: date(k.createdAt) }),
          el('td', { className: 'right' }, [keyActions(k)]),
        ]),
      ),
      6,
      keysView.q || keysView.state ? 'No keys match' : 'No keys yet. Generate one above.',
    );
    pager($('keys-pager'), r, (p) => { keysView.page = p; loadKeys().catch((e) => toast(e.message, 'bad')); });
  }

  const refreshKeys = () => loadKeys().catch((e) => toast(e.message, 'bad'));

  function emailNote(email) {
    if (email === 'sent') return ', and they were emailed';
    if (email === 'simulated') return ' (email is simulated, see the server console)';
    if (email === 'failed') return ', but the email failed';
    return '';
  }

  function showNewKeys(keys, forUser, email) {
    const list = $('new-keys');
    list.replaceChildren();
    for (const k of keys) {
      list.append(
        el('li', {}, [
          el('code', { text: k.code }),
          el('button', { className: 'btn small', type: 'button', text: 'Copy', onClick: () => copy(k.code, 'Key copied') }),
        ]),
      );
    }
    $('new-keys-note').textContent = forUser
      ? `Given to ${forUser}. Their account is unlocked now${emailNote(email)}. In the app they tap Check again or reopen it.`
      : `${plural(keys.length, 'unassigned key')}. Use Assign in the list below to give one to a user.`;
    $('new-keys-card').hidden = false;
    $('copy-all').onclick = () => copy(keys.map((k) => k.code).join('\n'), keys.length > 1 ? 'All keys copied' : 'Key copied');
  }

  const generateForm = $('generate-form');
  generateForm.validity.addEventListener('change', () => {
    $('custom-days').hidden = generateForm.validity.value !== 'custom';
  });
  generateForm.user.addEventListener('input', () => {
    generateForm.querySelector('[data-error]').textContent = '';
    const forUser = !!generateForm.user.value.trim();
    generateForm.count.disabled = forUser;
    if (forUser) generateForm.count.value = '1';
  });

  handle(generateForm, async (f) => {
    const validDays = f.validity === 'custom' ? Number(f.days) : Number(f.validity);
    if (!Number.isInteger(validDays) || validDays < 0 || validDays > 3650) throw new Error('Days must be a whole number from 1 to 3650');
    const user = (f.user || '').trim();
    const r = await call('/keys/generate', {
      method: 'POST',
      body: { user: user || undefined, count: user ? 1 : Number(f.count || 1), validDays, note: f.note },
    });
    showNewKeys(r.keys, r.keys[0]?.user?.username, r.email);
    generateForm.user.value = '';
    generateForm.note.value = '';
    generateForm.count.disabled = false;
    keysView.page = 1;
    await loadKeys();
    return '';
  });

  async function keyAction(k, action, done) {
    try {
      await call(`/keys/${encodeURIComponent(k.id)}/${action}`, { method: 'POST' });
      toast(done);
      refreshKeys();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function assignKey(k) {
    const r = await openDialog({
      title: `Assign ${k.code}`,
      text: k.lifetime ? 'The user gets lifetime access.' : `The user gets ${plural(k.validDays, 'day')} of access, starting now.`,
      fields: [{ name: 'user', label: 'Username or email', required: true }],
      okText: 'Assign',
      onSubmit: (f) => call(`/keys/${encodeURIComponent(k.id)}/assign`, { method: 'POST', body: { user: f.user.trim() } }),
    });
    if (r) { toast(`Given to ${r.key.user.username}${emailNote(r.email)}`); refreshKeys(); }
  }

  function unassignKey(k) {
    if (!confirm(`Take ${k.code} back from ${k.user.username}? They lose access right away and the key becomes unassigned.`)) return;
    keyAction(k, 'unassign', 'Key is unassigned');
  }

  function revokeKey(k) {
    const who = k.user ? ` ${k.user.username} loses access right away.` : '';
    if (!confirm(`Revoke ${k.code}?${who} You can restore it later.`)) return;
    keyAction(k, 'revoke', 'Key revoked');
  }

  async function deleteKey(k) {
    if (!confirm(`Delete ${k.code} for good?${k.user ? ` ${k.user.username} loses access.` : ''}`)) return;
    try {
      await call(`/keys/${encodeURIComponent(k.id)}`, { method: 'DELETE' });
      toast('Key deleted');
      refreshKeys();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function extendKey(k) {
    const r = await openDialog({
      title: `Extend ${k.code}`,
      text: k.state === 'unassigned'
        ? 'Adds days to what the user will get once the key is given.'
        : k.state === 'expired'
          ? 'The key has run out, so the new days count from today.'
          : `Currently runs until ${date(k.expiresAt)}.`,
      fields: [
        {
          name: 'how',
          label: 'Change',
          options: [['days', 'Add days'], ['lifetime', 'Make lifetime']],
          onChange: (input, form) => { form.days.closest('label').hidden = input.value === 'lifetime'; },
        },
        { name: 'days', label: 'Days to add', type: 'number', min: 1, max: 3650, step: 1, value: 30 },
      ],
      okText: 'Extend',
      onSubmit: (f) => {
        if (f.how === 'lifetime') return call(`/keys/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: { lifetime: true } });
        const days = Number(f.days);
        if (!Number.isInteger(days) || days < 1) throw new Error('Enter a whole number of days');
        return call(`/keys/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: { addDays: days } });
      },
    });
    if (r) { toast('Key extended'); refreshKeys(); }
  }

  async function editNote(k) {
    const r = await openDialog({
      title: `Note for ${k.code}`,
      fields: [{ name: 'note', label: 'Note', value: k.note, maxLength: 120, placeholder: 'e.g. paid by M-Pesa' }],
      onSubmit: (f) => call(`/keys/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: { note: f.note } }),
    });
    if (r) { toast('Note saved'); refreshKeys(); }
  }

  for (const chip of $('key-filters').querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      keysView.state = chip.dataset.state;
      keysView.page = 1;
      refreshKeys();
    });
  }
  $('key-search').addEventListener('input', debounce((e) => {
    keysView.q = e.target.value.trim();
    keysView.page = 1;
    refreshKeys();
  }));

  // ---------- Users ----------

  const usersView = { q: '', page: 1 };

  async function loadUsers() {
    const params = new URLSearchParams({ page: String(usersView.page) });
    if (usersView.q) params.set('q', usersView.q);
    const r = await call(`/users?${params}`);

    fillTable(
      $('all-users-body'),
      r.users.map((u) => {
        const actions = el('div', { className: 'actions' }, [
          u.access === 'active'
            ? null
            : el('button', { className: 'btn small primary', type: 'button', text: 'Give key', onClick: () => giveKey(u) }),
          el('button', { className: 'btn small', type: 'button', text: 'Credit', onClick: () => creditUser(u) }),
          u.key ? el('button', { className: 'btn small', type: 'button', text: 'Show key', onClick: () => showUserKey(u) }) : null,
        ]);
        return el('tr', {}, [
          userCell(u.name ? `${u.username} (${u.name})` : u.username, u.email),
          el('td', { className: 'num', text: date(u.joinedAt) }),
          el('td', {}, [
            accessPill(u.access, u.key?.source),
            u.access === 'active' && u.key?.expiresAt ? el('span', { className: 'sub', text: `until ${date(u.key.expiresAt)}` }) : null,
          ]),
          el('td', { className: 'num', text: String(u.tasks) }),
          el('td', { className: 'num', text: money(u.balanceCents) }),
          el('td', { className: 'right' }, [actions]),
        ]);
      }),
      6,
      usersView.q ? 'No users match' : 'No users yet',
    );
    pager($('users-pager'), r, (p) => { usersView.page = p; refreshUsers(); });
  }

  const refreshUsers = () => loadUsers().catch((e) => toast(e.message, 'bad'));

  function showUserKey(u) {
    keysView.q = u.username;
    keysView.state = '';
    keysView.page = 1;
    $('key-search').value = u.username;
    location.hash = '#keys';
  }

  async function giveKey(u) {
    const r = await openDialog({
      title: `Give ${u.username} a key`,
      text: 'A new key is made and attached to this account. It unlocks the app straight away.',
      fields: [
        { name: 'validity', label: 'Access length', options: LENGTH_OPTIONS, value: '0' },
        { name: 'note', label: 'Note', maxLength: 120, placeholder: 'Optional, e.g. paid by M-Pesa' },
      ],
      okText: 'Generate and give',
      onSubmit: (f) =>
        call('/keys/generate', { method: 'POST', body: { user: u.username, count: 1, validDays: Number(f.validity), note: f.note } }),
    });
    if (!r) return false;
    toast(`Key ${r.keys[0].code} given to ${u.username}${emailNote(r.email)}`);
    if (currentTab() === 'users') refreshUsers();
    return true;
  }

  async function creditUser(u) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const r = await openDialog({
      title: `Credit ${u.username}`,
      text: 'Adds approved earnings to the user\'s wallet balance. It does not send money.',
      fields: [
        { name: 'amount', label: 'Amount in USD', type: 'number', min: 0.01, step: 0.01, required: true },
        {
          name: 'ref',
          label: 'Work reference',
          value: `manual-${stamp}`,
          required: true,
          maxLength: 100,
          hint: 'Each reference can only be credited once, so a double click never pays twice.',
        },
        { name: 'description', label: 'Description', maxLength: 250, placeholder: 'Optional' },
      ],
      okText: 'Credit',
      onSubmit: (f) => {
        const cents = Math.round(Number(String(f.amount).replace(',', '.')) * 100);
        if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Enter an amount above 0');
        return call('/earnings/credit', {
          method: 'POST',
          body: { userId: u.id, amountCents: cents, sourceId: f.ref.trim(), description: f.description.trim() },
        });
      },
    });
    if (r) {
      toast(r.repeated ? 'Already credited earlier with that reference' : `Credited ${money(r.amountCents)} to ${u.username}`, r.repeated ? 'bad' : 'good');
      refreshUsers();
    }
  }

  $('user-search').addEventListener('input', debounce((e) => {
    usersView.q = e.target.value.trim();
    usersView.page = 1;
    refreshUsers();
  }));

  // ---------- Withdrawals ----------

  const withdrawalsView = { status: '', page: 1 };
  const WITHDRAWAL_PILL = {
    pending: ['Pending', ''],
    processing: ['Processing', 'test'],
    payout_unknown: ['Unconfirmed', 'test'],
    completed: ['Completed', 'good'],
    failed: ['Failed', 'bad'],
  };

  async function loadWithdrawals() {
    const params = new URLSearchParams({ page: String(withdrawalsView.page) });
    if (withdrawalsView.status) params.set('status', withdrawalsView.status);
    const r = await call(`/withdrawals?${params}`);

    $('withdrawals-open').textContent = r.open.count
      ? `${plural(r.open.count, 'payout')} still open, ${money(r.open.amountCents)} in total. PayPal statuses are rechecked every minute.`
      : 'No open payouts. PayPal statuses are rechecked every minute.';

    fillTable(
      $('withdrawals-body'),
      r.withdrawals.map((w) => {
        const [label, kind] = WITHDRAWAL_PILL[w.status] || [w.status, ''];
        return el('tr', {}, [
          userCell(w.username, w.email),
          el('td', { className: 'wrap', text: w.destination }),
          el('td', { className: 'num', text: money(w.amountCents, w.currency) }),
          el('td', {}, [pill(label, kind), w.failureReason ? el('span', { className: 'sub', text: w.failureReason }) : null]),
          el('td', { className: 'num', text: date(w.createdAt) }),
          el('td', { className: 'num', text: w.processedAt ? date(w.processedAt) : '' }),
        ]);
      }),
      6,
      'No withdrawals yet',
    );
    pager($('withdrawals-pager'), r, (p) => { withdrawalsView.page = p; refreshWithdrawals(); });
  }

  const refreshWithdrawals = () => loadWithdrawals().catch((e) => toast(e.message, 'bad'));

  $('withdrawal-status').addEventListener('change', (e) => {
    withdrawalsView.status = e.target.value;
    withdrawalsView.page = 1;
    refreshWithdrawals();
  });

  // ---------- Settings ----------

  async function loadPayPal() {
    const p = await call('/paypal');
    const form = $('paypal-form');
    form.mode.value = p.mode;
    form.clientId.value = p.clientId || '';
    form.clientSecret.value = '';

    let status;
    if (p.secretUnreadable) {
      status = 'The saved Secret can no longer be read because JWT_SECRET changed. Enter the Secret again.';
    } else if (!p.configured) {
      status = 'Not set up yet. Withdrawals can\'t be paid out until you save credentials here.';
    } else if (p.source === 'env') {
      status = `Currently using credentials from the server's .env file (${p.mode}). Save here to manage them from this panel instead.`;
    } else {
      status = `Connected in ${p.mode === 'live' ? 'live' : 'sandbox'} mode. Client ID ${p.clientIdHint}.`;
    }
    $('paypal-status').textContent = status;

    const keep = p.configured && p.source === 'admin' && !p.secretUnreadable;
    form.clientSecret.required = !keep;
    form.clientSecret.placeholder = keep ? 'Leave blank to keep the saved Secret' : 'Paste the Secret';
    $('secret-hint').textContent = keep ? `Saved Secret ends in ${p.secretHint.slice(-4)}` : '';
  }

  handle($('paypal-form'), async (f) => {
    if (f.mode === 'live' && !confirm('Switch to LIVE mode? Withdrawals will send real money.')) return '';
    const r = await call('/paypal', {
      method: 'PUT',
      body: { mode: f.mode, clientId: f.clientId, clientSecret: f.clientSecret },
    });
    await loadPayPal();
    return `PayPal accepted the credentials. Saved in ${r.mode} mode.`;
  });

  handle($('password-form'), async (f) => {
    if (f.newPassword !== f.confirm) throw new Error("New passwords don't match");
    await call('/password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
    $('password-form').reset();
    return 'Password changed.';
  });

  // ---------- Navigation and session ----------

  const LOADERS = {
    overview: loadSummary,
    keys: loadKeys,
    users: loadUsers,
    withdrawals: loadWithdrawals,
    settings: loadPayPal,
  };

  function currentTab() {
    const t = location.hash.slice(1);
    return TABS.includes(t) ? t : 'overview';
  }

  function openTab(tab) {
    if ($('view-panel').hidden) return;
    for (const t of TABS) $(`tab-${t}`).hidden = t !== tab;
    for (const a of $('tabs').querySelectorAll('a')) {
      const on = a.dataset.tab === tab;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    LOADERS[tab]().catch((e) => toast(e.message, 'bad'));
  }

  window.addEventListener('hashchange', () => openTab(currentTab()));

  async function enterPanel(username) {
    $('whoami').textContent = username;
    show('panel');
    openTab(currentTab());
  }

  handle($('setup-form'), async (f) => {
    if (f.password !== f.confirm) throw new Error("Passwords don't match");
    const r = await call('/setup', { method: 'POST', body: { username: f.username.trim(), password: f.password } });
    setToken(r.token);
    await enterPanel(r.username);
  });

  handle($('login-form'), async (f) => {
    const r = await call('/login', { method: 'POST', body: { username: f.username.trim(), password: f.password } });
    setToken(r.token);
    $('login-form').reset();
    await enterPanel(r.username);
  });

  $('signout').addEventListener('click', () => {
    setToken(null);
    show('login');
  });

  $('refresh').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await loadSummary(); } catch (ex) { toast(ex.message, 'bad'); } finally { e.target.disabled = false; }
  });

  // Start: setup, login, or straight into the panel with a saved session
  (async function start() {
    try {
      const status = await call('/setup-status');
      if (status.needsSetup) {
        $('setup-remote').hidden = status.setupAllowedHere;
        $('setup-form').hidden = !status.setupAllowedHere;
        show('setup');
        return;
      }
      if (getToken()) {
        try {
          const me = await call('/me');
          await enterPanel(me.username);
          return;
        } catch { /* fall through to login */ }
      }
      show('login');
    } catch (e) {
      show('login');
      $('login-form').querySelector('[data-error]').textContent = e.message;
    }
  })();
})();
