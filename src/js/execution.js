/**
 * Agent Execution Page
 * 
 * Full-page interface for step 2+ execution with real-time updates
 * No modal dependency - dedicated execution environment
 */

class ExecutionPage {
    constructor() {
        this.ws = null;
        this.agentId = null;
        this.currentAgent = null;
        this.currentStepIndex = 1; // Start with step 2 (index 1)
        this.isConnected = false;
        
        this.init();
    }

    async init() {
        // Get agent ID from URL params
        const urlParams = new URLSearchParams(window.location.search);
        this.agentId = urlParams.get('agentId');
        
        if (!this.agentId) {
            this.showError('No agent ID specified in URL');
            return;
        }

        console.log(`Execution page initialized for agent: ${this.agentId}`);
        
        // Initialize UI
        this.setupEventListeners();
        this.connectWebSocket();
        this.initializeUI();
        
        // Load agent data
        await this.loadAgentData();
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('backToDashboard').addEventListener('click', () => {
            window.location.href = '../index.html';
        });

        // Execution controls
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });

        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopExecution();
        });

        // Output controls
        document.getElementById('scrollToBottom').addEventListener('click', () => {
            this.scrollToBottom();
        });

        document.getElementById('clearOutput').addEventListener('click', () => {
            this.clearOutput();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.location.href = '../index.html';
            }
            if (e.ctrlKey && e.key === 'p') {
                this.togglePause();
                e.preventDefault();
            }
        });
    }

    connectWebSocket() {
        const wsUrl = window.location.protocol === 'https:' 
            ? `wss://${window.location.hostname}:3003`
            : `ws://${window.location.hostname}:3003`;
            
        console.log(`Connecting WebSocket to: ${wsUrl}`);
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.updateConnectionStatus('Connected');
                
                // Subscribe to agent updates
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    agentId: this.agentId
                }));
            };
            
            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(JSON.parse(event.data));
            };

            // Check for existing agent data from URL for demonstration
            const step = urlParams.get('step');
            if (step) {
                this.currentStepIndex = parseInt(step);
            }
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected');
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('Attempting to reconnect...');
                        this.connectWebSocket();
                    }
                }, 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('Error');
            };
            
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.updateConnectionStatus('Connection Failed');
        }
    }

    handleWebSocketMessage(data) {
        console.log('Received WebSocket message:', data);
        
        switch (data.type) {
            case 'subscribed':
                this.addOutput(`Connected to agent updates`);
                break;
                
            case 'agentProgress':
                if (data.agentId === this.agentId) {
                    this.updateOverallProgress(data.progress);
                }
                break;
                
            case 'stepStarted':
                if (data.agentId === this.agentId) {
                    this.handleStepStarted(data.stepIndex, data.step);
                }
                break;
                
            case 'stepProgress':
                if (data.agentId === this.agentId) {
                    this.handleStepProgress(data.stepIndex, data.progress, data.message);
                }
                break;
                
            case 'stepCompleted':
                if (data.agentId === this.agentId) {
                    this.handleStepCompleted(data.stepIndex, data.output, data.insights, data.artifacts);
                }
                break;
                
            case 'stepFailed':
                if (data.agentId === this.agentId) {
                    this.handleStepFailed(data.stepIndex, data.error);
                }
                break;
                
            case 'agentCompleted':
                if (data.agentId === this.agentId) {
                    this.handleAgentCompleted(data.deliverable);
                }
                break;
                
            case 'agentError':
                if (data.agentId === this.agentId) {
                    this.handleError(data.error);
                }
                break;
        }
    }

    async loadAgentData() {
        try {
            const response = await fetch(`/api/agents/${this.agentId}`);
            if (!response.ok) {
                throw new Error('Agent not found');
            }
            
            const agent = await response.json();
            this.currentAgent = agent;
            this.initializeAgentUI(agent);
            
        } catch (error) {
            console.error('Error loading agent:', error);
            this.showError('Failed to load agent data');
            
            // Try to load from context manager as fallback
            this.loadAgentFromStorage();
        }
    }

    async loadAgentFromStorage() {
        try {
            const response = await fetch(`/api/agent-state/${this.agentId}`);
            if (!response.ok) {
                throw new Error('Agent state not found');
            }
            
            const agentState = await response.json();
            this.currentAgent = agentState;
            this.initializeAgentUI(agentState);
            
        } catch (error) {
            console.error('Error loading agent from storage:', error);
        }
    }

    initializeAgentUI(agent) {
        // Update header info
        document.getElementById('agentName').textContent = agent.name;
        document.getElementById('agentFocus').textContent = agent.focus;
        document.getElementById('agentType').textContent = this.getAgentTypeLabel(agent.type);
        
        // Set agent icon
        document.getElementById('agentIcon').textContent = this.getAgentIcon(agent.type);
        
        // Update status
        document.getElementById('statusText').textContent = this.getStatusLabel(agent.status);
        document.getElementById('statusDot').className = `status-dot ${agent.status}`;
        
        // Initialize steps overview
        this.initializeStepsOverview(agent.plan);
        
        // Start at current step if specified
        if (agent.currentStep !== undefined) {
            this.currentStepIndex = agent.currentStep;
            this.updateCurrentStepDisplay(agent.currentStep);
        }
        
        this.addOutput(`Loaded agent: ${agent.name}`);
        this.addOutput(`Type: ${this.getAgentTypeLabel(agent.type)}`);
        this.addOutput(`Focus: ${agent.focus}`);
        this.addOutput(`Plan: ${agent.plan ? agent.plan.length : 0} steps`);
    }

    initializeStepsOverview(plan) {
        const stepsOverview = document.getElementById('stepsOverview');
        stepsOverview.innerHTML = '';
        
        if (!plan) {
            stepsOverview.innerHTML = '<p class="no-steps">No execution plan available</p>';
            return;
        }
        
        plan.forEach((step, index) => {
            const stepElement = this.createStepElement(step, index);
            stepsOverview.appendChild(stepElement);
        });
    }

    createStepElement(step, index) {
        const stepEl = document.createElement('div');
        stepEl.className = `execution-step-element ${step.status || 'pending'}`;
        stepEl.id = `step-${index}`;
        
        const statusIcon = this.getStepStatusIcon(step.status);
        const isCurrentStep = index === this.currentStepIndex;
        
        stepEl.innerHTML = `
            <div class="step-element-header">
                <div class="step-element-number">
                    <span>${index + 1}</span>
                </div>
                <div class="step-element-content">
                    <h4 class="step-element-title">${step.title}</h4>
                    ${step.progress !== undefined ? `
                        <div class="step-element-progress">
                            <div class="mini-progress-bar">
                                <div class="mini-progress-fill" style="width: ${step.progress}%"></div>
                            </div>
                            <span class="progress-percent">${Math.round(step.progress)}%</span>
                        </div>
                    ` : ''}
                </div>
                <div class="step-element-status">
                    ${statusIcon}
                </div>
            </div>
            ${isCurrentStep ? '<div class="current-step-indicator">Current Step</div>' : ''}
        `;
        
        if (isCurrentStep) {
            stepEl.classList.add('current');
        }
        
        return stepEl;
    }

    handleStepStarted(stepIndex, step) {
        this.currentStepIndex = stepIndex;
        this.updateCurrentStepDisplay(stepIndex);
        
        // Update step element
        const stepEl = document.getElementById(`step-${stepIndex}`);
        if (stepEl) {
            stepEl.className = 'execution-step-element in-progress current';
            stepEl.innerHTML = this.createStepElement(step, stepIndex).innerHTML;
        }
        
        // Update current step panel
        document.getElementById('stepTitle').textContent = step.title;
        document.getElementById('currentStepNumber').textContent = stepIndex + 1;
        document.getElementById('currentStepText').textContent = `Step ${stepIndex + 1} of ${this.currentAgent.plan.length}`;
        document.getElementById('stepStartTime').textContent = this.formatTime(new Date());
        
        this.addOutput(`Started: ${step.title}`);
    }

    handleStepProgress(stepIndex, progress, message) {
        if (stepIndex === this.currentStepIndex) {
            document.getElementById('stepProgressFill').style.width = `${progress}%`;
            document.getElementById('stepProgressText').textContent = `${Math.round(progress)}%`;
        }
        
        // Update step element
        const stepEl = document.getElementById(`step-${stepIndex}`);
        if (stepEl) {
            const progressFill = stepEl.querySelector('.mini-progress-fill');
            const progressPercent = stepEl.querySelector('.progress-percent');
            if (progressFill) progressFill.style.width = `${progress}%`;
            if (progressPercent) progressPercent.textContent = `${Math.round(progress)}%`;
        }
        
        this.addOutput(message);
    }

    handleStepCompleted(stepIndex, output, insights, artifacts) {
        // Update step element
        const stepEl = document.getElementById(`step-${stepIndex}`);
        if (stepEl) {
            stepEl.className = 'execution-step-element completed';
            const statusIcon = stepEl.querySelector('.step-element-status');
            if (statusIcon) statusIcon.innerHTML = '<span class="status-icon completed">✓</span>';
        }
        
        // Update current step if this was the active one
        if (stepIndex === this.currentStepIndex) {
            document.getElementById('stepProgressFill').style.width = '100%';
            document.getElementById('stepProgressText').textContent = '100%';
            
            // Move to next step if available
            if (stepIndex + 1 < this.currentAgent.plan.length) {
                setTimeout(() => {
                    this.loadNextStep();
                }, 2000);
            }
        }
        
        this.addOutput(`Completed step ${stepIndex + 1}: ${this.currentAgent.plan[stepIndex].title}`);
        
        if (insights && insights.length > 0) {
            this.addOutput('Key findings:');
            insights.forEach(insight => {
                this.addOutput(`• ${insight}`);
            });
        }
        
        if (artifacts && artifacts.length > 0) {
            this.addOutput('Generated artifacts:');
            artifacts.forEach(artifact => {
                this.addOutput(`• ${artifact.title} (${artifact.size} KB)`);
            });
        }
        
        // Update summary counts
        this.updateStepCounts();
    }

    handleStepFailed(stepIndex, error) {
        // Update step element
        const stepEl = document.getElementById(`step-${stepIndex}`);
        if (stepEl) {
            stepEl.className = 'execution-step-element failed';
            const statusIcon = stepEl.querySelector('.step-element-status');
            if (statusIcon) statusIcon.innerHTML = '<span class="status-icon failed">✗</span>';
        }
        
        this.addOutput(`Step ${stepIndex + 1} failed: ${error}`, 'error');
        this.updateStatusText('Step Failed');
        document.getElementById('statusDot').className = 'status-dot failed';
    }

    handleAgentCompleted(deliverable) {
        this.updateStatusText('Completed');
        document.getElementById('statusDot').className = 'status-dot completed';
        this.addOutput('Agent execution completed successfully!', 'success');
        this.addOutput('Final deliverable:', 'info');
        this.addOutput(deliverable.content);
    }

    handleError(error) {
        console.error('Agent error:', error);
        this.addOutput(`Error: ${error}`, 'error');
        this.updateStatusText('Error');
        document.getElementById('statusDot').className = 'status-dot error';
    }

    updateCurrentStepDisplay(stepIndex) {
        // Update all step elements
        document.querySelectorAll('.execution-step-element').forEach((el, idx) => {
            el.classList.toggle('current', idx === stepIndex);
            el.classList.toggle('active', idx === stepIndex);
        });
    }

    updateOverallProgress(progress) {
        document.getElementById('overallProgressText').textContent = `${Math.round(progress)}%`;
    }

    updateStatusText(status) {
        document.getElementById('statusText').textContent = this.getStatusLabel(status);
    }

    updateConnectionStatus(status) {
        document.getElementById('connectionStatus').textContent = status;
        const statusClass = status.toLowerCase().replace(' ', '-');
        document.getElementById('connectionStatus').className = `status-item connection-${statusClass}`;
    }

    updateStepCounts() {
        const steps = this.currentAgent?.plan || [];
        const completed = steps.filter(s => s.status === 'completed').length;
        const inProgress = steps.filter(s => s.status === 'in-progress').length;
        const pending = steps.filter(s => s.status === 'pending' || !s.status).length;
        
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('activeCount').textContent = inProgress;
        document.getElementById('pendingCount').textContent = pending;
    }

    addOutput(text, type = 'info') {
        const outputContent = document.getElementById('outputContent');
        const entry = document.createElement('div');
        entry.className = `output-entry ${type}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'output-timestamp';
        timestamp.textContent = this.formatTime(new Date());
        
        const textSpan = document.createElement('span');
        textSpan.className = 'output-text';
        textSpan.textContent = text;
        
        entry.appendChild(timestamp);
        entry.appendChild(textSpan);
        outputContent.appendChild(entry);
        
        // Auto-scroll to bottom
        this.scrollToBottom();
    }

    scrollToBottom() {
        const outputContent = document.getElementById('outputContent');
        outputContent.scrollTop = outputContent.scrollHeight;
    }

    clearOutput() {
        const outputContent = document.getElementById('outputContent');
        outputContent.innerHTML = '';
    }

    togglePause() {
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn.textContent === 'Pause') {
            pauseBtn.textContent = 'Resume';
            pauseBtn.className = 'btn-primary';
            this.addOutput('Execution paused');
        } else {
            pauseBtn.textContent = 'Pause';
            pauseBtn.className = 'btn-secondary';
            this.addOutput('Execution resumed');
        }
    }

    stopExecution() {
        if (confirm('Are you sure you want to stop the agent execution?')) {
            this.addOutput('Stopping execution...', 'warning');
            // Send stop command to backend
            if (this.ws && this.isConnected) {
                this.ws.send(JSON.stringify({
                    type: 'stopAgent',
                    agentId: this.agentId
                }));
            }
        }
    }

    loadNextStep() {
        this.currentStepIndex++;
        if (this.currentStepIndex < this.currentAgent.plan.length) {
            this.addOutput(`Moving to step ${this.currentStepIndex + 1}: ${this.currentAgent.plan[this.currentStepIndex].title}`);
            this.updateCurrentStepDisplay(this.currentStepIndex);
        }
    }

    initializeUI() {
        // Update server time every second
        setInterval(() => {
            document.getElementById('serverTime').textContent = this.formatTime(new Date());
            document.getElementById('lastUpdate').textContent = this.formatTime(new Date());
        }, 1000);
    }

    showError(message) {
        this.addOutput(message, 'error');
        // Show error in page content area
        const content = document.querySelector('.execution-container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'execution-error';
        errorDiv.innerHTML = `
            <h3>Error</h3>
            <p>${message}</p>
            <button onclick="window.location.href='../index.html'">Return to Dashboard</button>
        `;
        content.appendChild(errorDiv);
    }

    // Helper methods
    getAgentTypeLabel(type) {
        const types = {
            research: 'Research Agent',
            financial: 'Financial Analyst',
            strategy: 'Strategy Agent',
            industry: 'Industry Expert',
            custom: 'Custom Agent'
        };
        return types[type] || 'AI Agent';
    }

    getAgentIcon(type) {
        const icons = {
            research: 'RS',
            financial: 'FN',
            strategy: 'ST',
            industry: 'IN',
            custom: 'AI'
        };
        return icons[type] || 'AG';
    }

    getStepStatusIcon(status) {
        const icons = {
            'pending': '<span class="status-icon pending">○</span>',
            'in-progress': '<span class="status-icon in-progress">⟳</span>',
            'completed': '<span class="status-icon completed">✓</span>',
            'failed': '<span class="status-icon failed">✗</span>'
        };
        return icons[status] || '<span class="status-icon pending">○</span>';
    }

    getStatusLabel(status) {
        const labels = {
            'queued': 'Queued',
            'planning': 'Planning',
            'awaiting_clarification': 'Awaiting Clarification',
            'awaiting_approval': 'Awaiting Approval',
            'running': 'Running',
            'completed': 'Completed',
            'error': 'Error',
            'stopped': 'Stopped'
        };
        return labels[status] || status;
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// Initialize execution page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ExecutionPage();
});
