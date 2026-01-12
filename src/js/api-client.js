/**
 * API Client
 * 
 * Wrapper for backend API calls and WebSocket connection.
 */

class APIClient {
    constructor(baseURL = 'http://localhost:3003') {
        this.baseURL = baseURL;
        this.ws = null;
        this.eventHandlers = new Map();
    }

    // ============================================================================
    // HTTP Methods
    // ============================================================================

    async get(endpoint) {
        try {
            console.log(`GET ${this.baseURL}${endpoint}`);
            const response = await fetch(`${this.baseURL}${endpoint}`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP ${response.status} error:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log(`GET ${endpoint} response:`, result);
            return result;
        } catch (error) {
            console.error(`GET ${endpoint} failed:`, error);
            throw error;
        }
    }

    async post(endpoint, data) {
        try {
            console.log(`POST ${this.baseURL}${endpoint}`, data);
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const error = await response.json();
                console.error(`HTTP ${response.status} error:`, error);
                throw new Error(error.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log(`POST ${endpoint} response:`, result);
            return result;
        } catch (error) {
            console.error(`POST ${endpoint} failed:`, error);
            throw error;
        }
    }

    async put(endpoint, data) {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }

    async delete(endpoint) {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }

    // ============================================================================
    // Settings API
    // ============================================================================

    async getSettings() {
        return await this.get('/api/settings');
    }

    async updateSettings(settings) {
        return await this.put('/api/settings', settings);
    }

    async testAPIConnection(service) {
        return await this.post(`/api/settings/test/${service}`, {});
    }

    // ============================================================================
    // Agents API
    // ============================================================================

    async createAgent(config) {
        return await this.post('/api/agents', config);
    }

    async getAgents() {
        return await this.get('/api/agents');
    }

    async getAgent(id) {
        return await this.get(`/api/agents/${id}`);
    }

    async startAgent(id) {
        return await this.post(`/api/agents/${id}/start`, {});
    }

    async stopAgent(id) {
        return await this.post(`/api/agents/${id}/stop`, {});
    }

    async chatWithAgent(id, message) {
        return await this.post(`/api/agents/${id}/chat`, { message });
    }

    async submitClarification(id, answers) {
        return await this.post(`/api/agents/${id}/clarification`, { answers });
    }

    async approveAgent(id, feedback = null) {
        return await this.post(`/api/agents/${id}/approve`, { feedback });
    }

    async deleteAgent(id) {
        return await this.delete(`/api/agents/${id}`);
    }

    async bulkDeleteAgents(agentIds) {
        return await this.post('/api/agents/bulk-delete', { agentIds });
    }

    // ============================================================================
    // Documents API
    // ============================================================================

    async uploadDocument(filename, base64Data) {
        return await this.post('/api/documents/upload', {
            filename,
            data: base64Data
        });
    }

    async getDocuments() {
        return await this.get('/api/documents');
    }

    async deleteDocument(id) {
        return await this.delete(`/api/documents/${id}`);
    }

    // ============================================================================
    // Orchestrator API
    // ============================================================================

    async getOrchestratorStatus() {
        return await this.get('/api/orchestrator/status');
    }

    async triggerSynthesis() {
        return await this.post('/api/orchestrator/synthesize', {});
    }

    async getOrchestratorState() {
        return await this.get('/api/orchestrator/state');
    }

    async createHypothesis(text) {
        return await this.post('/api/orchestrator/hypotheses', { text });
    }

    async evaluateHypothesis(id) {
        return await this.post(`/api/orchestrator/hypotheses/${id}/evaluate`, {});
    }

    async deleteHypothesis(id) {
        return await this.delete(`/api/orchestrator/hypotheses/${id}`);
    }

    async generateExecutiveSummary(insights) {
        return await this.post('/api/orchestrator/executive-summary', { insights });
    }

    async saveExecutiveSummary(bullets) {
        return await this.put('/api/orchestrator/executive-summary', { bullets });
    }

    // ============================================================================
    // Insights API
    // ============================================================================

    async getInsights() {
        return await this.get('/api/insights');
    }

    async saveInsight(text, agentId, timestamp) {
        return await this.post('/api/insights', { text, agentId, timestamp });
    }

    async deleteInsight(id) {
        return await this.delete(`/api/insights/${id}`);
    }

    // ============================================================================
    // WebSocket Connection
    // ============================================================================

    connectWebSocket() {
        const wsURL = this.baseURL.replace('http', 'ws');
        this.ws = new WebSocket(wsURL);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.ws.send(JSON.stringify({ type: 'subscribe' }));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(), 5000);
        };
    }

    handleWebSocketMessage(data) {
        const { event, data: payload } = data;
        
        // Emit to registered handlers
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            handlers.forEach(handler => handler(payload));
        }

        // Emit to 'all' handlers
        if (this.eventHandlers.has('*')) {
            const handlers = this.eventHandlers.get('*');
            handlers.forEach(handler => handler({ event, payload }));
        }
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Export for use in other scripts
window.APIClient = APIClient;
