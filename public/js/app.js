// ============================================
// RESTAURANT RESERVATION SYSTEM – Main App
// ============================================

(function () {
    'use strict';

    // ── State ──
    let currentApp = 'customer'; // customer | staff | admin
    let reservationState = { partySize: 2, date: '', time: '', tableId: null, step: 1 };
    let lastConfirmedReservation = null;

    // Authentication state (persisted via API token and role)
    const AUTH = {
        get staff() {
            const role = localStorage.getItem('seniour_role');
            return API.token !== null && (role === 'staff' || role === 'admin');
        },
        get admin() {
            return localStorage.getItem('seniour_role') === 'admin' && API.token !== null;
        }
    };

    // ── Utilities ──
    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatTime(timeStr) {
        const [h, m] = timeStr.split(':');
        const hr = parseInt(h);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        return `${hr % 12 || 12}:${m} ${ampm}`;
    }

    function getToday() {
        return new Date().toISOString().split('T')[0];
    }

    function showToast(title, message, type = 'info') {
        const container = $('#toastContainer');
        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

    function showModal(title, content, actions = '') {
        const overlay = $('#modalOverlay');
        $('#modalContent').innerHTML = `
      <div class="modal-header">
        <h4 class="modal-title">${title}</h4>
        <button class="modal-close" onclick="document.getElementById('modalOverlay').classList.remove('active')">✕</button>
      </div>
      <div class="modal-body">${content}</div>
      ${actions ? `<div class="mt-6 flex gap-3">${actions}</div>` : ''}
    `;
        overlay.classList.add('active');
    }

    function closeModal() { $('#modalOverlay').classList.remove('active'); }

    function getStatusBadge(status) {
        const map = {
            confirmed: 'badge-warning',
            seated: 'badge-success',
            completed: 'badge-info',
            'no-show': 'badge-error',
            cancelled: 'badge-error',
            waiting: 'badge-warning',
            notified: 'badge-info'
        };
        return `<span class="badge ${map[status] || 'badge-info'}">${status}</span>`;
    }

    // ── Navigation ──
    function navigateTo(page) {
        if (page === 'staff') {
            if (!AUTH.staff) { showLoginModal('staff', () => navigateTo('staff')); return; }
            switchApp('staff');
            return;
        }
        if (page === 'admin') {
            if (!AUTH.admin) { showLoginModal('admin', () => navigateTo('admin')); return; }
            switchApp('admin');
            return;
        }
        if (page === 'home' || page === 'reserve' || page === 'my-reservations' || page === 'confirm') {
            switchApp('customer');
            $$('.page-view').forEach(p => p.classList.remove('active'));
            $$('.topbar-link').forEach(l => l.classList.remove('active'));
            const target = $('#page-' + page);
            if (target) target.classList.add('active');
            const link = $(`.topbar-link[data-nav="${page}"]`);
            if (link) link.classList.add('active');

            // Close mobile menu on navigate
            $('.topbar-nav').classList.remove('mobile-open');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Show/hide customer pages
        $$('.page-view').forEach(p => p.classList.remove('active'));
        const target = $(`#page-${page}`) || $(`#staff-${page}`) || $(`#admin-${page}`);
        if (target) {
            target.classList.add('active');
            target.style.animation = 'none';
            target.offsetHeight;
            target.style.animation = 'fadeIn 0.4s ease forwards';
        }

        // Update active nav links
        $$('[data-nav]').forEach(l => l.classList.remove('active'));
        $$(`[data-nav="${page}"]`).forEach(l => l.classList.add('active'));

        window.location.hash = page;
    }

    function showLoginModal(role, onSuccess) {
        const title = role === 'admin' ? 'Admin Access' : 'Staff Access';
        showModal(title, `
            <div class="form-group">
                <label class="form-label">Enter Password</label>
                <input type="password" class="form-input" id="loginPassword" placeholder="••••••••">
                <p id="loginError" class="text-error mt-2 hidden" style="font-size:var(--fs-xs);">Incorrect password. Please try again.</p>
            </div>
        `, `
            <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">Cancel</button>
            <button class="btn btn-primary" id="loginSubmit">Login</button>
        `);

        $('#loginPassword').focus();
        $('#loginPassword').onkeyup = (e) => { if (e.key === 'Enter') $('#loginSubmit').click(); };

        $('#loginSubmit').onclick = async () => {
            const pwd = $('#loginPassword').value;
            try {
                const data = await API.login(pwd);
                // On success
                closeModal();
                showToast('Welcome!', `Logged in as ${data.role === 'admin' ? 'Administrator' : 'Staff'}`, 'success');
                onSuccess();
            } catch (err) {
                $('#loginError').textContent = err.message || 'Login failed';
                $('#loginError').classList.remove('hidden');
                $('#loginPassword').value = '';
                $('#loginPassword').focus();
            }
        };
    }

    function switchApp(app) {
        currentApp = app;
        $$('.app-view').forEach(v => v.classList.add('hidden'));

        if (app === 'customer') {
            $('#customerApp').classList.remove('hidden');
        } else if (app === 'staff') {
            $('#staffApp').classList.remove('hidden');
            loadStaffDashboard();
        } else if (app === 'admin') {
            $('#adminApp').classList.remove('hidden');
            loadAdminConfig();
        }
    }

    function handleStaffNav(page) {
        $$('#staffApp .page-view').forEach(p => p.classList.remove('active'));
        const target = $(`#staff-${page}`);
        if (target) {
            target.classList.add('active');
            target.style.animation = 'none';
            target.offsetHeight;
            target.style.animation = 'fadeIn 0.4s ease forwards';
        }
        $$('[data-staff-nav]').forEach(l => l.classList.remove('active'));
        $$(`[data-staff-nav="${page}"]`).forEach(l => l.classList.add('active'));

        if (page === 'dashboard') loadStaffDashboard();
        else if (page === 'floor') loadFloorMap();
        else if (page === 'reservations') loadReservationsList();
        else if (page === 'waitlist') loadWaitlist();
    }

    function handleAdminNav(page) {
        $$('#adminApp .page-view').forEach(p => p.classList.remove('active'));
        const target = $(`#admin-${page}`);
        if (target) {
            target.classList.add('active');
            target.style.animation = 'none';
            target.offsetHeight;
            target.style.animation = 'fadeIn 0.4s ease forwards';
        }
        $$('[data-admin-nav]').forEach(l => l.classList.remove('active'));
        $$(`[data-admin-nav="${page}"]`).forEach(l => l.classList.add('active'));

        if (page === 'config') loadAdminConfig();
        else if (page === 'tables') loadTableManagement();
        else if (page === 'analytics') loadAnalytics();
    }

    // ═══════════════════════════════
    // CUSTOMER: Home Page
    // ═══════════════════════════════
    async function loadRestaurantInfo() {
        try {
            const info = await API.getRestaurant();
            if (info.operating_hours) {
                const hours = typeof info.operating_hours === 'string' ? JSON.parse(info.operating_hours) : info.operating_hours;
                const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
                const todayHours = hours[today];
                let hoursText = '';
                for (const [day, h] of Object.entries(hours)) {
                    hoursText += `${day.charAt(0).toUpperCase() + day.slice(1)}: ${h.open} – ${h.close}<br>`;
                }
                $('#infoHours').innerHTML = hoursText;
            }
            if (info.address) $('#infoAddress').textContent = info.address;
            if (info.phone || info.email) {
                $('#infoContact').innerHTML = `${info.phone || ''}<br>${info.email || ''}`;
            }
        } catch (e) {
            console.error('Failed to load restaurant info:', e);
        }
    }

    // ═══════════════════════════════
    // CUSTOMER: Reservation Flow
    // ═══════════════════════════════
    function initReservationForm() {
        // Party size buttons
        const container = $('#partySizeSelector');
        container.innerHTML = '';
        for (let i = 1; i <= 12; i++) {
            const btn = document.createElement('button');
            btn.className = `party-size-btn${i === 2 ? ' active' : ''}`;
            btn.textContent = i;
            btn.addEventListener('click', () => {
                $$('.party-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                reservationState.partySize = i;
            });
            container.appendChild(btn);
        }

        // Date default
        const dateInput = $('#reserveDate');
        dateInput.value = getToday();
        dateInput.min = getToday();
        reservationState.date = getToday();
        dateInput.addEventListener('change', (e) => { reservationState.date = e.target.value; });

        // Time slots
        generateTimeSlots();
    }

    function generateTimeSlots() {
        const container = $('#timeSlots');
        container.innerHTML = '';
        const slots = [];
        for (let h = 8; h <= 23; h++) {
            for (let m = 0; m < 60; m += 30) {
                const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                slots.push(time);
            }
        }
        slots.forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'time-slot';
            btn.textContent = formatTime(time);
            btn.dataset.time = time;
            btn.addEventListener('click', () => {
                $$('.time-slot').forEach(s => s.classList.remove('active'));
                btn.classList.add('active');
                reservationState.time = time;
            });
            container.appendChild(btn);
        });
    }

    async function checkAvailability() {
        const { date, time, partySize } = reservationState;
        if (!date) { showToast('Missing Date', 'Please select a date', 'warning'); return; }
        if (!time) { showToast('Missing Time', 'Please select a time', 'warning'); return; }

        try {
            const result = await API.checkAvailability(date, time, partySize);
            showReserveStep(2);

            const tablesList = $('#availableTablesList');
            const altSection = $('#alternativeTimesSection');

            if (result.available.length > 0) {
                $('#availabilityMessage').textContent = `${result.available.length} table(s) available for ${partySize} guests on ${formatDate(date)} at ${formatTime(time)}`;
                tablesList.innerHTML = result.available.map(t => `
          <div class="table-option" data-table-id="${t.id}" onclick="window._selectTable('${t.id}')">
            <div class="table-option-number">Table ${t.table_number}</div>
            <div class="table-option-info">${t.capacity} seats · ${t.location}</div>
          </div>
        `).join('');
                altSection.classList.add('hidden');
            } else {
                $('#availabilityMessage').textContent = 'No tables available for the selected time. Try an alternative:';
                tablesList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🍽️</div><p class="empty-state-text">No tables match your criteria at this time</p></div>';

                if (result.alternativeTimes && result.alternativeTimes.length > 0) {
                    altSection.classList.remove('hidden');
                    $('#alternativeTimeSlots').innerHTML = result.alternativeTimes.map(t => `
            <button class="time-slot" onclick="window._selectAlternativeTime('${t}')">${formatTime(t)}</button>
          `).join('');
                }
            }
        } catch (e) {
            showToast('Error', e.message, 'error');
        }
    }

    window._selectTable = function (tableId) {
        $$('.table-option').forEach(t => t.classList.remove('selected'));
        document.querySelector(`[data-table-id="${tableId}"]`)?.classList.add('selected');
        reservationState.tableId = tableId;
        $('#proceedToDetails').disabled = false;
    };

    window._selectAlternativeTime = async function (time) {
        reservationState.time = time;
        $$('#timeSlots .time-slot').forEach(s => {
            s.classList.remove('active');
            if (s.dataset.time === time) s.classList.add('active');
        });
        await checkAvailability();
    };

    function showReserveStep(step) {
        reservationState.step = step;
        $$('.reserve-step').forEach(s => s.classList.add('hidden'));
        $(`#reserveStep${step}`).classList.remove('hidden');

        $$('.step-progress .step').forEach((s, i) => {
            s.classList.remove('active', 'completed');
            if (i + 1 < step) s.classList.add('completed');
            if (i + 1 === step) s.classList.add('active');
        });
        $$('.step-line').forEach((l, i) => {
            l.classList.toggle('active', i + 1 < step);
        });
    }

    async function confirmReservation() {
        const name = $('#custName').value.trim();
        const phone = $('#custPhone').value.trim();
        const email = $('#custEmail').value.trim();
        const requests = $('#custRequests').value.trim();

        if (!name) { showToast('Name Required', 'Please enter your name', 'warning'); return; }
        if (!phone) { showToast('Phone Required', 'Please enter your phone number', 'warning'); return; }

        try {
            const reservation = await API.createReservation({
                customer_name: name,
                customer_phone: phone,
                customer_email: email,
                table_id: reservationState.tableId,
                reservation_date: reservationState.date,
                reservation_time: reservationState.time,
                party_size: reservationState.partySize,
                special_requests: requests
            });

            lastConfirmedReservation = reservation;

            // Show confirmation
            $('#confirmDetails').innerHTML = `
        <div class="confirm-detail-row"><span class="confirm-detail-label">Reservation ID</span><span class="confirm-detail-value">${reservation.id.slice(0, 8).toUpperCase()}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Date</span><span class="confirm-detail-value">${formatDate(reservation.reservation_date)}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Time</span><span class="confirm-detail-value">${formatTime(reservation.reservation_time)}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Party Size</span><span class="confirm-detail-value">${reservation.party_size} guests</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Table</span><span class="confirm-detail-value">Table ${reservation.table_number} (${reservation.table_location})</span></div>
        ${reservation.special_requests ? `<div class="confirm-detail-row"><span class="confirm-detail-label">Special Requests</span><span class="confirm-detail-value">${reservation.special_requests}</span></div>` : ''}
        <div class="confirm-detail-row"><span class="confirm-detail-label">Status</span>${getStatusBadge(reservation.status)}</div>
      `;

            // Store email for lookup
            if (email) localStorage.setItem('userEmail', email);
            if (phone) localStorage.setItem('userPhone', phone);

            navigateTo('confirm');
            showToast('Reservation Confirmed!', `Table ${reservation.table_number} on ${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)}`, 'success');

            // Reset form
            $('#custName').value = '';
            $('#custPhone').value = '';
            $('#custEmail').value = '';
            $('#custRequests').value = '';
            showReserveStep(1);
        } catch (e) {
            showToast('Booking Failed', e.message, 'error');
        }
    }

    // ═══════════════════════════════
    // CUSTOMER: My Reservations
    // ═══════════════════════════════
    async function lookupReservations() {
        const field = $('#lookupField').value.trim();
        if (!field) { showToast('Enter Info', 'Please enter your email or phone', 'warning'); return; }

        try {
            const customers = await API.getCustomers(field);
            const container = $('#myReservationsList');

            if (customers.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h4 class="empty-state-title">No reservations found</h4><p class="empty-state-text">Try a different email or phone number</p></div>';
                return;
            }

            let allReservations = [];
            for (const c of customers) {
                const customer = await API.getCustomer(c.id);
                if (customer.reservations) {
                    allReservations = allReservations.concat(customer.reservations.map(r => ({ ...r, customer_name: c.name })));
                }
            }

            if (allReservations.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h4 class="empty-state-title">No reservations yet</h4></div>';
                return;
            }

            container.innerHTML = allReservations.map(r => `
        <div class="reservation-card">
          <div class="reservation-card-info">
            <h4>${formatDate(r.reservation_date)}</h4>
            <div class="reservation-card-meta">
              <span>🕐 ${formatTime(r.reservation_time)}</span>
              <span>👥 ${r.party_size} guests</span>
              <span>🍽️ Table ${r.table_number || 'TBD'}</span>
              ${getStatusBadge(r.status)}
            </div>
            ${r.special_requests ? `<p class="text-muted mt-2" style="font-size:var(--fs-xs);">${r.special_requests}</p>` : ''}
          </div>
          <div class="reservation-card-actions">
            ${r.status === 'confirmed' ? `<button class="btn btn-danger btn-sm" onclick="window._cancelReservation('${r.id}')">Cancel</button>` : ''}
          </div>
        </div>
      `).join('');
        } catch (e) {
            showToast('Error', e.message, 'error');
        }
    }

    window._cancelReservation = async function (id) {
        showModal('Cancel Reservation', '<p>Are you sure you want to cancel this reservation?</p>',
            `<button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">Keep It</button>
       <button class="btn btn-danger" id="confirmCancel">Yes, Cancel</button>`
        );
        document.getElementById('confirmCancel').onclick = async () => {
            try {
                await API.cancelReservation(id);
                closeModal();
                showToast('Cancelled', 'Reservation has been cancelled', 'success');
                lookupReservations();
            } catch (e) { showToast('Error', e.message, 'error'); }
        };
    };

    // Calendar download
    function addToCalendar() {
        if (!lastConfirmedReservation) return;
        const r = lastConfirmedReservation;
        const start = new Date(`${r.reservation_date}T${r.reservation_time}:00`);
        const end = new Date(start.getTime() + 90 * 60000);
        const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${fmt(start)}\nDTEND:${fmt(end)}\nSUMMARY:Dinner at Al Seniour\nDESCRIPTION:Table ${r.table_number} for ${r.party_size} guests\nLOCATION:River Side, Tunis, Tunisia\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'reservation.ics';
        a.click();
    }

    // ═══════════════════════════════
    // STAFF: Dashboard
    // ═══════════════════════════════
    async function loadStaffDashboard() {
        $('#staffDate').textContent = formatDate(getToday());
        $('#resListDate').value = getToday();

        try {
            const [overview, todayRes] = await Promise.all([
                API.getAnalyticsOverview(),
                API.getReservations({ date: getToday() })
            ]);

            // Stats
            $('#staffStats').innerHTML = `
        <div class="stat-card"><div class="stat-icon gold">📋</div><div class="stat-value">${overview.today.reservations}</div><div class="stat-label">Today's Reservations</div></div>
        <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-value">${overview.today.covers}</div><div class="stat-label">Expected Covers</div></div>
        <div class="stat-card"><div class="stat-icon blue">✓</div><div class="stat-value">${overview.today.seated}</div><div class="stat-label">Currently Seated</div></div>
        <div class="stat-card"><div class="stat-icon red">✕</div><div class="stat-value">${overview.today.noShows}</div><div class="stat-label">No-Shows</div></div>
        <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-value">${overview.waitlist}</div><div class="stat-label">On Waitlist</div></div>
      `;

            // Upcoming arrivals
            const upcoming = todayRes.filter(r => r.status === 'confirmed');
            $('#arrivalsCount').textContent = upcoming.length;
            $('#upcomingArrivals').innerHTML = upcoming.length > 0 ? upcoming.slice(0, 8).map(r => `
        <div class="flex-between mb-3" style="padding:var(--sp-3);background:var(--color-bg-secondary);border-radius:var(--radius-md);">
          <div class="flex gap-3" style="align-items:center;">
            <div class="avatar">${(r.customer_name || '?')[0]}</div>
            <div>
              <div style="font-weight:var(--fw-medium);font-size:var(--fs-sm);">${r.customer_name}</div>
              <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${formatTime(r.reservation_time)} · ${r.party_size} guests · T${r.table_number}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-primary" onclick="window._seatGuest('${r.id}')">Seat</button>
            <button class="btn btn-sm btn-ghost" onclick="window._markNoShow('${r.id}')">No-Show</button>
          </div>
        </div>
      `).join('') : '<p class="text-muted text-center" style="padding:var(--sp-8);">No upcoming arrivals</p>';

            // Recent activity
            const recent = todayRes.filter(r => r.status !== 'confirmed').slice(0, 6);
            $('#recentActivity').innerHTML = recent.length > 0 ? recent.map(r => `
        <div class="flex-between mb-2" style="padding:var(--sp-2);">
          <span style="font-size:var(--fs-sm);">${r.customer_name} – T${r.table_number}</span>
          ${getStatusBadge(r.status)}
        </div>
      `).join('') : '<p class="text-muted text-center" style="padding:var(--sp-4);">No activity yet today</p>';

        } catch (e) {
            showToast('Error', 'Failed to load dashboard: ' + e.message, 'error');
        }
    }

    window._seatGuest = async function (id) {
        try {
            await API.updateReservationStatus(id, 'seated');
            showToast('Seated', 'Guest has been seated', 'success');
            loadStaffDashboard();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    window._markNoShow = async function (id) {
        try {
            await API.updateReservationStatus(id, 'no-show');
            showToast('No-Show', 'Marked as no-show', 'warning');
            loadStaffDashboard();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    window._completeGuest = async function (id) {
        try {
            await API.updateReservationStatus(id, 'completed');
            showToast('Completed', 'Guest visit completed', 'success');
            loadFloorMap();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    // ═══════════════════════════════
    // STAFF: Floor Map
    // ═══════════════════════════════
    async function loadFloorMap() {
        try {
            const [tables, reservations] = await Promise.all([
                API.getTables(),
                API.getReservations({ date: getToday() })
            ]);

            const filter = $('#floorFilter').value;
            const filtered = filter === 'all' ? tables : tables.filter(t => t.location === filter);

            // Determine real status based on reservations
            const seatedTableIds = new Set(reservations.filter(r => r.status === 'seated').map(r => r.table_id));
            const confirmedTableIds = new Set(reservations.filter(r => r.status === 'confirmed').map(r => r.table_id));

            const map = $('#floorMap');
            map.innerHTML = filtered.map(t => {
                let status = t.status;
                if (seatedTableIds.has(t.id)) status = 'occupied';
                else if (confirmedTableIds.has(t.id)) status = 'reserved';

                const res = reservations.find(r => r.table_id === t.id && (r.status === 'seated' || r.status === 'confirmed'));

                return `
          <div class="table-node ${status}" style="left:${t.pos_x}px;top:${t.pos_y}px;" onclick="window._showTablePopup('${t.id}', event)" title="Table ${t.table_number} – ${t.capacity} seats – ${status}">
            <div class="table-node-number">${t.table_number}</div>
            <div class="table-node-seats">${t.capacity}s</div>
          </div>
        `;
            }).join('');

            // Store data for popup
            window._floorTables = tables;
            window._floorReservations = reservations;

        } catch (e) {
            showToast('Error', 'Failed to load floor map: ' + e.message, 'error');
        }
    }

    window._showTablePopup = function (tableId, event) {
        event.stopPropagation();
        document.querySelectorAll('.table-popup').forEach(p => p.remove());

        const table = window._floorTables.find(t => t.id === tableId);
        const res = window._floorReservations?.filter(r => r.table_id === tableId && r.status !== 'cancelled' && r.status !== 'completed');

        const popup = document.createElement('div');
        popup.className = 'table-popup';
        popup.style.left = (table.pos_x + 80) + 'px';
        popup.style.top = table.pos_y + 'px';

        let resInfo = '';
        if (res && res.length > 0) {
            resInfo = res.map(r => `
        <div style="font-size:var(--fs-xs);padding:var(--sp-2);background:var(--color-bg-secondary);border-radius:var(--radius-sm);margin-bottom:var(--sp-2);">
          <div><strong>${r.customer_name}</strong> · ${r.party_size} guests</div>
          <div class="text-muted">${formatTime(r.reservation_time)} ${getStatusBadge(r.status)}</div>
        </div>
      `).join('');
        }

        popup.innerHTML = `
      <div class="table-popup-header">
        <strong>Table ${table.table_number}</strong>
        <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">${table.capacity} seats · ${table.location}</span>
      </div>
      ${resInfo || '<p style="font-size:var(--fs-xs);color:var(--color-text-muted);">No reservations</p>'}
      <div class="table-popup-actions">
        <button class="btn btn-sm btn-secondary w-full" onclick="window._setTableStatus('${tableId}', 'available')">Set Available</button>
        <button class="btn btn-sm btn-secondary w-full" onclick="window._setTableStatus('${tableId}', 'cleaning')">Set Cleaning</button>
        ${res && res.find(r => r.status === 'seated') ? `<button class="btn btn-sm btn-primary w-full" onclick="window._completeGuest('${res.find(r => r.status === 'seated').id}')">Complete Visit</button>` : ''}
        ${res && res.find(r => r.status === 'confirmed') ? `<button class="btn btn-sm btn-primary w-full" onclick="window._seatGuest('${res.find(r => r.status === 'confirmed').id}')">Seat Guest</button>` : ''}
      </div>
    `;

        $('#floorMap').appendChild(popup);

        const closeFn = (e) => {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closeFn); }
        };
        setTimeout(() => document.addEventListener('click', closeFn), 100);
    };

    window._setTableStatus = async function (id, status) {
        try {
            await API.updateTable(id, { status });
            document.querySelectorAll('.table-popup').forEach(p => p.remove());
            loadFloorMap();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    // ═══════════════════════════════
    // STAFF: Reservations List
    // ═══════════════════════════════
    async function loadReservationsList() {
        const date = $('#resListDate').value || getToday();
        const status = $('#resListFilter').value;
        const filters = { date };
        if (status) filters.status = status;

        try {
            const reservations = await API.getReservations(filters);
            $('#resListCount').textContent = `${reservations.length} reservation(s)`;

            const list = $('#reservationsList');
            if (reservations.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding:var(--sp-8);"><p class="text-muted">No reservations found</p></div>';
                return;
            }

            list.innerHTML = reservations.map(r => `
        <div class="reservation-row" onclick="window._showReservationDetail('${r.id}')">
          <span style="font-weight:var(--fw-semibold);">${formatTime(r.reservation_time)}</span>
          <div>
            <div style="font-weight:var(--fw-medium);">${r.customer_name || 'Unknown'}</div>
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${r.customer_phone || ''}</div>
          </div>
          <span>👥 ${r.party_size}</span>
          <span>Table ${r.table_number || '—'}</span>
          ${getStatusBadge(r.status)}
          <div class="flex gap-2">
            ${r.status === 'confirmed' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();window._seatGuest('${r.id}')">Seat</button>` : ''}
            ${r.status === 'seated' ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window._completeGuest('${r.id}')">Done</button>` : ''}
          </div>
        </div>
      `).join('');
        } catch (e) {
            showToast('Error', 'Failed to load reservations: ' + e.message, 'error');
        }
    }

    window._showReservationDetail = async function (id) {
        try {
            const r = await API.getReservation(id);
            showModal(`Reservation – ${r.customer_name}`, `
        <div class="confirm-details">
          <div class="confirm-detail-row"><span class="confirm-detail-label">ID</span><span class="confirm-detail-value">${r.id.slice(0, 8).toUpperCase()}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Date</span><span class="confirm-detail-value">${formatDate(r.reservation_date)}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Time</span><span class="confirm-detail-value">${formatTime(r.reservation_time)}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Party</span><span class="confirm-detail-value">${r.party_size} guests</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Table</span><span class="confirm-detail-value">${r.table_number ? 'Table ' + r.table_number + ' (' + r.table_location + ')' : 'Unassigned'}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Phone</span><span class="confirm-detail-value">${r.customer_phone || '—'}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Email</span><span class="confirm-detail-value">${r.customer_email || '—'}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Requests</span><span class="confirm-detail-value">${r.special_requests || '—'}</span></div>
          <div class="confirm-detail-row"><span class="confirm-detail-label">Status</span>${getStatusBadge(r.status)}</div>
        </div>
      `, `
        ${r.status === 'confirmed' ? `<button class="btn btn-primary" onclick="window._seatGuest('${r.id}');document.getElementById('modalOverlay').classList.remove('active')">Seat Guest</button>` : ''}
        ${r.status === 'confirmed' ? `<button class="btn btn-danger" onclick="window._cancelReservation('${r.id}');document.getElementById('modalOverlay').classList.remove('active')">Cancel</button>` : ''}
        <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">Close</button>
      `);
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    // ═══════════════════════════════
    // STAFF: New Booking (Manual)
    // ═══════════════════════════════
    function showNewBookingModal() {
        showModal('New Booking', `
      <div class="form-group"><label class="form-label">Customer Name *</label><input type="text" class="form-input" id="mbName"></div>
      <div class="form-group"><label class="form-label">Phone *</label><input type="tel" class="form-input" id="mbPhone"></div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="mbEmail"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);">
        <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="mbDate" value="${getToday()}" min="${getToday()}"></div>
        <div class="form-group"><label class="form-label">Time</label><input type="time" class="form-input" id="mbTime" value="19:00"></div>
      </div>
      <div class="form-group"><label class="form-label">Party Size</label><input type="number" class="form-input" id="mbParty" value="2" min="1" max="20"></div>
      <div class="form-group"><label class="form-label">Special Requests</label><textarea class="form-input form-textarea" id="mbRequests" rows="2"></textarea></div>
    `, `
      <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">Cancel</button>
      <button class="btn btn-primary" id="mbSubmit">Create Booking</button>
    `);

        document.getElementById('mbSubmit').onclick = async () => {
            const name = document.getElementById('mbName').value.trim();
            const phone = document.getElementById('mbPhone').value.trim();
            if (!name || !phone) { showToast('Required', 'Name and phone are required', 'warning'); return; }

            try {
                await API.createReservation({
                    customer_name: name,
                    customer_phone: phone,
                    customer_email: document.getElementById('mbEmail').value.trim(),
                    reservation_date: document.getElementById('mbDate').value,
                    reservation_time: document.getElementById('mbTime').value,
                    party_size: parseInt(document.getElementById('mbParty').value),
                    special_requests: document.getElementById('mbRequests').value.trim()
                });
                closeModal();
                showToast('Booked!', `Reservation created for ${name}`, 'success');
                loadStaffDashboard();
            } catch (e) { showToast('Error', e.message, 'error'); }
        };
    }

    // ═══════════════════════════════
    // STAFF: Waitlist
    // ═══════════════════════════════
    async function loadWaitlist() {
        try {
            const entries = await API.getWaitlist('waiting');
            const container = $('#waitlistContainer');

            if (entries.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding:var(--sp-8);"><div class="empty-state-icon">📋</div><h4 class="empty-state-title">Waitlist is empty</h4><p class="empty-state-text">Add walk-in guests to the waitlist</p></div>';
                return;
            }

            container.innerHTML = entries.map((e, i) => `
        <div class="waitlist-item">
          <div class="waitlist-item-info">
            <div class="waitlist-item-position">${i + 1}</div>
            <div class="waitlist-item-details">
              <h5>${e.name}</h5>
              <div class="waitlist-item-meta">👥 ${e.party_size} · ⏱ ~${e.estimated_wait} min ${e.phone ? '· ' + e.phone : ''}</div>
            </div>
          </div>
          <div class="waitlist-item-actions">
            <button class="btn btn-sm btn-primary" onclick="window._seatFromWaitlist('${e.id}', '${e.name}', ${e.party_size})">Seat</button>
            <button class="btn btn-sm btn-ghost" onclick="window._removeFromWaitlist('${e.id}')">Remove</button>
          </div>
        </div>
      `).join('');
        } catch (e) {
            showToast('Error', 'Failed to load waitlist: ' + e.message, 'error');
        }
    }

    function showAddToWaitlistModal() {
        showModal('Add to Waitlist', `
      <div class="form-group"><label class="form-label">Name *</label><input type="text" class="form-input" id="wlName"></div>
      <div class="form-group"><label class="form-label">Phone</label><input type="tel" class="form-input" id="wlPhone"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);">
        <div class="form-group"><label class="form-label">Party Size *</label><input type="number" class="form-input" id="wlParty" value="2" min="1"></div>
        <div class="form-group"><label class="form-label">Est. Wait (min)</label><input type="number" class="form-input" id="wlWait" value="30" min="5"></div>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">Cancel</button>
      <button class="btn btn-primary" id="wlSubmit">Add</button>
    `);
        document.getElementById('wlSubmit').onclick = async () => {
            const name = document.getElementById('wlName').value.trim();
            if (!name) { showToast('Required', 'Name is required', 'warning'); return; }
            try {
                await API.addToWaitlist({
                    name,
                    phone: document.getElementById('wlPhone').value.trim(),
                    party_size: parseInt(document.getElementById('wlParty').value),
                    estimated_wait: parseInt(document.getElementById('wlWait').value)
                });
                closeModal();
                showToast('Added', `${name} added to waitlist`, 'success');
                loadWaitlist();
            } catch (e) { showToast('Error', e.message, 'error'); }
        };
    }

    window._removeFromWaitlist = async function (id) {
        try {
            await API.removeFromWaitlist(id);
            showToast('Removed', 'Removed from waitlist', 'info');
            loadWaitlist();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    window._seatFromWaitlist = async function (id, name, partySize) {
        try {
            await API.removeFromWaitlist(id);
            await API.createReservation({
                customer_name: name,
                reservation_date: getToday(),
                reservation_time: new Date().toTimeString().slice(0, 5),
                party_size: partySize,
                special_requests: 'Walk-in from waitlist'
            });
            showToast('Seated!', `${name} seated from waitlist`, 'success');
            loadWaitlist();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    // ═══════════════════════════════
    // ADMIN: Restaurant Config
    // ═══════════════════════════════
    async function loadAdminConfig() {
        try {
            const info = await API.getRestaurant();
            $('#cfgName').value = info.name || '';
            $('#cfgAddress').value = info.address || '';
            $('#cfgPhone').value = info.phone || '';
            $('#cfgEmail').value = info.email || '';
            $('#cfgMenuUrl').value = info.menu_url || '';
            $('#cfgTurnover').value = info.turnover_minutes || 90;
            $('#cfgDescription').value = info.description || '';

            // Hours editor
            const hours = typeof info.operating_hours === 'string' ? JSON.parse(info.operating_hours) : (info.operating_hours || {});
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            $('#hoursEditor').innerHTML = `<div class="hours-grid">
        <div class="form-label">Day</div><div class="form-label">Open</div><div class="form-label">Close</div>
        ${days.map(d => `
          <div class="hours-day">${d.charAt(0).toUpperCase() + d.slice(1)}</div>
          <input type="time" class="form-input" id="hours-${d}-open" value="${hours[d]?.open || '12:00'}">
          <input type="time" class="form-input" id="hours-${d}-close" value="${hours[d]?.close || '23:00'}">
        `).join('')}
      </div>`;
        } catch (e) {
            showToast('Error', 'Failed to load config: ' + e.message, 'error');
        }
    }

    async function saveAdminConfig() {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const operating_hours = {};
        days.forEach(d => {
            operating_hours[d] = {
                open: document.getElementById(`hours-${d}-open`)?.value || '12:00',
                close: document.getElementById(`hours-${d}-close`)?.value || '23:00'
            };
        });

        try {
            await API.updateRestaurant({
                name: $('#cfgName').value,
                address: $('#cfgAddress').value,
                phone: $('#cfgPhone').value,
                email: $('#cfgEmail').value,
                menu_url: $('#cfgMenuUrl').value,
                turnover_minutes: parseInt($('#cfgTurnover').value),
                description: $('#cfgDescription').value,
                operating_hours
            });
            showToast('Saved!', 'Restaurant configuration updated', 'success');
        } catch (e) { showToast('Error', e.message, 'error'); }
    }

    // ═══════════════════════════════
    // ADMIN: Table Management
    // ═══════════════════════════════
    async function loadTableManagement() {
        try {
            const tables = await API.getTables();
            $('#tableCount').textContent = tables.length;

            $('#tableEditorList').innerHTML = tables.map(t => `
        <div class="table-edit-row">
          <span style="font-weight:var(--fw-bold);">#${t.table_number}</span>
          <span>${t.capacity} seats</span>
          <span class="badge badge-info">${t.location}</span>
          ${getStatusBadge(t.status)}
          <button class="btn btn-icon btn-ghost sm" onclick="window._deleteTable('${t.id}')" title="Delete">🗑</button>
        </div>
      `).join('');
        } catch (e) {
            showToast('Error', 'Failed to load tables: ' + e.message, 'error');
        }
    }

    async function addTable() {
        const number = parseInt($('#newTableNumber').value);
        const capacity = parseInt($('#newTableCapacity').value);
        const location = $('#newTableLocation').value;
        if (!number || !capacity) { showToast('Required', 'Table number and capacity are required', 'warning'); return; }

        try {
            await API.createTable({ table_number: number, capacity, location });
            showToast('Added!', `Table ${number} added`, 'success');
            $('#newTableNumber').value = '';
            $('#newTableCapacity').value = '';
            loadTableManagement();
        } catch (e) { showToast('Error', e.message, 'error'); }
    }

    window._deleteTable = async function (id) {
        if (!confirm('Delete this table?')) return;
        try {
            await API.deleteTable(id);
            showToast('Deleted', 'Table removed', 'info');
            loadTableManagement();
        } catch (e) { showToast('Error', e.message, 'error'); }
    };

    // ═══════════════════════════════
    // ADMIN: Analytics
    // ═══════════════════════════════
    async function loadAnalytics() {
        const days = parseInt($('#analyticsPeriod').value);
        try {
            const [overview, trends, peakHours, utilization] = await Promise.all([
                API.getAnalyticsOverview(),
                API.getAnalyticsTrends(days),
                API.getPeakHours(),
                API.getTableUtilization()
            ]);

            // Summary stats
            const totalRes = trends.reduce((s, t) => s + t.reservations, 0);
            const totalCovers = trends.reduce((s, t) => s + (t.covers || 0), 0);
            const totalNoShows = trends.reduce((s, t) => s + (t.no_shows || 0), 0);
            const noShowRate = totalRes > 0 ? ((totalNoShows / totalRes) * 100).toFixed(1) : 0;

            $('#analyticsStats').innerHTML = `
        <div class="stat-card"><div class="stat-icon gold">📋</div><div class="stat-value">${totalRes}</div><div class="stat-label">Total Reservations</div></div>
        <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-value">${totalCovers}</div><div class="stat-label">Total Covers</div></div>
        <div class="stat-card"><div class="stat-icon red">✕</div><div class="stat-value">${noShowRate}%</div><div class="stat-label">No-Show Rate</div></div>
        <div class="stat-card"><div class="stat-icon blue">🍽️</div><div class="stat-value">${utilization.length}</div><div class="stat-label">Active Tables</div></div>
      `;

            // Peak hours chart
            const maxCount = Math.max(...peakHours.map(h => h.count), 1);
            const peakChart = peakHours.map(h => `
        <div class="bar" style="height:${(h.count / maxCount) * 100}%;">
          <span class="bar-label">${h.hour}:00</span>
          <span class="bar-value">${h.count}</span>
        </div>
      `).join('');

            // Table utilization
            const utilRows = utilization.map(t => `
        <div class="trend-item">
          <span class="trend-item-label">T${t.table_number} (${t.capacity}s, ${t.location})</span>
          <span class="trend-item-value">${t.total_reservations} bookings</span>
        </div>
      `).join('');

            $('#analyticsCharts').innerHTML = `
        <div class="chart-card">
          <h4>Peak Hours</h4>
          <div class="chart-container"><div class="bar-chart" style="padding-bottom:24px;">${peakChart || '<p class="text-muted">No data yet</p>'}</div></div>
        </div>
        <div class="chart-card">
          <h4>Table Utilization</h4>
          <div class="trend-list">${utilRows || '<p class="text-muted">No data yet</p>'}</div>
        </div>
      `;
        } catch (e) {
            showToast('Error', 'Failed to load analytics: ' + e.message, 'error');
        }
    }

    // ═══════════════════════════════
    // SSE Real-time Updates
    // ═══════════════════════════════
    function setupRealtimeUpdates() {
        API.connectSync();

        API.on('reservation_created', (data) => {
            showToast('New Reservation', `${data.customer_name} – ${formatTime(data.reservation_time)}`, 'info');
            if (currentApp === 'staff') loadStaffDashboard();
        });

        API.on('reservation_updated', () => {
            if (currentApp === 'staff') loadStaffDashboard();
        });

        API.on('reservation_status_changed', (data) => {
            if (currentApp === 'staff') {
                loadStaffDashboard();
                loadFloorMap();
            }
        });

        API.on('reservation_cancelled', () => {
            if (currentApp === 'staff') loadStaffDashboard();
        });

        API.on('table_updated', () => {
            if (currentApp === 'staff') loadFloorMap();
        });

        API.on('waitlist_added', () => {
            if (currentApp === 'staff') loadWaitlist();
        });
    }

    // ═══════════════════════════════
    // Initialize
    // ═══════════════════════════════
    function init() {
        // Navigation
        document.addEventListener('click', (e) => {
            const navBtn = e.target.closest('[data-nav]');
            if (navBtn) { navigateTo(navBtn.dataset.nav); return; }

            const staffNav = e.target.closest('[data-staff-nav]');
            if (staffNav) { handleStaffNav(staffNav.dataset.staffNav); return; }

            const adminNav = e.target.closest('[data-admin-nav]');
            if (adminNav) { handleAdminNav(adminNav.dataset.adminNav); return; }
        });

        // Customer: Reservation form
        $('#checkAvailability').addEventListener('click', checkAvailability);
        $('#backToStep1').addEventListener('click', () => showReserveStep(1));
        $('#proceedToDetails').addEventListener('click', () => showReserveStep(3));
        $('#backToStep2').addEventListener('click', () => showReserveStep(2));
        $('#confirmReservation').addEventListener('click', confirmReservation);
        $('#addToCalendar').addEventListener('click', addToCalendar);
        $('#lookupReservations').addEventListener('click', lookupReservations);
        $('#lookupField').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupReservations(); });

        // Pre-fill lookup
        const savedEmail = localStorage.getItem('userEmail');
        const savedPhone = localStorage.getItem('userPhone');
        if (savedEmail) $('#lookupField').value = savedEmail;
        else if (savedPhone) $('#lookupField').value = savedPhone;

        // Staff
        $('#staffNewBooking').addEventListener('click', showNewBookingModal);
        $('#resListDate').addEventListener('change', loadReservationsList);
        $('#resListFilter').addEventListener('change', loadReservationsList);
        $('#floorFilter').addEventListener('change', loadFloorMap);
        $('#addToWaitlist').addEventListener('click', showAddToWaitlistModal);

        // Admin
        $('#saveConfig').addEventListener('click', saveAdminConfig);
        $('#addTableBtn').addEventListener('click', addTable);
        $('#analyticsPeriod').addEventListener('change', loadAnalytics);

        // Mobile menu
        const customerMenuBtn = $('#customerMenuBtn');
        const staffMenuBtn = $('#staffMenuBtn');
        const adminMenuBtn = $('#adminMenuBtn');

        if (customerMenuBtn) customerMenuBtn.addEventListener('click', () => $('.topbar-nav').classList.toggle('mobile-open'));
        if (staffMenuBtn) staffMenuBtn.addEventListener('click', () => $('#staffSidebar').classList.add('open'));
        if (adminMenuBtn) adminMenuBtn.addEventListener('click', () => $('#adminSidebar').classList.add('open'));

        // Sidebar close buttons
        const closeStaffSidebar = $('#closeStaffSidebar');
        const closeAdminSidebar = $('#closeAdminSidebar');
        if (closeStaffSidebar) closeStaffSidebar.addEventListener('click', () => $('#staffSidebar').classList.remove('open'));
        if (closeAdminSidebar) closeAdminSidebar.addEventListener('click', () => $('#adminSidebar').classList.remove('open'));

        // Close sidebars on nav link click
        $$('.sidebar .nav-link').forEach(link => {
            link.addEventListener('click', () => {
                $('#staffSidebar').classList.remove('open');
                $('#adminSidebar').classList.remove('open');
            });
        });

        // Modal close on overlay click
        $('#modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

        // Init reservation form
        initReservationForm();

        // Load home data
        loadRestaurantInfo();

        // Handle hash routing
        const hash = window.location.hash.replace('#', '') || 'home';
        navigateTo(hash);

        // SSE
        setupRealtimeUpdates();

        console.log('🍽️ Restaurant Reservation System initialized');
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);

})();
