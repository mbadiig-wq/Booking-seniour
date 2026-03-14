const API = {
    base: '',
    token: localStorage.getItem('seniour_token') || null,

    setToken(token, role = null) {
        this.token = token;
        if (token) {
            localStorage.setItem('seniour_token', token);
            if (role) localStorage.setItem('seniour_role', role);
        } else {
            localStorage.removeItem('seniour_token');
            localStorage.removeItem('seniour_role');
        }
    },

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        return headers;
    },

    // ── HTTP Methods ──
    async get(endpoint) {
        const res = await fetch(this.base + endpoint, { headers: this.getHeaders() });
        if (res.status === 401) this.setToken(null);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.message || 'Request failed');
        }
        return res.json();
    },

    async post(endpoint, data) {
        const res = await fetch(this.base + endpoint, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (res.status === 401) this.setToken(null);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.message || 'Request failed');
        }
        return res.json();
    },

    async put(endpoint, data) {
        const res = await fetch(this.base + endpoint, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (res.status === 401) this.setToken(null);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.message || 'Request failed');
        }
        return res.json();
    },

    async del(endpoint) {
        const res = await fetch(this.base + endpoint, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (res.status === 401) this.setToken(null);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.message || 'Request failed');
        }
        return res.json();
    },

    // Auth
    async login(password) {
        const data = await this.post('/api/auth/login', { password });
        this.setToken(data.token, data.role);
        return data; // { token, role }
    },

    // ── Real-time Sync (Supabase or Local SSE) ──
    supabase: null,
    channel: null,

    connectSync() {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.ENV || {};

        if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
            this.connectSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
            this.connectSSE();
        }
    },

    connectSupabase(url, key) {
        if (this.supabase) return;
        console.log('🐘 Connecting to Supabase Realtime...');
        this.supabase = window.supabase.createClient(url, key);

        this.channel = this.supabase.channel('public:restaurant_events')
            .on('broadcast', { event: '*' }, (payload) => {
                console.log('📡 Supabase sync:', payload.event, payload.payload);
                this.emit(payload.event, payload.payload);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log('✅ Subscribed to Supabase Realtime');
                if (status === 'CHANNEL_ERROR') {
                    console.warn('❌ Supabase sub error, falling back to SSE');
                    this.connectSSE();
                }
            });
    },

    connectSSE() {
        if (this.eventSource) this.eventSource.close();
        console.log('🐚 Connecting to local SSE...');
        this.eventSource = new EventSource(this.base + '/api/events');

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit(data.type, data.data);
            } catch (e) {
                console.warn('SSE parse error:', e);
            }
        };

        this.eventSource.onerror = () => {
            console.warn('SSE connection error, reconnecting in 3s...');
            setTimeout(() => this.connectSSE(), 3000);
        };
    },

    // ── Event Emitter ──
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
        // Also emit a wildcard event
        if (this.listeners['*']) {
            this.listeners['*'].forEach(cb => cb(event, data));
        }
    },

    // ── Convenience Methods ──

    // Customers
    getCustomers(search) {
        const q = search ? `?search=${encodeURIComponent(search)}` : '';
        return this.get(`/api/customers${q}`);
    },
    getCustomer(id) { return this.get(`/api/customers/${id}`); },
    createCustomer(data) { return this.post('/api/customers', data); },
    updateCustomer(id, data) { return this.put(`/api/customers/${id}`, data); },

    // Tables
    getTables(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return this.get(`/api/tables${params ? '?' + params : ''}`);
    },
    checkAvailability(date, time, partySize) {
        return this.get(`/api/tables/available?date=${date}&time=${time}&partySize=${partySize}`);
    },
    createTable(data) { return this.post('/api/tables', data); },
    updateTable(id, data) { return this.put(`/api/tables/${id}`, data); },
    deleteTable(id) { return this.del(`/api/tables/${id}`); },

    // Reservations
    getReservations(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return this.get(`/api/reservations${params ? '?' + params : ''}`);
    },
    getReservation(id) { return this.get(`/api/reservations/${id}`); },
    createReservation(data) { return this.post('/api/reservations', data); },
    updateReservation(id, data) { return this.put(`/api/reservations/${id}`, data); },
    updateReservationStatus(id, status) { return this.put(`/api/reservations/${id}/status`, { status }); },
    cancelReservation(id) { return this.del(`/api/reservations/${id}`); },

    // Restaurant
    getRestaurant() { return this.get('/api/restaurant'); },
    updateRestaurant(data) { return this.put('/api/restaurant', data); },

    // Waitlist
    getWaitlist(status) {
        const q = status ? `?status=${status}` : '';
        return this.get(`/api/waitlist${q}`);
    },
    addToWaitlist(data) { return this.post('/api/waitlist', data); },
    updateWaitlistEntry(id, data) { return this.put(`/api/waitlist/${id}`, data); },
    removeFromWaitlist(id) { return this.del(`/api/waitlist/${id}`); },

    // Analytics
    getAnalyticsOverview() { return this.get('/api/analytics/overview'); },
    getAnalyticsTrends(days) { return this.get(`/api/analytics/trends?days=${days}`); },
    getPeakHours() { return this.get('/api/analytics/peak-hours'); },
    getTableUtilization() { return this.get('/api/analytics/table-utilization'); }
};
