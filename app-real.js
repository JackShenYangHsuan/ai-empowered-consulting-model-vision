/**
 * Command Center - Real Backend Integration
 * 
 * This version connects to the real backend API.
 * No simulation - uses actual GPT-4 agents.
 */

// Initialize API Client
const api = new APIClient('http://localhost:3003');

// Application State
const app = {
    agents: [],
    orchestratorStatus: null,
    currentView: 'dashboard',
    selectedAgent: null,
    selectedAgents: new Set(), // For bulk operations
    reportedInsights: [],
    insightsSignature: null,
    summarySignature: null,
    executiveSummary: [],
    editingExecutiveSummary: false,
    hypotheses: [],
    newHypothesisText: '',
    hypothesisStatusMessage: '',
    hypothesisSaving: false,
    projectContext: {
        keyQuestion: '',
        constraints: '',
        otherContext: ''
    },

    async init() {
        console.log('🚀 Initializing Command Center...');
        
        try {
            // Initialize Firebase first
            await this.waitForFirebase();
            
            // Attach UI event listeners
            this.attachEventListeners();
            
            // Setup WebSocket listeners
            this.setupWebSocketHandlers();
            api.connectWebSocket();
            
            // Load existing agents from Firebase
            await this.loadAgents();
            await this.loadOrchestratorStatus();
            await this.loadOrchestratorState();
            this.renderHypotheses();
            await this.renderInsights();
            
            // Update UI
            this.updateUI();

            // Load and setup orchestrator name editing
            this.loadOrchestratorName();

            // Load project context
            this.loadProjectContext();
            this.setupOrchestratorNameEditing();

            // Set up real-time listener for agent updates
            this.setupFirebaseListeners();

            console.log('✅ Command Center initialized successfully!');
        } catch (error) {
            console.error('❌ Error initializing app:', error);
            alert('Failed to initialize Command Center: ' + error.message);
        }
    },
    
    async waitForFirebase() {
        // Wait for Firebase SDK to load
        let attempts = 0;
        while (!window.firebase && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.firebase) {
            throw new Error('Firebase SDK failed to load');
        }
        
        // Initialize Firebase
        if (!db) {
            const initialized = initFirebase();
            if (!initialized) {
                throw new Error('Failed to initialize Firebase');
            }
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('✅ Firebase ready');
    },
    
    setupFirebaseListeners() {
        if (!db) return;
        
        // Listen for real-time updates to agents collection
        db.collection('agents').onSnapshot((snapshot) => {
            console.log('📡 Agents updated in Firebase');
            snapshot.docChanges().forEach((change) => {
                const agentData = { id: change.doc.id, ...change.doc.data() };
                
                if (change.type === 'added') {
                    console.log('New agent:', agentData);
                    const exists = this.agents.find(a => a.id === agentData.id);
                    if (!exists) {
                        this.agents.push(agentData);
                    }
                }
                if (change.type === 'modified') {
                    console.log('Modified agent:', agentData);
                    const index = this.agents.findIndex(a => a.id === agentData.id);
                    if (index >= 0) {
                        this.agents[index] = agentData;
                    }
                }
                if (change.type === 'removed') {
                    console.log('Removed agent:', agentData);
                    this.agents = this.agents.filter(a => a.id !== agentData.id);
                }
            });
            
            this.updateUI();
        }, (error) => {
            console.error('Error listening to agents:', error);
        });
    },
    
    // ========================================================================
    // WebSocket Event Handlers
    // ========================================================================
    
    setupWebSocketHandlers() {
        console.log('Setting up WebSocket event handlers...');
        
        // Agent created
        api.on('agent:created', (data) => {
            console.log('Agent created:', data);
            // Firebase real-time listener will handle updates automatically
        });
        
        // Agent started
        api.on('agent:started', (data) => {
            console.log('Agent started:', data);
            this.updateAgentInList(data.agentId);
        });
        
        // Phase started
        api.on('agent:phaseStarted', (data) => {
            console.log('Agent phase started:', data);
            const agent = this.agents.find(a => a.id === data.agentId);
            if (agent) {
                agent.status = data.status;
                agent.currentPhase = data.phase;
                this.updateAgentInList(agent);
                if (this.selectedAgent?.id === data.agentId) {
                    this.renderAgentDetail(agent);
                }
            }
        });

        // Plan generated - show Phase 1 work plan editor
        api.on('agent:planGenerated', (data) => {
            console.log('Agent plan generated:', data);
            const agent = this.agents.find(a => a.id === data.agentId);
            if (agent) {
                agent.plan = data.plan;
                agent.currentPhase = 1;
                this.updateAgentInList(agent);
                if (this.selectedAgent?.id === data.agentId) {
                    this.selectedAgent = agent;
                    this.renderAgentDetail(agent);
                    this.showPhase1WorkPlanEditor(data);
                }
            }
        });

        // Clarifying questions asked
        api.on('agent:clarifyingQuestions', (data) => {
            console.log('Agent clarifying questions:', data);
            // Questions will be shown in approval UI
        });

        // Waiting for approval - show approval UI
        api.on('agent:awaitingApproval', (data) => {
            console.log('Agent awaiting approval:', data);
            const agent = this.agents.find(a => a.id === data.agentId);
            if (agent) {
                agent.status = 'awaiting_approval';
                this.updateAgentInList(agent);
                if (this.selectedAgent?.id === data.agentId) {
                    this.renderAgentDetail(agent);
                    // Show approval UI with questions and plan
                    this.showApprovalUI(data);
                }
            }
        });

        // Agent approved - start execution
        api.on('agent:approved', (data) => {
            console.log('Agent approved:', data);
            const agent = this.agents.find(a => a.id === data.agentId);
            if (agent) {
                agent.status = 'running';
                this.updateAgentInList(agent);
                if (this.selectedAgent?.id === data.agentId) {
                    this.renderAgentDetail(agent);
                }
            }
        });
        
        // Agent progress update
        api.on('agent:progress', (data) => {
            console.log('Agent progress:', data);
            this.updateAgentInList(data.agentId);
        });
        
        // Agent step started
        api.on('agent:stepStarted', (data) => {
            console.log('Agent step started:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.refreshAgentDetail(data.agentId);
            }
        });
        
        // Agent step completed
        api.on('agent:stepCompleted', (data) => {
            console.log('Agent step completed:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.refreshAgentDetail(data.agentId);
            }
        });

        // Background execution events - Update Firebase with progress
        api.on('execution:started', async (data) => {
            console.log('📊 Execution started:', data);
            try {
                await agentDB.update(data.agentId, {
                    status: data.status,
                    progress: data.progress,
                    currentStep: data.currentStep,
                    totalSteps: data.totalSteps
                });
            } catch (error) {
                console.error('Failed to update agent on execution start:', error);
            }
        });

        api.on('execution:stepCompleted', async (data) => {
            console.log('📊 Step completed:', data);
            try {
                await agentDB.update(data.agentId, {
                    status: data.status,
                    progress: data.progress,
                    currentStep: data.currentStep
                });
            } catch (error) {
                console.error('Failed to update agent on step completion:', error);
            }
        });

        api.on('execution:stepFailed', async (data) => {
            console.log('⚠️ Step failed:', data);
            try {
                await agentDB.update(data.agentId, {
                    progress: data.progress,
                    currentStep: data.currentStep
                });
            } catch (error) {
                console.error('Failed to update agent on step failure:', error);
            }
        });

        api.on('execution:completed', async (data) => {
            console.log('✅ Execution completed:', data);
            try {
                await agentDB.update(data.agentId, {
                    status: data.status,
                    progress: data.progress,
                    currentStep: 4,  // Navigate to Step 4 (Synthesize) on completion
                    executionResults: data.results || [],
                    completedAt: data.completedAt
                });
            } catch (error) {
                console.error('Failed to update agent on execution completion:', error);
            }
        });

        api.on('execution:error', async (data) => {
            console.log('❌ Execution error:', data);
            try {
                await agentDB.update(data.agentId, {
                    status: data.status,
                    error: data.error
                });
            } catch (error) {
                console.error('Failed to update agent on execution error:', error);
            }
        });
        
        // Agent completed
        api.on('agent:completed', async (data) => {
            console.log('Agent completed:', data);
            this.updateAgentInList(data.agentId);
            await this.loadOrchestratorStatus(); // Orchestrator may have updated
            this.updateUI();
        });
        
        // Agent error
        api.on('agent:error', (data) => {
            console.error('Agent error:', data);
            this.updateAgentInList(data.agentId);
        });

        // Agent deleted
        api.on('agentDeleted', (data) => {
            console.log('Agent deleted:', data);
            // Remove from local array
            this.agents = this.agents.filter(a => a.id !== data.agentId);
            // If viewing deleted agent, go back to dashboard
            if (this.selectedAgent?.id === data.agentId) {
                this.selectedAgent = null;
                this.showView('dashboard');
            }
            this.updateUI();
        });

        // Agent chat response
        api.on('agent:chatResponse', (data) => {
            console.log('Agent chat response:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.refreshAgentDetail(data.agentId);
            }
        });
        
        // Agent clarifying questions
        api.on('agent:clarifyingQuestions', (data) => {
            console.log('Agent clarifying questions:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.showClarifyingQuestions(data);
            }
        });
        
        // Agent awaiting clarification
        api.on('agent:awaitingClarification', (data) => {
            console.log('Agent awaiting clarification:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.showClarificationInput(data);
            }
        });
        
        // Agent plan enhanced
        api.on('agent:planEnhanced', (data) => {
            console.log('Agent plan enhanced:', data);
            if (this.selectedAgent?.id === data.agentId) {
                this.refreshAgentDetail(data.agentId);
            }
        });
        
        // Orchestrator update
        api.on('orchestrator:update', async (data) => {
            console.log('Orchestrator update:', data);
            await this.loadOrchestratorStatus();
            this.updateUI();
        });

        api.on('insight:reported', (data) => {
            console.log('Insight reported:', data);
            this.renderInsights();
        });

        api.on('hypothesis:updated', (data) => {
            console.log('Hypothesis updated:', data);
            if (data?.hypothesis) {
                const updated = data.hypothesis;
                const exists = this.hypotheses.find(h => h.id === updated.id);
                if (exists) {
                    this.hypotheses = this.hypotheses.map(h => h.id === updated.id ? updated : h);
                } else {
                    this.hypotheses = [updated, ...this.hypotheses];
                }
                this.hypotheses = this.hypotheses.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                this.renderHypotheses();
                this.fetchExecutiveSummary(true);
            }
        });
        
        // Document processed
        api.on('document:processed', (data) => {
            console.log('Document processed:', data);
            // Could reload document list here
        });
    },
    
    // ========================================================================
    // Load Data from Firebase
    // ========================================================================
    
    async loadAgents() {
        if (!db) {
            console.error('Firebase not initialized');
            return;
        }
        
        try {
            const agents = await agentDB.getAll();
            this.agents = agents || [];
            console.log(`✅ Loaded ${this.agents.length} agents from Firebase`);
            this.updateUI();
        } catch (error) {
            console.error('❌ Error loading agents:', error);
            this.agents = [];
            this.updateUI();
        }
    },
    
    async loadOrchestratorStatus() {
        try {
            const response = await api.getOrchestratorStatus();
            this.orchestratorStatus = response.status;
            return this.orchestratorStatus;
        } catch (error) {
            console.error('Error loading orchestrator status:', error);
            this.orchestratorStatus = null;
            return null;
        }
    },

    async loadOrchestratorState() {
        try {
            const response = await api.getOrchestratorState();
            this.hypotheses = Array.isArray(response.hypotheses)
                ? response.hypotheses.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                : [];
            this.hypothesisStatusMessage = '';
            this.renderHypotheses();
        } catch (error) {
            console.error('Error loading orchestrator state:', error);
            this.hypotheses = [];
            this.hypothesisStatusMessage = '';
            this.renderHypotheses();
        }
    },
    
    async updateAgentInList(agentId) {
        try {
            const response = await api.getAgent(agentId);
            const index = this.agents.findIndex(a => a.id === agentId);
            
            if (index >= 0) {
                this.agents[index] = response.agent;
            } else {
                this.agents.push(response.agent);
            }
            
            this.updateUI();
        } catch (error) {
            console.error('Error updating agent:', error);
        }
    },
    
    async refreshAgentDetail(agentId) {
        try {
            const response = await api.getAgent(agentId);
            this.selectedAgent = response.agent;
            this.renderAgentDetail(this.selectedAgent);
        } catch (error) {
            console.error('Error refreshing agent detail:', error);
        }
    },

    updateReportedInsights(rawInsights = []) {
        const normalized = (rawInsights || []).map(insight => {
            const result = {
                ...insight,
                text: insight.text || insight.summary || '',
                agentName: insight.agentName || insight.agent || 'Unknown Agent',
                agentId: insight.agentId || insight.agent_id || '',
                status: (insight.status || 'reported').toLowerCase(),
                timestamp: insight.timestamp || insight.reportedAt || insight.createdAt
            };

            // Debug logging to check agentId
            if (!result.agentId) {
                console.warn('⚠️ Insight missing agentId:', insight);
            }

            return result;
        }).filter(insight => insight.text);

        normalized.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        const signature = normalized.map(insight => insight.id || insight.text).join('|');
        this.reportedInsights = normalized;

        // Debug log to verify agentId preservation
        console.log('📊 Updated reported insights. Sample:', {
            total: normalized.length,
            sampleInsight: normalized[0],
            agentIds: [...new Set(normalized.map(i => i.agentId).filter(Boolean))]
        });

        this.renderDashboardInsightsPreview();
        if (this.currentView === 'dashboard') {
            this.renderDashboard();
        }

        if (signature !== this.insightsSignature) {
            this.insightsSignature = signature;
            if (this.hypotheses.length > 0) {
                this.renderHypotheses();
            }
            this.fetchExecutiveSummary();
        }
    },

    renderDashboardInsightsPreview() {
        // Update insight count
        const countEl = document.getElementById('orchestratorInsightCount');
        if (countEl) {
            const insights = this.reportedInsights || [];
            countEl.textContent = insights.length;
        }

        // Render Executive Summary
        this.renderExecutiveSummary();

        // Render Key Insights
        this.renderKeyInsights();

        // Render Hypotheses
        this.renderHypothesesSection();
    },

    renderExecutiveSummary() {
        const summaryEl = document.getElementById('executiveSummary');
        if (!summaryEl) return;

        // Use the executiveSummary array (same as detail view)
        if (this.executiveSummary && this.executiveSummary.length > 0) {
            summaryEl.innerHTML = `
                <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
                    ${this.executiveSummary.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
                </ul>
            `;
        } else if (this.reportedInsights && this.reportedInsights.length > 0) {
            summaryEl.innerHTML = `<p style="margin: 0; line-height: 1.6;">Analysis in progress. ${this.reportedInsights.length} insights reported from agents.</p>`;
        } else {
            summaryEl.innerHTML = '<p class="empty-state">No summary available yet.</p>';
        }
    },

    renderKeyInsights() {
        const insightsEl = document.getElementById('keyInsightsList');
        if (!insightsEl) return;

        const insights = this.reportedInsights || [];

        if (insights.length === 0) {
            insightsEl.innerHTML = '<p class="empty-state">No insights reported yet.</p>';
            return;
        }

        const insightItems = insights.map(insight => {
            const agent = this.escapeHtml(insight.agentName);
            const text = this.escapeHtml(insight.text);
            const agentId = insight.agentId || '';
            return `
                <div class="insight-card" onclick="app.openAgentDetail('${agentId}')">
                    <div class="insight-card-header">
                        <span class="insight-agent-name">${agent}</span>
                    </div>
                    <div class="insight-card-content">${text}</div>
                </div>
            `;
        }).join('');

        insightsEl.innerHTML = insightItems;
    },

    renderHypothesesSection() {
        const hypothesesEl = document.getElementById('hypothesisList');
        if (!hypothesesEl) return;

        if (!this.hypotheses || this.hypotheses.length === 0) {
            hypothesesEl.innerHTML = '<p class="empty-state">No hypotheses yet.</p>';
            return;
        }

        const hypothesisItems = this.hypotheses.map(hypothesis => {
            const text = this.escapeHtml(hypothesis.text || hypothesis);
            const status = hypothesis.status || 'pending';
            const id = hypothesis.id || '';
            // Normalize status to lowercase with dashes for CSS class
            const statusClass = status.toLowerCase().replace(/\s+/g, '-');
            // Keep original for display
            const statusDisplay = status.toUpperCase();
            return `
                <div class="hypothesis-card" data-hypothesis-id="${id}">
                    <div class="hypothesis-card-header">
                        <span class="hypothesis-status ${statusClass}">${statusDisplay}</span>
                    </div>
                    <div class="hypothesis-card-content">${text}</div>
                </div>
            `;
        }).join('');

        hypothesesEl.innerHTML = hypothesisItems;
    },

    truncateText(text, limit = 140) {
        if (!text) return '';
        if (text.length <= limit) return text;
        return `${text.slice(0, limit - 1).trim()}…`;
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // Project Context Management
    async loadProjectContext() {
        try {
            // Load from Firebase
            const savedContext = await projectContextDB.get();
            if (savedContext) {
                this.projectContext = savedContext;
            }

            // Update form fields
            const keyQuestionField = document.getElementById('keyQuestion');
            const constraintsField = document.getElementById('constraints');
            const otherContextField = document.getElementById('otherContext');

            if (keyQuestionField) keyQuestionField.value = this.projectContext.keyQuestion || '';
            if (constraintsField) constraintsField.value = this.projectContext.constraints || '';
            if (otherContextField) otherContextField.value = this.projectContext.otherContext || '';

            console.log('✅ Project context loaded from Firebase');
        } catch (error) {
            console.error('Error loading project context:', error);
            // Fallback to localStorage if Firebase fails
            try {
                const localContext = localStorage.getItem('projectContext');
                if (localContext) {
                    this.projectContext = JSON.parse(localContext);
                    const keyQuestionField = document.getElementById('keyQuestion');
                    const constraintsField = document.getElementById('constraints');
                    const otherContextField = document.getElementById('otherContext');
                    if (keyQuestionField) keyQuestionField.value = this.projectContext.keyQuestion || '';
                    if (constraintsField) constraintsField.value = this.projectContext.constraints || '';
                    if (otherContextField) otherContextField.value = this.projectContext.otherContext || '';
                    console.log('✅ Project context loaded from localStorage (fallback)');
                }
            } catch (localError) {
                console.error('Error loading from localStorage:', localError);
            }
        }
    },

    async saveProjectContext() {
        try {
            // Get values from form fields
            const keyQuestion = document.getElementById('keyQuestion')?.value || '';
            const constraints = document.getElementById('constraints')?.value || '';
            const otherContext = document.getElementById('otherContext')?.value || '';

            // Update app state
            this.projectContext = {
                keyQuestion,
                constraints,
                otherContext
            };

            const statusElement = document.getElementById('contextStatus');
            if (statusElement) {
                statusElement.textContent = 'Saving...';
                statusElement.style.color = 'var(--text-secondary)';
            }

            // Save to Firebase
            await projectContextDB.save(this.projectContext);

            // Also save to localStorage as backup
            localStorage.setItem('projectContext', JSON.stringify(this.projectContext));

            // Show success message
            if (statusElement) {
                statusElement.textContent = '✓ Saved to database';
                statusElement.style.color = 'var(--success-color)';
                setTimeout(() => {
                    statusElement.textContent = '';
                    // Hide the save button after successful save
                    const saveBtn = document.getElementById('saveContextBtn');
                    if (saveBtn) {
                        saveBtn.classList.remove('visible');
                    }
                }, 2000);
            }

            console.log('✅ Project context saved to Firebase:', this.projectContext);
        } catch (error) {
            console.error('Error saving project context:', error);

            const statusElement = document.getElementById('contextStatus');
            if (statusElement) {
                statusElement.textContent = '✗ Failed to save';
                statusElement.style.color = 'var(--error-color)';
                setTimeout(() => {
                    statusElement.textContent = '';
                }, 3000);
            }

            alert('Failed to save project context to database. Please try again.');
        }
    },

    getProjectContextString() {
        // Returns a formatted string for injection into system prompts
        if (!this.projectContext.keyQuestion && !this.projectContext.constraints && !this.projectContext.otherContext) {
            return '';
        }

        let contextString = '\n\n## Project Context\n';

        if (this.projectContext.keyQuestion) {
            contextString += `\n**Key Question:** ${this.projectContext.keyQuestion}`;
        }
        if (this.projectContext.constraints) {
            contextString += `\n\n**Constraints:** ${this.projectContext.constraints}`;
        }
        if (this.projectContext.otherContext) {
            contextString += `\n\n**Other Context:** ${this.projectContext.otherContext}`;
        }

        return contextString;
    },

    renderInsightsList() {
        const insightsGrid = document.getElementById('insightsGrid');
        const insightsCount = document.getElementById('insightsCount');

        if (!insightsGrid || !insightsCount) return;

        const insights = this.reportedInsights || [];
        insightsCount.textContent = insights.length;

        if (insights.length === 0) {
            insightsGrid.innerHTML = `
                <div class="insights-empty">
                    No insights reported yet. Agents will report key findings here as they work.
                </div>
            `;
            return;
        }

        insightsGrid.innerHTML = insights.map((insight, index) => {
            const agentName = this.escapeHtml(insight.agentName);
            const stepTitle = insight.stepTitle ? this.escapeHtml(insight.stepTitle) : '';
            const insightText = this.escapeHtml(insight.text);
            const agentId = insight.agentId || '';
            const insightId = insight.id || insight._id || '';
            return `
                <div class="insight-card" onclick="app.openAgentDetail('${agentId}')" style="cursor: pointer;">
                    <div class="insight-header">
                        <div class="insight-header-left">
                            <span class="insight-agent">${agentName}</span>
                            ${stepTitle ? `<span class="insight-step">${stepTitle}</span>` : ''}
                        </div>
                        <div class="insight-header-right">
                            <span class="insight-timestamp">${this.formatTimestamp(insight.timestamp || insight.reportedAt)}</span>
                            <button class="btn-delete-insight" onclick="event.stopPropagation(); app.deleteInsight('${insightId}', ${index})" title="Remove insight">×</button>
                        </div>
                    </div>
                    <div class="insight-text">${insightText}</div>
                </div>
            `;
        }).join('');
    },

    renderHypotheses() {
        const input = document.getElementById('newHypothesisInput');
        const status = document.getElementById('hypothesisSaveStatus');
        const list = document.getElementById('hypothesisListDetail');

        if (input && document.activeElement !== input) {
            input.value = this.newHypothesisText || '';
        }

        if (status) {
            status.textContent = this.hypothesisStatusMessage || '';
        }

        if (!list) return;

        if (!this.hypotheses || this.hypotheses.length === 0) {
            list.innerHTML = `
                <div class="hypothesis-empty">
                    No hypotheses yet. Capture a working hypothesis above to test against the reported insights.
                </div>
            `;
            return;
        }

        list.innerHTML = this.hypotheses.map(hypothesis => {
            const statusClass = `status-${(hypothesis.status || 'inconclusive').toLowerCase().replace(/\s+/g, '-')}`;
            const statusLabel = (hypothesis.status || 'inconclusive').replace(/[-_]/g, ' ').toUpperCase();
            const evidenceList = Array.isArray(hypothesis.evidence) && hypothesis.evidence.length > 0
                ? `<ul class="hypothesis-evidence">${hypothesis.evidence.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`
                : '';
            const reasoningText = hypothesis.reasoning ? this.escapeHtml(hypothesis.reasoning).replace(/\n/g, '<br>') : '';
            const reasoning = reasoningText ? `<div class="hypothesis-reasoning">${reasoningText}</div>` : '';
            const createdAt = hypothesis.createdAt ? new Date(hypothesis.createdAt).toLocaleString() : '';
            const evaluatedAt = hypothesis.lastEvaluatedAt ? `Last evaluated ${new Date(hypothesis.lastEvaluatedAt).toLocaleString()}` : 'Awaiting evaluation';
            const confidence = typeof hypothesis.confidence === 'number' ? `Confidence ${(hypothesis.confidence * 100).toFixed(0)}%` : '';
            const hypothesisText = this.escapeHtml(hypothesis.text);

            return `
                <div class="hypothesis-item ${statusClass}">
                    <div class="hypothesis-item-header">
                        <div class="hypothesis-meta-block">
                            <div class="hypothesis-text">${hypothesisText}</div>
                            <div class="hypothesis-meta">${confidence}</div>
                        </div>
                        <div class="hypothesis-actions">
                            <span class="status-badge ${statusClass}">${statusLabel}</span>
                            <button class="btn-secondary" onclick="app.reEvaluateHypothesis('${hypothesis.id}')">Re-evaluate</button>
                            <button class="hypothesis-delete-btn" data-hypothesis-id="${hypothesis.id}" title="Delete hypothesis">×</button>
                        </div>
                    </div>
                    ${reasoning}
                    ${evidenceList}
                </div>
            `;
        }).join('');
    },

    handleHypothesisInput(value) {
        this.newHypothesisText = value;
        this.hypothesisStatusMessage = value ? '' : '';
        const status = document.getElementById('hypothesisSaveStatus');
        if (status) {
            status.textContent = this.hypothesisStatusMessage;
        }
        this.renderHypotheses();
    },

    async addHypothesis() {
        if (this.hypothesisSaving) return;

        const text = (this.newHypothesisText || '').trim();
        if (!text) {
            this.hypothesisStatusMessage = 'Enter a hypothesis first.';
            this.renderHypotheses();
            return;
        }

        this.hypothesisSaving = true;
        this.hypothesisStatusMessage = 'Adding...';
        this.renderHypotheses();

        const button = document.getElementById('addHypothesisBtn');
        if (button) button.disabled = true;

        try {
            const response = await api.createHypothesis(text);
            if (response?.hypothesis) {
                this.hypotheses = [response.hypothesis, ...this.hypotheses.filter(h => h.id !== response.hypothesis.id)];
                this.newHypothesisText = '';
                this.hypothesisStatusMessage = 'Hypothesis evaluated.';
                await this.fetchExecutiveSummary(true);
            } else {
                this.hypothesisStatusMessage = 'Failed to add hypothesis';
            }
        } catch (error) {
            console.error('Error adding hypothesis:', error);
            this.hypothesisStatusMessage = 'Unable to add hypothesis';
        } finally {
            this.hypothesisSaving = false;
            if (button) button.disabled = false;
            this.renderHypotheses();
        }
    },

    async deleteHypothesis(id) {
        if (!id) return;
        if (!confirm('Delete this hypothesis?')) return;

        try {
            const response = await api.deleteHypothesis(id);
            if (response?.success) {
                this.hypotheses = this.hypotheses.filter(h => h.id !== id);
                this.renderHypotheses();
                await this.fetchExecutiveSummary(true);
            } else {
                console.error('Failed to delete hypothesis');
            }
        } catch (error) {
            console.error('Error deleting hypothesis:', error);
            alert('Unable to delete hypothesis');
        }
    },

    async reEvaluateHypothesis(id) {
        if (!id) return;
        const button = document.querySelector(`button[onclick="app.reEvaluateHypothesis('${id}')"]`);
        try {
            if (button) {
                button.disabled = true;
                button.textContent = 'Evaluating...';
            }

            const response = await api.evaluateHypothesis(id);
            if (response?.hypothesis) {
                this.hypotheses = this.hypotheses.map(h => h.id === id ? response.hypothesis : h);
                await this.fetchExecutiveSummary(true);
                this.renderHypotheses();
            }

            if (button) {
                button.disabled = false;
                button.textContent = 'Re-evaluate';
            }
        } catch (error) {
            console.error('Error re-evaluating hypothesis:', error);
            if (button) {
                button.disabled = false;
                button.textContent = 'Re-evaluate';
            }
            alert('Failed to re-evaluate hypothesis.');
        }
    },

    renderExecutiveSummaryDetail() {
        const container = document.getElementById('executiveSummaryDetail');
        if (!container) return;

        // If in edit mode, show textarea
        if (this.editingExecutiveSummary) {
            const summaryText = this.executiveSummary
                .map(item => item.startsWith('-') ? item.substring(1).trim() : item)
                .join('\n');

            container.innerHTML = `
                <textarea
                    id="executiveSummaryEditor"
                    class="executive-summary-editor"
                    rows="10"
                    placeholder="Enter each bullet point on a new line..."
                >${this.escapeHtml(summaryText)}</textarea>
            `;

            // Update buttons
            const editBtn = document.getElementById('editSummaryBtn');
            const regenerateBtn = document.getElementById('regenerateSummaryBtn');
            if (editBtn) editBtn.style.display = 'none';
            if (regenerateBtn) {
                regenerateBtn.textContent = 'Cancel';
                regenerateBtn.className = 'btn-secondary';
            }

            // Add save button if it doesn't exist
            let saveBtn = document.getElementById('saveSummaryBtn');
            if (!saveBtn) {
                saveBtn = document.createElement('button');
                saveBtn.id = 'saveSummaryBtn';
                saveBtn.className = 'btn-primary';
                saveBtn.textContent = 'Save';
                saveBtn.addEventListener('click', () => this.saveExecutiveSummary());
                regenerateBtn.parentNode.insertBefore(saveBtn, regenerateBtn);
            }

            return;
        }

        // Normal view mode
        if (!this.executiveSummary || this.executiveSummary.length === 0) {
            container.innerHTML = `
                <div class="executive-summary-empty">
                    Add key insights to generate a dot-dash executive summary.
                </div>
            `;
        } else {
            container.innerHTML = `
                <ul class="executive-summary-list">
                    ${this.executiveSummary.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
                </ul>
            `;
        }

        // Update buttons to normal state
        const editBtn = document.getElementById('editSummaryBtn');
        const regenerateBtn = document.getElementById('regenerateSummaryBtn');
        const saveBtn = document.getElementById('saveSummaryBtn');

        if (editBtn) editBtn.style.display = 'inline-flex';
        if (regenerateBtn) {
            regenerateBtn.textContent = 'Regenerate Summary';
            regenerateBtn.className = 'btn-primary';
        }
        if (saveBtn) saveBtn.remove();
    },

    enterEditMode() {
        if (!this.executiveSummary || this.executiveSummary.length === 0) {
            alert('Please generate a summary first before editing.');
            return;
        }
        this.editingExecutiveSummary = true;
        this.renderExecutiveSummaryDetail();
    },

    cancelEditMode() {
        this.editingExecutiveSummary = false;
        this.renderExecutiveSummaryDetail();
    },

    async saveExecutiveSummary() {
        const editor = document.getElementById('executiveSummaryEditor');
        if (!editor) return;

        const text = editor.value;
        const bullets = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.startsWith('-') ? line : `- ${line}`);

        if (bullets.length === 0) {
            alert('Please enter at least one bullet point.');
            return;
        }

        try {
            // Save to backend
            await api.saveExecutiveSummary(bullets);

            // Update local state
            this.executiveSummary = bullets;
            this.editingExecutiveSummary = false;

            // Re-render both detail and dashboard views
            this.renderExecutiveSummaryDetail();
            this.renderExecutiveSummary();

            console.log('✓ Executive summary saved');
        } catch (error) {
            console.error('Error saving executive summary:', error);
            alert('Failed to save executive summary: ' + error.message);
        }
    },

    parseSummaryText(text) {
        if (!text) return [];
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.startsWith('-') ? line : `- ${line}`);
    },

    async fetchExecutiveSummary(force = false) {
        const insights = this.reportedInsights || [];
        const signature = insights.map(insight => insight.id || insight.text).join('|');

        if (!force && signature === this.summarySignature) {
            return;
        }

        if (insights.length === 0) {
            this.summarySignature = signature;
            this.executiveSummary = [];
            this.renderExecutiveSummaryDetail();
            // Also update dashboard version
            if (this.currentView === 'dashboard') {
                this.renderExecutiveSummary();
            }
            return;
        }

        this.summarySignature = signature;
        const container = document.getElementById('executiveSummaryDetail');
        if (container) {
            container.innerHTML = '<div class="executive-summary-loading">Generating summary...</div>';
        }

        try {
            const payload = insights.slice(0, 12).map(insight => ({
                text: insight.text,
                agentName: insight.agentName,
                timestamp: insight.timestamp
            }));

            const response = await api.generateExecutiveSummary(payload);
            let bullets = response.summary?.bullets || response.summary || [];

            if (typeof bullets === 'string') {
                bullets = this.parseSummaryText(bullets);
            }

            if (!Array.isArray(bullets)) {
                bullets = [];
            }

            this.executiveSummary = bullets;
            this.renderExecutiveSummaryDetail();
            // Also update dashboard version
            if (this.currentView === 'dashboard') {
                this.renderExecutiveSummary();
            }
        } catch (error) {
            console.error('Error generating executive summary:', error);
            this.executiveSummary = [];
            if (container) {
                container.innerHTML = '<div class="executive-summary-error">Failed to generate summary. Try again.</div>';
            }
        }
    },
    
    // ========================================================================
    // Agent Actions
    // ========================================================================
    
    async createAgent() {
        console.log('Create agent button clicked');
        
        const name = document.getElementById('agentName').value;
        const type = document.getElementById('agentType').value;
        const focus = document.getElementById('agentFocus').value;
        const priorityElement = document.querySelector('input[name="priority"]:checked');
        const priority = priorityElement ? priorityElement.value : 'medium';
        const autoSync = document.getElementById('autoSync').checked;
        
        const tools = Array.from(document.querySelectorAll('.checkbox-group input:checked'))
            .map(input => input.value);
        
        if (!name || !focus) {
            alert('Please fill in agent name and focus area');
            return;
        }
        
        console.log('Creating agent:', { name, type, focus, priority });
        
        try {
            // Create agent via API
            const response = await api.createAgent({
                name,
                type,
                focus,
                tools,
                priority,
                autoSync
            });
            
            console.log('Agent created:', response);

            // Close modal
            this.closeModal();

            // Add agent to local state immediately (Firebase listener will sync later)
            if (response.agent) {
                this.agents.push(response.agent);
                this.updateUI();

                // Open the agent detail view (don't auto-start)
                await this.openAgentDetail(response.agent.id);

                // Show message to start the agent
                console.log('Agent created! Click "Start Agent" to begin.');
            }
            
        } catch (error) {
            console.error('Error creating agent:', error);
            alert('Failed to create agent: ' + error.message);
        }
    },
    
    async openAgentDetail(agentId) {
        // Redirect to the 4-step agent creation/detail page with the agent ID
        window.location.href = `agent-create.html?agentId=${agentId}`;
    },

    toggleAgentMenu(event, agentId) {
        const menuId = `menu-${agentId}`;
        const menu = document.getElementById(menuId);

        if (!menu) return;

        // Close all other menus
        document.querySelectorAll('.agent-menu-dropdown').forEach(m => {
            if (m.id !== menuId) {
                m.classList.remove('active');
            }
        });

        // Toggle current menu
        menu.classList.toggle('active');
    },

    async deleteAgent(agentId) {
        // Close the dropdown menu
        const menu = document.getElementById(`menu-${agentId}`);
        if (menu) {
            menu.classList.remove('active');
        }

        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;

        // Show custom confirmation modal
        const agentName = agent.name || agent.objective || 'this agent';
        const confirmed = await this.showDeleteConfirmation(agentName);

        if (!confirmed) {
            return;
        }

        try {
            // Call API to delete agent from backend
            await api.deleteAgent(agentId);

            // Delete from Firebase
            await teammateDB.delete(agentId);

            // Remove from local array
            this.agents = this.agents.filter(a => a.id !== agentId);

            // Update UI
            this.updateUI();

        } catch (error) {
            console.error('Error deleting agent:', error);
            alert('Failed to delete agent: ' + error.message);
        }
    },

    showDeleteConfirmation(agentName) {
        return new Promise((resolve) => {
            const modal = document.getElementById('deleteConfirmModal');
            const message = document.getElementById('deleteConfirmMessage');
            const confirmBtn = document.getElementById('deleteConfirmBtn');
            const cancelBtn = document.getElementById('deleteCancelBtn');

            // Set message
            message.textContent = `Are you sure you want to delete "${agentName}"?`;

            // Show modal
            modal.classList.add('active');

            // Handle confirm
            const handleConfirm = () => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleOverlayClick);
                resolve(true);
            };

            // Handle cancel
            const handleCancel = () => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleOverlayClick);
                resolve(false);
            };

            // Handle clicking outside modal
            const handleOverlayClick = (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            modal.addEventListener('click', handleOverlayClick);
        });
    },

    // Bulk selection and deletion methods
    toggleAgentSelection(agentId) {
        if (this.selectedAgents.has(agentId)) {
            this.selectedAgents.delete(agentId);
        } else {
            this.selectedAgents.add(agentId);
        }
        console.log('Selected agents:', this.selectedAgents.size);
        this.updateBulkActionsToolbar();
        this.updateUI();
    },

    selectAllAgents() {
        this.agents.forEach(agent => {
            this.selectedAgents.add(agent.id);
        });
        this.updateBulkActionsToolbar();
        this.updateUI();
    },

    deselectAllAgents() {
        this.selectedAgents.clear();
        this.updateBulkActionsToolbar();
        this.updateUI();
    },

    updateBulkActionsToolbar() {
        const toolbar = document.getElementById('bulkActionsToolbar');
        const selectedCount = document.getElementById('selectedAgentCount');
        const countSpan = document.getElementById('bulkActionsCount');
        const selectAllBtn = document.getElementById('selectAllBtn');
        const deselectAllBtn = document.getElementById('deselectAllBtn');
        const actionsRight = document.getElementById('bulkActionsRight');

        if (!toolbar || !selectedCount) {
            console.error('Bulk actions toolbar elements not found');
            return;
        }

        // Always show toolbar if there are agents
        if (this.agents.length > 0) {
            toolbar.style.display = 'flex';
            selectedCount.textContent = this.selectedAgents.size;

            // Show/hide elements based on selection state
            if (this.selectedAgents.size === 0) {
                // No selection: only show "Select All"
                countSpan.style.display = 'none';
                selectAllBtn.style.display = 'inline-flex';
                deselectAllBtn.style.display = 'none';
                actionsRight.style.display = 'none';
            } else {
                // Has selection: show count, deselect, and delete button
                countSpan.style.display = 'inline';
                selectAllBtn.style.display = 'none';
                deselectAllBtn.style.display = 'inline-flex';
                actionsRight.style.display = 'flex';
            }

            console.log('Toolbar updated - Selected:', this.selectedAgents.size);
        } else {
            toolbar.style.display = 'none';
        }
    },

    async bulkDeleteAgents() {
        if (this.selectedAgents.size === 0) return;

        const count = this.selectedAgents.size;
        const confirmed = await this.showDeleteConfirmation(`${count} agent${count !== 1 ? 's' : ''}`);

        if (!confirmed) return;

        try {
            const agentIds = Array.from(this.selectedAgents);

            // Call bulk delete API
            const response = await api.bulkDeleteAgents(agentIds);

            // Delete from Firebase
            await Promise.all(agentIds.map(id => teammateDB.delete(id)));

            // Remove deleted agents from local state
            this.agents = this.agents.filter(agent => !this.selectedAgents.has(agent.id));

            // Clear selection
            this.selectedAgents.clear();
            this.updateBulkActionsToolbar();

            // Update UI
            this.updateUI();

            console.log(`✓ Deleted ${count} agent${count !== 1 ? 's' : ''}`);
        } catch (error) {
            console.error('Error deleting agents:', error);
            alert('Failed to delete agents: ' + error.message);
        }
    },

    async startAgentFromDetail(agentId) {
        try {
            console.log('Starting agent:', agentId);
            await api.startAgent(agentId);
            // UI will update via WebSocket events
        } catch (error) {
            console.error('Error starting agent:', error);
            alert('Failed to start agent: ' + error.message);
        }
    },
    
    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message || !this.selectedAgent) return;
        
        console.log('Sending message to agent:', message);
        input.value = '';
        
        // Add user message to UI immediately
        this.addChatMessage('user', message);
        
        try {
            const response = await api.chatWithAgent(this.selectedAgent.id, message);
            console.log('Chat response:', response);
            
            // Add agent response
            this.addChatMessage('agent', response.response);
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.addChatMessage('system', 'Error: ' + error.message);
        }
    },
    
    addChatMessage(sender, content) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        messageDiv.innerHTML = `
            <div class="message-sender">${sender.toUpperCase()}</div>
            <div class="message-content">${content}</div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    
    // ========================================================================
    // UI Rendering
    // ========================================================================
    
    updateUI() {
        if (this.currentView === 'dashboard') {
            this.renderDashboard();
        } else if (this.currentView === 'orchestratorView') {
            this.renderOrchestratorView();
        }
    },
    
    renderDashboard() {
        // Update orchestrator card with agent status counts
        const statusCounts = {
            completed: 0,
            executing: 0,
            draft: 0
        };

        this.agents.forEach(agent => {
            const status = agent.status || 'draft';
            if (status === 'completed') {
                statusCounts.completed++;
            } else if (status === 'running' || status === 'executing') {
                statusCounts.executing++;
            } else if (status === 'draft') {
                statusCounts.draft++;
            }
        });

        document.getElementById('completedCount').textContent = statusCounts.completed;
        document.getElementById('executingCount').textContent = statusCounts.executing;
        document.getElementById('draftCount').textContent = statusCounts.draft;

        this.renderDashboardInsightsPreview();

        // Update agent count
        document.getElementById('activeAgentCount').textContent = this.agents.length;

        // Update bulk actions toolbar
        this.updateBulkActionsToolbar();

        // Sort agents by number of insights (most to least)
        const sortedAgents = [...this.agents].sort((a, b) => {
            const aReportedInsights = (this.reportedInsights || []).filter(insight => insight.agentId === a.id).length;
            const aOwnInsights = Array.isArray(a.keyInsights || a.insights) ? (a.keyInsights || a.insights).length : 0;
            const aInsights = Math.max(aReportedInsights, aOwnInsights);

            const bReportedInsights = (this.reportedInsights || []).filter(insight => insight.agentId === b.id).length;
            const bOwnInsights = Array.isArray(b.keyInsights || b.insights) ? (b.keyInsights || b.insights).length : 0;
            const bInsights = Math.max(bReportedInsights, bOwnInsights);

            return bInsights - aInsights; // Descending order
        });

        // Render agent cards
        const agentsGrid = document.getElementById('agentsGrid');
        agentsGrid.innerHTML = sortedAgents.map(agent => this.renderAgentCard(agent)).join('');
    },
    
    renderAgentCard(agent) {
        const status = agent.status || 'draft';
        const statusClass = status === 'error' ? 'blocked' :
                          status === 'completed' ? 'on-track' :
                          status === 'running' ? 'on-track' : 'waiting';

        const statusText = status === 'error' ? 'Error' :
                         status === 'completed' ? 'Completed' :
                         status === 'running' ? 'Running' :
                         status === 'draft' ? 'Draft' : 'Queued';

        const agentName = agent.name || agent.objective || 'Unnamed Agent';
        const description = agent.description || agent.focus || 'No description';

        // Count insights from both reportedInsights array and agent's own insights
        const agentInsights = (this.reportedInsights || []).filter(insight => insight.agentId === agent.id);
        const agentOwnInsights = agent.keyInsights || agent.insights || [];
        const insightCount = Math.max(agentInsights.length, Array.isArray(agentOwnInsights) ? agentOwnInsights.length : 0);

        // Debug logging for insight count
        if (insightCount > 0) {
            console.log(`📊 Agent "${agentName}" (${agent.id}):`, {
                insightCount,
                totalInsights: this.reportedInsights.length,
                agentInsights: agentInsights.map(i => ({ text: i.text?.substring(0, 50), agentId: i.agentId }))
            });
        }

        const safeAgentName = this.escapeHtml(agentName);
        const descriptionSnippet = description.substring(0, 120) + (description.length > 120 ? '...' : '');
        const safeDescription = this.escapeHtml(descriptionSnippet);
        const isSelected = this.selectedAgents.has(agent.id);

        return `
            <div class="agent-card ${isSelected ? 'selected' : ''}" onclick="app.openAgentDetail('${agent.id}')">
                <div class="agent-card-header">
                    <input type="checkbox" class="agent-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); app.toggleAgentSelection('${agent.id}')">
                    <div class="agent-card-body">
                        <div class="agent-name">${safeAgentName}</div>
                        <div class="agent-description">${safeDescription}</div>
                    </div>
                    <div class="agent-menu">
                        <button class="agent-menu-btn" onclick="event.stopPropagation(); app.toggleAgentMenu(event, '${agent.id}')" title="More options">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>
                            </svg>
                        </button>
                        <div class="agent-menu-dropdown" id="menu-${agent.id}">
                            <div class="agent-menu-item" onclick="event.stopPropagation(); app.openAgentDetail('${agent.id}')">
                                View Details
                            </div>
                            <div class="agent-menu-item danger" onclick="event.stopPropagation(); app.deleteAgent('${agent.id}')">
                                Delete Agent
                            </div>
                        </div>
                    </div>
                </div>
                ${status === 'queued' || status === 'executing' || status === 'running' ? `
                    <div class="agent-progress">
                        <div class="progress-info">
                            <span class="progress-percentage">${agent.progress || 0}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${agent.progress || 0}%"></div>
                        </div>
                    </div>
                ` : ''}
                <div class="agent-card-footer">
                    <div class="agent-meta">
                        <span class="agent-status ${statusClass}">${statusText}</span>
                        <span class="agent-insights">${insightCount} insight${insightCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    getAgentIcon(type) {
        return '';
    },

    getPhaseText(status) {
        const phases = {
            'queued': 'Queued',
            'planning': 'PHASE 1: Planning',
            'awaiting_approval': 'PHASE 2: Awaiting Approval',
            'running': 'PHASE 3: Executing',
            'completed': 'PHASE 4: Complete',
            'error': 'Error',
            'paused': 'Paused'
        };
        return phases[status] || status;
    },
    
    renderAgentDetail(agent) {
        // Update header
        const agentName = agent.name || agent.objective || 'Unnamed Agent';
        const status = agent.status || 'draft';
        
        document.getElementById('detailAgentIcon').textContent = agent.type?.charAt(0).toUpperCase() || 'A';
        document.getElementById('detailAgentName').textContent = agentName.toUpperCase();
        
        // Show current status
        const phaseText = this.getPhaseText(status);
        document.getElementById('detailProgressText').textContent = phaseText;
        
        const statusBadge = document.getElementById('detailStatus');
        statusBadge.textContent = status.toUpperCase().replace('_', ' ');
        statusBadge.className = 'status-badge status-' + status;
        
        // Render agent info in plan panel
        const planSteps = document.getElementById('planSteps');
        planSteps.innerHTML = `
            <div class="agent-detail-info">
                <h4>Agent Details</h4>
                <div class="detail-section">
                    <strong>Objective:</strong>
                    <p>${agent.objective || 'Not specified'}</p>
                </div>
                <div class="detail-section">
                    <strong>Description:</strong>
                    <p>${agent.description || 'No description provided'}</p>
                </div>
                <div class="detail-section">
                    <strong>Tools:</strong>
                    <div class="tools-list">
                        ${(agent.tools || []).map(tool => `<span class="tool-badge">${tool}</span>`).join('')}
                    </div>
                </div>
                <div class="detail-section">
                    <strong>Status:</strong>
                    <p>${status}</p>
                </div>
                <div class="detail-section">
                    <strong>Created:</strong>
                    <p>${agent.createdAt ? new Date(agent.createdAt.seconds * 1000).toLocaleString() : 'Unknown'}</p>
                </div>
            </div>
        `;
        
        // Render deliverable placeholder
        const deliverableTitle = document.getElementById('deliverableTitle');
        const deliverablePreview = document.getElementById('deliverablePreview');
        
        if (deliverableTitle) {
            deliverableTitle.textContent = 'Agent Report';
        }
        if (deliverablePreview) {
            deliverablePreview.innerHTML = agent.deliverable?.content || 
                '<p style="color: #888;">No deliverable generated yet. Agent execution will produce results here.</p>';
        }
        
        // Clear chat history
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '<p style="color: #888; padding: 20px;">Chat functionality coming soon...</p>';
        }
    },
    
    async renderOrchestratorView() {
        await this.renderInsights();
        
        const detailProgress = document.getElementById('orchestratorDetailProgress');
        const detailETA = document.getElementById('orchestratorDetailETA');
        if (detailProgress) {
            const insightCount = this.reportedInsights.length;
            const hypothesisCount = this.hypotheses.length;
            detailProgress.textContent = `${insightCount} insight${insightCount === 1 ? '' : 's'} • ${hypothesisCount} hypothesis${hypothesisCount === 1 ? '' : 'es'}`;
        }
        if (detailETA) {
            if (this.orchestratorStatus?.eta) {
                detailETA.textContent = `ETA: ${this.orchestratorStatus.eta}`;
            } else {
                detailETA.textContent = '';
            }
        }

        this.renderHypotheses();
        this.renderExecutiveSummaryDetail();
    },
    
    async renderInsights() {
        try {
            const response = await api.getInsights();
            const insights = response.insights || [];
            this.updateReportedInsights(insights);
            this.renderInsightsList();
        } catch (error) {
            console.error('Error rendering insights:', error);
        }
    },

    async deleteInsight(insightId, index) {
        try {
            // Call backend to delete insight if it has an ID
            if (insightId) {
                await api.deleteInsight(insightId);
            }

            // Remove from local array
            this.reportedInsights.splice(index, 1);

            // Re-render
            this.renderInsightsList();

            console.log('✅ Insight deleted');
        } catch (error) {
            console.error('Error deleting insight:', error);
            alert('Failed to delete insight. Please try again.');
        }
    },

    formatTimestamp(timestamp) {
        if (!timestamp) return '--';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '--';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    },

    // ========================================================================
    // Phase Indicator UI
    // ========================================================================
    
    renderPhaseIndicator(currentPhase) {
        const phases = [
            { number: 1, title: 'Create Work Plan', status: currentPhase > 1 ? 'completed' : (currentPhase === 1 ? 'active' : 'pending') },
            { number: 2, title: 'Review & Approve', status: currentPhase > 2 ? 'completed' : (currentPhase === 2 ? 'active' : 'pending') },
            { number: 3, title: 'Execute Tasks', status: currentPhase > 3 ? 'completed' : (currentPhase === 3 ? 'active' : 'pending') },
            { number: 4, title: 'Key Takeaways', status: currentPhase === 4 ? 'completed' : (currentPhase === 4 ? 'active' : 'pending') }
        ];

        return `
            <div class="phase-indicator">
                ${phases.map(phase => `
                    <div class="phase-step ${phase.status}">
                        <span class="phase-number">Phase ${phase.number}</span>
                        <span class="phase-title">${phase.title}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ========================================================================
    // PHASE 1: Work Plan Editor
    // ========================================================================
    
    showPhase1WorkPlanEditor(data) {
        const agent = this.agents.find(a => a.id === data.agentId);
        if (!agent) return;

        const editorHtml = `
            ${this.renderPhaseIndicator(1)}
            
            <div class="work-plan-editor" id="work-plan-editor-${data.agentId}">
                <div class="work-plan-header">
                    <h3>Edit Your Work Plan</h3>
                    <button class="add-step-btn" onclick="app.addPlanStep('${data.agentId}')">+ Add Step</button>
                </div>
                
                <div class="work-plan-items" id="work-plan-items-${data.agentId}">
                    ${agent.plan.map((step, index) => `
                        <div class="work-plan-item" data-step-id="${step.id}">
                            <span class="work-plan-item-number">${index + 1}</span>
                            <input 
                                type="text" 
                                class="work-plan-item-input" 
                                value="${step.title}"
                                data-step-index="${index}"
                                onchange="app.updatePlanStep('${data.agentId}', ${index}, this.value)"
                            />
                            <button 
                                class="work-plan-item-delete" 
                                onclick="app.deletePlanStep('${data.agentId}', ${index})"
                                title="Delete this step"
                            >×</button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="work-plan-footer">
                    <div class="work-plan-info">
                        ${agent.plan.length} steps • Click to edit • Add or remove steps as needed
                    </div>
                    <button 
                        class="btn-approve-plan" 
                        onclick="app.proceedToPhase2('${data.agentId}')"
                        ${agent.plan.length < 3 ? 'disabled' : ''}
                    >
                        Continue to Review →
                    </button>
                </div>
            </div>
        `;

        const detailContainer = document.querySelector('.agent-detail-content');
        if (detailContainer) {
            // Remove existing editor
            const existing = detailContainer.querySelector('.work-plan-editor');
            if (existing) existing.remove();
            
            const existingIndicator = detailContainer.querySelector('.phase-indicator');
            if (existingIndicator) existingIndicator.remove();
            
            // Add at the top
            detailContainer.insertAdjacentHTML('afterbegin', editorHtml);
        }
    },

    updatePlanStep(agentId, stepIndex, newTitle) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent && agent.plan[stepIndex]) {
            agent.plan[stepIndex].title = newTitle;
            console.log(`Updated step ${stepIndex}: ${newTitle}`);
        }
    },

    deletePlanStep(agentId, stepIndex) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent && agent.plan.length > 3) { // Minimum 3 steps
            agent.plan.splice(stepIndex, 1);
            // Re-render
            this.showPhase1WorkPlanEditor({ agentId, plan: agent.plan });
        } else {
            alert('Work plan must have at least 3 steps');
        }
    },

    addPlanStep(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent && agent.plan.length < 12) { // Maximum 12 steps
            agent.plan.push({
                id: agent.plan.length,
                title: 'New step - click to edit',
                status: 'pending',
                progress: 0
            });
            // Re-render
            this.showPhase1WorkPlanEditor({ agentId, plan: agent.plan });
        } else {
            alert('Maximum 12 steps allowed');
        }
    },

    async proceedToPhase2(agentId) {
        console.log('Proceeding to Phase 2: Review & Approve');
        try {
            await api.confirmPlan(agentId);
            console.log('Plan confirmed, moving to Phase 2');
        } catch (error) {
            console.error('Error confirming plan:', error);
            alert('Failed to confirm plan: ' + error.message);
        }
    },

    // ========================================================================
    // PHASE 2: Approval Flow
    // ========================================================================
    
    showApprovalUI(data) {
        const agent = this.agents.find(a => a.id === data.agentId);
        if (!agent) return;

        // Show clarifying questions if available
        const questionsHtml = data.questions ? `
            <div class="clarifying-questions">
                <h4>📋 Clarifying Questions:</h4>
                <div class="questions-list">
                    ${data.questions.split('\n').filter(q => q.trim()).map((q, i) => 
                        `<div class="question-item">${q}</div>`
                    ).join('')}
                </div>
            </div>
        ` : '';

        const approvalHtml = `
            <div class="approval-section" id="approval-${data.agentId}">
                <div class="approval-header">
                    <h3>PHASE 2: Work Plan Ready for Approval</h3>
                    <p>Review the ${agent.plan?.length || 0}-step plan below. Answer clarifying questions and approve to proceed to execution.</p>
                </div>
                
                ${questionsHtml}
                
                <div class="approval-actions">
                    <label for="answers-${data.agentId}">Your Answers (optional):</label>
                    <textarea 
                        id="answers-${data.agentId}" 
                        class="approval-feedback" 
                        placeholder="Answer the clarifying questions above, or leave blank to proceed with the current plan..."
                        rows="4"
                    ></textarea>
                    <button class="btn-approve" onclick="app.approveAgent('${data.agentId}')">
                        Approve & Start Execution
                    </button>
                </div>
            </div>
        `;

        const detailContainer = document.querySelector('.agent-detail-content');
        if (detailContainer) {
            // Remove existing approval section
            const existing = detailContainer.querySelector('.approval-section');
            if (existing) existing.remove();
            
            // Add new approval section at the top
            detailContainer.insertAdjacentHTML('afterbegin', approvalHtml);
        }
    },

    async approveAgent(agentId) {
        const answersTextarea = document.getElementById(`answers-${agentId}`);
        const answers = answersTextarea ? answersTextarea.value.trim() : null;
        
        try {
            await api.approveAgent(agentId, answers);
            
            // Remove approval UI
            const approvalSection = document.getElementById(`approval-${agentId}`);
            if (approvalSection) approvalSection.remove();
            
            console.log(`Agent ${agentId} approved with answers:`, answers || '(none provided)');
        } catch (error) {
            console.error('Error approving agent:', error);
            alert('Failed to approve agent: ' + error.message);
        }
    },

    // ========================================================================
    // Clarification Flow
    // ========================================================================
    
    showClarifyingQuestions(data) {
        const agent = this.agents.find(a => a.id === data.agentId);
        if (!agent) return;

        // Create clarification modal or section
        const questionsHtml = `
            <div class="clarification-section" id="clarification-${data.agentId}">
                <h4>${agent.name} has some questions:</h4>
                <div class="questions-list">
                    ${data.questions.split('\n').filter(q => q && q.trim()).map((q, i) => 
                        (q && q.match && q.match(/^\d+\./))
                            ? `<div class="question-item">${q}</div>`
                            : `<div class="question-item">${i + 1}. ${q || ''}</div>`
                    ).join('')}
                </div>
                <div class="clarification-actions">
                    <button class="btn btn-primary" onclick="app.showClarificationInput('${data.agentId}')">
                        Provide Answers
                    </button>
                    <button class="btn btn-secondary" onclick="app.skipClarification('${data.agentId}')">
                        Skip & Proceed
                    </button>
                </div>
            </div>
        `;

        // Insert into agent detail view
        const detailContainer = document.querySelector('.agent-detail-content');
        if (detailContainer) {
            // Remove existing clarification section
            const existing = detailContainer.querySelector('.clarification-section');
            if (existing) existing.remove();
            
            // Add new section
            detailContainer.insertAdjacentHTML('afterbegin', questionsHtml);
        }
    },

    showClarificationInput(data) {
        const agent = this.agents.find(a => a.id === data.agentId);
        if (!agent) return;

        const inputHtml = `
            <div class="clarification-input-section" id="clarification-input-${data.agentId}">
                <h4>Answer the questions:</h4>
                <textarea 
                    id="clarification-answers-${data.agentId}" 
                    class="clarification-textarea" 
                    placeholder="Please provide answers to the questions above. Be as specific as possible."
                    rows="6"
                ></textarea>
                <div class="clarification-actions">
                    <button class="btn btn-primary" onclick="app.submitClarification('${data.agentId}')">
                        Submit Answers
                    </button>
                    <button class="btn btn-secondary" onclick="app.skipClarification('${data.agentId}')">
                        Skip
                    </button>
                </div>
            </div>
        `;

        // Replace questions section with input section
        const questionsSection = document.getElementById(`clarification-${data.agentId}`);
        if (questionsSection) {
            questionsSection.outerHTML = `
                <div class="clarification-input" id="clarification-answers-${data.agentId}">
                    <h4>💡 Answer the questions:</h4>
                    <textarea 
                        id="clarification-answers-${data.agentId}" 
                        class="clarification-textarea" 
                        placeholder="Provide answers to the questions above. Be as specific as possible."
                        rows="4"
                    ></textarea>
                </div>
            </div>`
        }

        // Focus textarea
        setTimeout(() => {
            const textarea = document.getElementById(`clarification-answers-${data.agentId}`);
            if (textarea) textarea.focus();
        }, 100);
    },

    async submitClarification(agentId) {
        const textarea = document.getElementById(`clarification-answers-${agentId}`);
        const answers = textarea?.value?.trim();
        
        if (!answers) {
            alert('Please provide answers before submitting.');
            return;
        }

        try {
            // Submit answers to backend
            await api.submitClarification(agentId, answers);
            
            // Show loading state
            const section = document.getElementById(`clarification-input-${agentId}`);
            if (section) {
                section.innerHTML = '<div class="loading-message">Processing your answers...</div>';
            }
            
            console.log('Clarification answers submitted for agent:', agentId);
            
        } catch (error) {
            console.error('Error submitting clarification answers:', error);
            alert('Failed to submit answers. Please try again.');
        }
    },

    async skipClarification(agentId) {
        try {
            // Submit empty answers to proceed
            await api.submitClarification(agentId, 'User skipped clarification - proceeding with default approach.');
            
            // Remove clarification section
            const section = document.getElementById(`clarification-${agentId}`) || 
                           document.getElementById(`clarification-input-${agentId}`);
            if (section) section.remove();
            
            console.log('Clarification skipped for agent:', agentId);
            
        } catch (error) {
            console.error('Error skipping clarification:', error);
            alert('Failed to skip clarification. Please try again.');
        }
    },

    // ========================================================================
    // Modal Controls
    // ========================================================================
    
    openModal() {
        console.log('Opening modal...');
        document.getElementById('agentModal').classList.add('show');
    },
    
    closeModal() {
        console.log('Closing modal...');
        document.getElementById('agentModal').classList.remove('show');
        
        // Clear form
        document.getElementById('agentName').value = '';
        document.getElementById('agentFocus').value = '';
        document.getElementById('agentType').value = 'research';
        document.querySelectorAll('.checkbox-group input').forEach(cb => cb.checked = false);
    },
    
    // ========================================================================
    // View Management
    // ========================================================================
    
    async showView(viewName) {
        console.log('Showing view:', viewName);
        
        this.currentView = viewName;
        
        const viewIds = ['dashboard', 'agentDetailView', 'orchestratorView'];
        viewIds.forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            
            if (id === viewName) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });
        
        if (viewName === 'orchestratorView') {
            await this.loadOrchestratorStatus();
        }
        
        this.updateUI();
    },
    
    // ========================================================================
    // Event Listeners
    // ========================================================================
    
    attachEventListeners() {
        console.log('Attaching event listeners...');
        
        // Modal controls
        const newAgentBtn = document.getElementById('newAgentBtn');
        const addAgentBtn = document.getElementById('addAgentBtn');
        const modalClose = document.getElementById('modalClose');
        const modalCancel = document.getElementById('modalCancel');
        const createAgentBtn = document.getElementById('createAgentBtn');
        
        console.log('Button found:', {
            newAgentBtn: !!newAgentBtn,
            addAgentBtn: !!addAgentBtn,
            modalClose: !!modalClose,
            modalCancel: !!modalCancel,
            createAgentBtn: !!createAgentBtn
        });
        
        if (newAgentBtn) {
            newAgentBtn.addEventListener('click', () => {
                console.log('New Agent button clicked!');
                window.location.href = 'agent-create.html';
            });
        }
        if (addAgentBtn) {
            addAgentBtn.addEventListener('click', () => {
                window.location.href = 'agent-create.html';
            });
        }
        if (modalClose) modalClose.addEventListener('click', () => this.closeModal());
        if (modalCancel) modalCancel.addEventListener('click', () => this.closeModal());
        if (createAgentBtn) createAgentBtn.addEventListener('click', () => this.createAgent());
        
        // Navigation
        const backBtn = document.getElementById('backBtn');
        const orchestratorBackBtn = document.getElementById('orchestratorBackBtn');
        const orchestratorCard = document.getElementById('orchestratorCard');

        if (backBtn) backBtn.addEventListener('click', () => this.showView('dashboard'));
        if (orchestratorBackBtn) orchestratorBackBtn.addEventListener('click', () => this.showView('dashboard'));
        if (orchestratorCard) {
            orchestratorCard.addEventListener('click', (event) => {
                if (event.target.closest('button, a')) {
                    return; // respect direct button/link interactions
                }
                this.showView('orchestratorView');
            });
        }

        // Orchestrator controls
        const hypothesisInput = document.getElementById('newHypothesisInput');
        const addHypothesisBtn = document.getElementById('addHypothesisBtn');
        const regenerateSummaryBtn = document.getElementById('regenerateSummaryBtn');

        if (hypothesisInput) {
            hypothesisInput.addEventListener('input', (event) => this.handleHypothesisInput(event.target.value));
        }
        if (addHypothesisBtn) {
            addHypothesisBtn.addEventListener('click', () => this.addHypothesis());
        }

        // Event delegation for dynamically added hypothesis delete buttons in detail view
        const hypothesisListDetail = document.getElementById('hypothesisListDetail');
        if (hypothesisListDetail) {
            hypothesisListDetail.addEventListener('click', (event) => {
                if (event.target.classList.contains('hypothesis-delete-btn')) {
                    const hypothesisId = event.target.dataset.hypothesisId;
                    if (hypothesisId) {
                        this.deleteHypothesis(hypothesisId);
                    }
                }
            });
        }

        if (regenerateSummaryBtn) {
            regenerateSummaryBtn.addEventListener('click', () => {
                if (this.editingExecutiveSummary) {
                    this.cancelEditMode();
                } else {
                    this.fetchExecutiveSummary(true);
                }
            });
        }

        const editSummaryBtn = document.getElementById('editSummaryBtn');
        if (editSummaryBtn) {
            editSummaryBtn.addEventListener('click', () => this.enterEditMode());
        }
        
        // Chat
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const chatInput = document.getElementById('chatInput');

        if (sendMessageBtn) sendMessageBtn.addEventListener('click', () => this.sendMessage());
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Project Context
        const saveContextBtn = document.getElementById('saveContextBtn');
        if (saveContextBtn) {
            saveContextBtn.addEventListener('click', () => this.saveProjectContext());
        }

        // Show save button when context fields are being edited
        const contextFields = ['keyQuestion', 'constraints', 'otherContext'];
        contextFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && saveContextBtn) {
                // Show button on focus or input
                field.addEventListener('focus', () => {
                    saveContextBtn.classList.add('visible');
                });
                field.addEventListener('input', () => {
                    saveContextBtn.classList.add('visible');
                });
            }
        });

        // Column resizing
        this.initColumnResizers();
        this.initTopRowResizer();
    },

    initColumnResizers() {
        const divider1 = document.getElementById('divider1');
        const divider2 = document.getElementById('divider2');

        if (!divider1 || !divider2) return;

        const grid = document.getElementById('orchestratorGrid');
        const col1 = document.getElementById('col1');
        const col2 = document.getElementById('col2');
        const col3 = document.getElementById('col3');

        let isDragging = false;
        let currentDivider = null;
        let startX = 0;
        let startWidths = [];

        const startDrag = (divider, e) => {
            isDragging = true;
            currentDivider = divider;
            startX = e.clientX;

            const gridRect = grid.getBoundingClientRect();
            const col1Width = col1.getBoundingClientRect().width;
            const col2Width = col2.getBoundingClientRect().width;
            const col3Width = col3.getBoundingClientRect().width;

            startWidths = [col1Width, col2Width, col3Width];

            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            e.preventDefault();
        };

        const doDrag = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const gridRect = grid.getBoundingClientRect();
            const gridWidth = gridRect.width;

            if (currentDivider === divider1) {
                // Dragging divider 1 (between col1 and col2)
                const newCol1Width = Math.max(200, Math.min(gridWidth - 400, startWidths[0] + deltaX));
                const newCol2Width = Math.max(200, startWidths[1] - deltaX);
                const col3Width = startWidths[2];

                const totalWidth = newCol1Width + newCol2Width + col3Width;

                grid.style.gridTemplateColumns = `${newCol1Width}px auto ${newCol2Width}px auto ${col3Width}px`;
            } else if (currentDivider === divider2) {
                // Dragging divider 2 (between col2 and col3)
                const col1Width = startWidths[0];
                const newCol2Width = Math.max(200, Math.min(gridWidth - 400, startWidths[1] + deltaX));
                const newCol3Width = Math.max(200, startWidths[2] - deltaX);

                grid.style.gridTemplateColumns = `${col1Width}px auto ${newCol2Width}px auto ${newCol3Width}px`;
            }

            e.preventDefault();
        };

        const stopDrag = () => {
            if (!isDragging) return;

            isDragging = false;
            currentDivider = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        divider1.addEventListener('mousedown', (e) => startDrag(divider1, e));
        divider2.addEventListener('mousedown', (e) => startDrag(divider2, e));

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    },

    initTopRowResizer() {
        const divider = document.getElementById('topRowDivider');
        const dashboardRow = document.getElementById('dashboardTopRow');

        if (!divider || !dashboardRow) return;

        let isDragging = false;
        let startX = 0;
        let startLeftWidth = 0;

        const startDrag = (e) => {
            isDragging = true;
            startX = e.clientX;

            // Get the current widths from the grid template
            const gridStyle = window.getComputedStyle(dashboardRow);
            const columns = gridStyle.gridTemplateColumns.split(' ');
            startLeftWidth = parseInt(columns[0]);

            divider.classList.add('dragging');
            document.body.classList.add('resizing');
            e.preventDefault();
        };

        const doDrag = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const containerWidth = dashboardRow.offsetWidth;

            // Calculate new left width in fr units
            // Total is 100fr (25fr + 8px + 75fr), minus the 8px divider
            const availableWidth = containerWidth - 8;
            const newLeftWidth = Math.max(15, Math.min(50, ((startLeftWidth + deltaX) / availableWidth) * 100));
            const newRightWidth = 100 - newLeftWidth;

            dashboardRow.style.gridTemplateColumns = `${newLeftWidth}fr 8px ${newRightWidth}fr`;
            e.preventDefault();
        };

        const stopDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            divider.classList.remove('dragging');
            document.body.classList.remove('resizing');
        };

        divider.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    },

    // Orchestrator name editing functions
    loadOrchestratorName() {
        const savedName = localStorage.getItem('orchestratorName');
        if (savedName) {
            const nameElement = document.getElementById('orchestratorName');
            const nameDetailElement = document.getElementById('orchestratorNameDetail');
            if (nameElement) nameElement.textContent = savedName;
            if (nameDetailElement) nameDetailElement.textContent = savedName;
        }
    },

    saveOrchestratorName(name) {
        localStorage.setItem('orchestratorName', name);
        console.log('💾 Saved orchestrator name:', name);
    },

    setupOrchestratorNameEditing() {
        const nameElement = document.getElementById('orchestratorName');
        const nameDetailElement = document.getElementById('orchestratorNameDetail');

        const saveNameOnBlur = (element) => {
            const name = element.textContent.trim();
            if (name && name !== '') {
                this.saveOrchestratorName(name);
                // Update both instances
                if (nameElement) nameElement.textContent = name;
                if (nameDetailElement) nameDetailElement.textContent = name;
            } else {
                // Restore if empty
                const savedName = localStorage.getItem('orchestratorName') || 'CENTRAL ORCHESTRATOR';
                element.textContent = savedName;
            }
        };

        const handleKeyDown = (e, element) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                element.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                const savedName = localStorage.getItem('orchestratorName') || 'CENTRAL ORCHESTRATOR';
                element.textContent = savedName;
                element.blur();
            }
        };

        if (nameElement) {
            nameElement.addEventListener('blur', () => saveNameOnBlur(nameElement));
            nameElement.addEventListener('keydown', (e) => handleKeyDown(e, nameElement));
        }

        if (nameDetailElement) {
            nameDetailElement.addEventListener('blur', () => saveNameOnBlur(nameDetailElement));
            nameDetailElement.addEventListener('keydown', (e) => handleKeyDown(e, nameDetailElement));
        }
    }
};

// Global function for edit button (optional alternative to direct click on name)
window.editOrchestratorName = function() {
    const nameElement = document.getElementById('orchestratorName');
    if (nameElement) {
        nameElement.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(nameElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
};

// ===========================
// Logistics Functions
// ===========================

const logistics = {
    searchRequestId: null,

    // Initialize logistics section
    init() {
        const locateBtn = document.getElementById('locateBtn');
        const searchFoodBtn = document.getElementById('searchFoodBtn');

        if (locateBtn) {
            locateBtn.addEventListener('click', () => this.getLocation());
        }

        if (searchFoodBtn) {
            searchFoodBtn.addEventListener('click', () => this.searchFood());
        }

        // Start MCP server on load
        this.startMCPServer();

        // Load search history after a short delay to ensure Firebase is initialized
        setTimeout(() => this.loadSearchHistory(), 1500);
    },

    // Start MCP server
    async startMCPServer() {
        try {
            const response = await fetch('http://localhost:3003/api/mcp/uber-eats/start', {
                method: 'POST'
            });
            const data = await response.json();
            console.log('Uber Eats MCP server started:', data);
        } catch (error) {
            console.error('Failed to start MCP server:', error);
        }
    },

    // Get user location using browser geolocation API
    async getLocation() {
        const addressInput = document.getElementById('logisticsAddress');
        const locateBtn = document.getElementById('locateBtn');

        if (!navigator.geolocation) {
            this.showStatus('Geolocation is not supported by your browser', 'error');
            return;
        }

        locateBtn.disabled = true;
        this.showStatus('Getting your location...', 'info');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;

                try {
                    // Use a reverse geocoding service to get the address
                    // Using Nominatim (OpenStreetMap) as a free option
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    const data = await response.json();

                    // Format the address
                    const address = data.display_name || `${latitude}, ${longitude}`;
                    addressInput.value = address;

                    this.showStatus('Location found!', 'success');
                    setTimeout(() => this.showStatus('', ''), 2000);
                } catch (error) {
                    console.error('Error getting address:', error);
                    addressInput.value = `${latitude}, ${longitude}`;
                    this.showStatus('Using coordinates', 'success');
                    setTimeout(() => this.showStatus('', ''), 2000);
                } finally {
                    locateBtn.disabled = false;
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                this.showStatus('Could not get your location', 'error');
                locateBtn.disabled = false;
                setTimeout(() => this.showStatus('', ''), 3000);
            }
        );
    },

    // Store current search data
    currentSearch: {
        address: '',
        foodCraving: ''
    },

    // Search for food
    async searchFood() {
        const address = document.getElementById('logisticsAddress').value.trim();
        const foodCraving = document.getElementById('logisticsFoodCraving').value.trim();
        const resultsDiv = document.getElementById('logisticsResults');
        const searchBtn = document.getElementById('searchFoodBtn');

        if (!address || !foodCraving) {
            this.showStatus('Please enter both address and food craving', 'error');
            return;
        }

        // Store search data for later use
        this.currentSearch = { address, foodCraving };

        try {
            searchBtn.disabled = true;
            this.showStatus('Searching...', 'info');

            // Show loading state
            resultsDiv.innerHTML = `
                <div class="logistics-success">
                    <div class="logistics-spinner" style="margin-bottom: 16px;"></div>
                    <p>🔍 Searching for "${foodCraving}" near ${address}...</p>
                    <p style="font-size: 12px; margin-top: 8px; color: var(--text-tertiary);">This may take up to 2 minutes</p>
                </div>
            `;

            // Call the MCP search endpoint
            const response = await fetch('http://localhost:3003/api/mcp/uber-eats/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, foodCraving })
            });

            const data = await response.json();

            if (data.success) {
                this.searchRequestId = data.requestId;
                this.showStatus(`Search started. Retrieving results in 2 minutes...`, 'success');

                // Poll for results after 2 minutes
                setTimeout(() => this.fetchResults(), 120000);

                resultsDiv.innerHTML = `
                    <div class="logistics-success">
                        ✅ Search started successfully!<br>
                        Results will appear automatically in 2 minutes...<br>
                        <button class="btn-primary" onclick="logistics.fetchResults()" style="margin-top: 12px; font-size: 13px; padding: 8px 16px;">
                            Check Results Now
                        </button>
                    </div>
                `;
            } else {
                this.showStatus('Search failed', 'error');
                resultsDiv.innerHTML = `<div class="logistics-error">❌ ${data.error}</div>`;
            }
        } catch (error) {
            console.error('Error during search:', error);
            this.showStatus('Error during search', 'error');
            resultsDiv.innerHTML = `<div class="logistics-error">❌ Error: ${error.message}</div>`;
        } finally {
            searchBtn.disabled = false;
        }
    },

    // Fetch search results
    async fetchResults() {
        if (!this.searchRequestId) {
            return;
        }

        const resultsDiv = document.getElementById('logisticsResults');

        try {
            this.showStatus('Retrieving results...', 'info');

            resultsDiv.innerHTML = `
                <div class="logistics-loading">
                    <div class="logistics-spinner"></div>
                    <p>Retrieving results...</p>
                </div>
            `;

            const response = await fetch(
                `http://localhost:3003/api/mcp/uber-eats/results/${this.searchRequestId}`
            );
            const data = await response.json();

            if (data.success) {
                this.showStatus('Results retrieved!', 'success');
                this.displayResults(data.results);

                // Save to Firebase
                try {
                    await uberEatsDB.saveSearch({
                        requestId: this.searchRequestId,
                        address: this.currentSearch.address,
                        foodCraving: this.currentSearch.foodCraving,
                        results: data.results
                    });
                    console.log('✅ Search results saved to Firebase');

                    // Reload search history
                    this.loadSearchHistory();
                } catch (error) {
                    console.error('Failed to save to Firebase:', error);
                    // Don't show error to user, just log it
                }

                setTimeout(() => this.showStatus('', ''), 2000);
            } else {
                this.showStatus('Failed to retrieve results', 'error');
                resultsDiv.innerHTML = `<div class="logistics-error">❌ ${data.error}</div>`;
            }
        } catch (error) {
            console.error('Error fetching results:', error);
            this.showStatus('Error fetching results', 'error');
            resultsDiv.innerHTML = `<div class="logistics-error">❌ Error: ${error.message}</div>`;
        }
    },

    // Display results
    displayResults(results) {
        const resultsDiv = document.getElementById('logisticsResults');

        if (typeof results === 'string') {
            resultsDiv.innerHTML = `
                <div class="logistics-success">
                    <strong>Search Results:</strong><br>
                    <pre style="white-space: pre-wrap; margin-top: 12px; font-size: 13px; line-height: 1.6; font-family: inherit;">${results}</pre>
                </div>
            `;
        } else if (Array.isArray(results)) {
            const itemsHtml = results.map(item => `
                <div class="logistics-food-item">
                    <h5>${item.name || 'Unknown Item'}</h5>
                    <div class="restaurant-name">${item.restaurant || 'Unknown Restaurant'}</div>
                    <div class="logistics-food-info">
                        ${item.price ? `<span>💰 ${item.price}</span>` : ''}
                        ${item.rating ? `<span>⭐ ${item.rating}</span>` : ''}
                        ${item.deliveryTime ? `<span>🕒 ${item.deliveryTime}</span>` : ''}
                    </div>
                </div>
            `).join('');

            resultsDiv.innerHTML = `<div class="logistics-results-grid">${itemsHtml}</div>`;
        } else {
            resultsDiv.innerHTML = `<div class="logistics-error">❌ Unexpected result format</div>`;
        }
    },

    // Show status message
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('logisticsStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `logistics-status ${type}`;
        }
    },

    // Load search history from Firebase
    async loadSearchHistory() {
        const historyDiv = document.getElementById('logisticsHistory');

        if (!historyDiv) return;

        try {
            historyDiv.innerHTML = `
                <div class="logistics-loading" style="padding: 20px;">
                    <div class="logistics-spinner"></div>
                    <p>Loading search history...</p>
                </div>
            `;

            // Wait for Firebase to be initialized
            if (typeof uberEatsDB === 'undefined' || !db) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const searches = await uberEatsDB.getAll();

            if (searches.length === 0) {
                historyDiv.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                        No search history yet. Start by searching for food above!
                    </div>
                `;
                return;
            }

            this.displaySearchHistory(searches);
        } catch (error) {
            console.error('Error loading search history:', error);
            historyDiv.innerHTML = `
                <div class="logistics-error">
                    Failed to load search history. Please try again.
                </div>
            `;
        }
    },

    // Display search history
    displaySearchHistory(searches) {
        const historyDiv = document.getElementById('logisticsHistory');

        const historyHtml = searches.map(search => {
            const date = search.createdAt?.toDate ? search.createdAt.toDate() : new Date();
            const timeAgo = this.getTimeAgo(date);

            return `
                <div class="logistics-history-item" onclick="logistics.viewSearchDetails('${search.id}')">
                    <div class="history-item-header">
                        <div>
                            <strong style="color: var(--text-primary);">${search.foodCraving}</strong>
                            <span style="color: var(--text-tertiary); font-size: 12px; margin-left: 8px;">at ${search.address}</span>
                        </div>
                        <span style="color: var(--text-tertiary); font-size: 12px;">${timeAgo}</span>
                    </div>
                    <div class="history-item-preview">
                        ${this.getResultsPreview(search.results)}
                    </div>
                </div>
            `;
        }).join('');

        historyDiv.innerHTML = `<div class="logistics-history-list">${historyHtml}</div>`;
    },

    // Get results preview
    getResultsPreview(results) {
        if (typeof results === 'string') {
            // Extract first few lines
            const lines = results.split('\n').filter(line => line.trim());
            const preview = lines.slice(0, 3).join(' ');
            return preview.substring(0, 150) + (preview.length > 150 ? '...' : '');
        }
        return 'View results →';
    },

    // Get time ago string
    getTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    },

    // View search details
    async viewSearchDetails(searchId) {
        const resultsDiv = document.getElementById('logisticsResults');

        try {
            const searches = await uberEatsDB.getAll();
            const search = searches.find(s => s.id === searchId);

            if (search) {
                // Scroll to results
                resultsDiv.scrollIntoView({ behavior: 'smooth' });

                // Display results
                this.displayResults(search.results);
            }
        } catch (error) {
            console.error('Error viewing search details:', error);
        }
    }
};

// Expose app and logistics to window for inline event handlers
window.app = app;
window.logistics = logistics;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.init();

    // Initialize logistics
    logistics.init();

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.agent-menu')) {
            document.querySelectorAll('.agent-menu-dropdown').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });
});
