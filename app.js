// Agent Management System

class Agent {
    constructor(name, type, focus, tools, priority, autoSync = true) {
        this.id = Date.now() + Math.random();
        this.name = name;
        this.type = type;
        this.focus = focus;
        this.tools = tools;
        this.priority = priority;
        this.autoSync = autoSync;
        this.progress = 0;
        this.status = 'queued';
        this.plan = this.generatePlan(); // Generate plan FIRST
        this.eta = this.calculateETA(); // Then calculate ETA
        this.deliverable = this.generateDeliverable();
        this.chatHistory = [];
        this.activityLog = [];
        this.createdAt = new Date();
        
        // Start simulating work
        this.startWork();
    }
    
    getIcon() {
        const labels = {
            research: 'RS',
            financial: 'FN',
            strategy: 'ST',
            industry: 'IN',
            slides: 'SL',
            meeting: 'MT',
            custom: 'AG'
        };
        return labels[this.type] || 'AG';
    }
    
    generatePlan() {
        const planTemplates = {
            research: [
                { title: 'Gather industry reports', duration: 30, completed: false },
                { title: 'Scrape competitor websites', duration: 90, completed: false },
                { title: 'Extract data from PDFs', duration: 60, completed: false },
                { title: 'Cross-reference data sources', duration: 45, completed: false },
                { title: 'Synthesize findings', duration: 90, completed: false },
                { title: 'Quality review', duration: 30, completed: false }
            ],
            financial: [
                { title: 'Ingest historical financials', duration: 15, completed: false },
                { title: 'Normalize P&L statements', duration: 90, completed: false },
                { title: 'Build revenue forecast model', duration: 120, completed: false },
                { title: 'EBITDA margin assumptions', duration: 60, completed: false },
                { title: 'Run sensitivity tables', duration: 60, completed: false },
                { title: 'Generate output charts', duration: 30, completed: false }
            ],
            strategy: [
                { title: 'Collect inputs from all agents', duration: 30, completed: false },
                { title: 'Run hypothesis validation', duration: 60, completed: false },
                { title: 'Identify recommendation gaps', duration: 45, completed: false },
                { title: 'Draft strategic options', duration: 120, completed: false },
                { title: 'Lead debate with agents', duration: 60, completed: false },
                { title: 'Generate executive summary', duration: 45, completed: false }
            ],
            industry: [
                { title: 'Query industry databases', duration: 20, completed: false },
                { title: 'Analyze regulatory landscape', duration: 90, completed: false },
                { title: 'Map compliance requirements', duration: 60, completed: false },
                { title: 'Draft risk assessment', duration: 75, completed: false },
                { title: 'Create mitigation strategies', duration: 60, completed: false }
            ],
            slides: [
                { title: 'Receive storyline from Strategy', duration: 15, completed: false },
                { title: 'Design slide architecture', duration: 30, completed: false },
                { title: 'Build situation slides', duration: 90, completed: false },
                { title: 'Build analysis slides', duration: 120, completed: false },
                { title: 'Build recommendation slides', duration: 90, completed: false },
                { title: 'Quality check with Strategy', duration: 30, completed: false }
            ],
            meeting: [
                { title: 'Pull previous meeting notes', duration: 15, completed: false },
                { title: 'Identify decision-makers', duration: 20, completed: false },
                { title: 'Generate anticipated questions', duration: 45, completed: false },
                { title: 'Prepare talking points', duration: 60, completed: false },
                { title: 'Create briefing memo', duration: 45, completed: false },
                { title: 'Assemble backup slides', duration: 30, completed: false }
            ]
        };
        
        return planTemplates[this.type] || [
            { title: 'Initialize task', duration: 15, completed: false },
            { title: 'Process information', duration: 60, completed: false },
            { title: 'Generate output', duration: 45, completed: false }
        ];
    }
    
    generateDeliverable() {
        const deliverableTemplates = {
            research: {
                title: 'Market Sizing Report',
                content: `# Executive Summary\n\nTotal Market: $2.3B\nTAM: $2.3B (24% CAGR)\nSAM: $890M\nSOM: $120M\n\n## Key Players:\n- Company A (35% market share)\n- Company B (28% market share)\n- Company C (18% market share)\n\n## Market Trends:\n- Cloud migration accelerating\n- Regulatory changes favoring SaaS\n- Competition intensifying in mid-market`,
                data: ['8 industry reports', '23 company profiles', '12 analyst PDFs', '5 APIs queried'],
                dependencies: ['-> Feeding to Strategy Agent', '-> Feeding to Central Orchestrator']
            },
            financial: {
                title: 'DCF Model & Valuation',
                content: `# Financial Projections\n\n## Base Case:\n- Valuation: $450M (12x ARR)\n- Revenue Year 3: $37.5M\n- EBITDA Margin: 22%\n- Break-even: Month 18\n\n## Bull Case:\n- Valuation: $680M\n- Revenue Year 3: $52M\n- EBITDA Margin: 28%\n\n## Sensitivities:\n- Revenue CAGR: 40-60%\n- Gross Margin: 58-68%`,
                data: ['3 years historical financials', '5 comparable companies', 'Sensitivity analysis (8 scenarios)'],
                dependencies: ['-> Waiting for Research data', '-> Feeding to Central Orchestrator']
            },
            strategy: {
                title: 'Strategic Options Memo',
                content: `# Strategic Recommendation\n\n## Option 1: Rapid Market Entry\n- Launch in Singapore (Q1 2025)\n- Investment: $12M\n- Expected ROI: 3.2x\n\n## Option 2: Phased Approach\n- Pilot in Singapore (Q2 2025)\n- Investment: $8M\n- Expected ROI: 2.8x\n\n## Recommendation: Option 1\nRationale: First-mover advantage critical`,
                data: ['Synthesis of 4 agent inputs', 'Framework analysis (Porter, BCG)', 'Risk assessment'],
                dependencies: ['-> Waiting on Financial completion', '-> Feeding to Central Orchestrator']
            }
        };
        
        return deliverableTemplates[this.type] || {
            title: 'Analysis Report',
            content: '# Report\n\nAnalysis in progress...',
            data: ['Data source 1', 'Data source 2'],
            dependencies: []
        };
    }
    
    calculateETA() {
        const totalMinutes = this.plan.reduce((sum, step) => sum + step.duration, 0);
        const eta = new Date();
        eta.setMinutes(eta.getMinutes() + totalMinutes);
        return eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    
    startWork() {
        this.status = 'in-progress';
        this.workInterval = setInterval(() => {
            this.simulateProgress();
        }, 3000); // Update every 3 seconds for demo
    }
    
    // Enhanced step tracking with detailed status
    updateStepStatus(stepIndex, status, details = null) {
        if (stepIndex >= 0 && stepIndex < this.plan.length) {
            const step = this.plan[stepIndex];
            step.status = status;
            step.details = details;
            step.lastUpdated = new Date();
            
            // Emit step update to frontend
            if (window.app && window.app.agentManager) {
                window.app.agentManager.emit('stepStatusUpdate', {
                    agentId: this.id,
                    stepIndex,
                    status,
                    details,
                    progress: this.progress
                });
            }
        }
    }

    simulateProgress() {
        if (this.progress >= 100) {
            clearInterval(this.workInterval);
            this.status = 'completed';
            return;
        }
        
        // Simulate progress on current step with enhanced status tracking
        const currentStepIndex = this.plan.findIndex(step => !step.completed);
        if (currentStepIndex !== -1) {
            const currentStep = this.plan[currentStepIndex];
            const progressIncrement = Math.random() * 5 + 2;
            
            // Update step status to in-progress if starting
            if (!currentStep.status || currentStep.status === 'pending') {
                this.updateStepStatus(currentStepIndex, 'in-progress', {
                    startTime: new Date(),
                    message: `Starting: ${currentStep.title}`
                });
                this.addActivityLog(`Started: ${currentStep.title}`);
            }
            
            currentStep.progress = (currentStep.progress || 0) + progressIncrement;
            
            // Add detailed progress info
            const progressPercent = Math.round(currentStep.progress);
            this.updateStepStatus(currentStepIndex, 'in-progress', {
                progress: currentStep.progress,
                message: `Progress: ${progressPercent}% - Working on ${currentStep.title}`,
                startTime: currentStep.startTime || new Date(),
                estimatedCompletion: this.estimateStepCompletion(currentStep)
            });
            
            if (currentStep.progress >= 100) {
                currentStep.completed = true;
                currentStep.progress = 100;
                this.updateStepStatus(currentStepIndex, 'completed', {
                    completionTime: new Date(),
                    message: `Completed: ${currentStep.title}`,
                    result: this.generateStepResult(currentStep)
                });
                this.addActivityLog(`Completed: ${currentStep.title}`);
                
                // Send WebSocket update for completed step
                if (window.app && window.app.ws && window.app.ws.readyState === WebSocket.OPEN) {
                    window.app.ws.send(JSON.stringify({
                        type: 'stepCompleted',
                        agentId: this.id,
                        stepIndex: currentStepIndex,
                        step: currentStep,
                        agentProgress: this.progress
                    }));
                }
            }
            
            // Calculate overall progress
            const completedSteps = this.plan.filter(s => s.completed).length;
            this.progress = Math.round((completedSteps / this.plan.length) * 100);
            
            // Random chance of blocker with enhanced handling
            if (Math.random() < 0.05 && !currentStep.blocker) {
                currentStep.blocker = 'Waiting for additional input';
                this.status = 'blocked';
                this.updateStepStatus(currentStepIndex, 'blocked', {
                    blocker: currentStep.blocker,
                    message: `Blocked: ${currentStep.title} - ${currentStep.blocker}`
                });
                this.addActivityLog(`Blocked: ${currentStep.title} - ${currentStep.blocker}`);
            }
        }
        
        // Update UI
        app.updateUI();
    }
    
    // Helper methods for enhanced step tracking
    estimateStepCompletion(step) {
        if (!step.duration) return null;
        const elapsed = (Date.now() - (step.startTime || Date.now())) / 1000; // seconds
        const progress = step.progress / 100;
        const totalEstimated = step.duration * 60; // Convert minutes to seconds
        const remaining = totalEstimated - elapsed;
        return remaining > 0 ? new Date(Date.now() + remaining * 1000) : null;
    }
    
    generateStepResult(step) {
        const resultTemplates = {
            research: `Research completed with comprehensive data analysis. Key findings identified and documented.`,
            financial: `Financial model updated with latest assumptions. Sensitivity analysis performed.`,
            strategy: `Strategic analysis complete. Recommendations formulated based on available data.`,
            industry: `Industry analysis completed. Competitive landscape evaluated.`
        };
        
        return {
            summary: resultTemplates[this.type] || 'Task completed successfully.',
            dataPoints: Math.floor(Math.random() * 10) + 5,
            confidence: Math.floor(Math.random() * 30) + 70, // 70-100%
            artifacts: this.generateArtifactsForStep(step)
        };
    }
    
    generateArtifactsForStep(step) {
        const artifactTypes = ['PDF Report', 'Data Analysis', 'Chart', 'Summary', 'Recommendation'];
        return artifactTypes.slice(0, Math.floor(Math.random() * 3) + 1).map(type => ({
            type,
            fileName: `${step.title.replace(/\s+/g, '_')}_${type.toLowerCase()}_${Date.now()}.pdf`,
            size: Math.floor(Math.random() * 1000) + 100 + ' KB'
        }));
    }
    
    // Get execution summary for frontend
    getExecutionSummary() {
        const stepsByStatus = {
            pending: this.plan.filter(s => s.status === 'pending' || !s.status).length,
            in_progress: this.plan.filter(s => s.status === 'in-progress').length,
            completed: this.plan.filter(s => s.status === 'completed').length,
            failed: this.plan.filter(s => s.status === 'failed' || s.blocker).length
        };
        
        return {
            totalSteps: this.plan.length,
            stepsByStatus,
            overallProgress: this.progress,
            currentStepIndex: this.plan.findIndex(s => !s.completed),
            eta: this.calculateETA(),
            lastActivity: this.activityLog[0]?.timestamp || null,
            deliverables: this.plan.filter(s => s.status === 'completed').map(s => ({
                step: s.title,
                artifacts: s.details?.artifacts || [],
                completedAt: s.details?.completionTime || null
            }))
        };
    }
    
    addMessage(sender, content) {
        this.chatHistory.push({
            sender,
            content,
            timestamp: new Date()
        });
    }
    
    addActivityLog(message) {
        this.activityLog.unshift({
            message,
            timestamp: new Date()
        });
        if (this.activityLog.length > 10) {
            this.activityLog.pop();
        }
    }
}

class Orchestrator {
    constructor() {
        this.progress = 0;
        this.status = 'active';
        this.synthesisSteps = [
            {
                title: 'Collect inputs from all agents',
                status: 'in-progress',
                substeps: []
            },
            {
                title: 'Identify contradictions & gaps',
                status: 'queued',
                substeps: []
            },
            {
                title: 'Validate strategic logic',
                status: 'queued',
                substeps: []
            },
            {
                title: 'Generate executive summary',
                status: 'queued',
                substeps: []
            },
            {
                title: 'Create partner briefing',
                status: 'queued',
                substeps: []
            }
        ];
    }
    
    update(agents) {
        // Update synthesis steps based on agent status
        if (agents.length === 0) {
            this.progress = 0;
            return;
        }
        
        const avgProgress = agents.reduce((sum, agent) => sum + agent.progress, 0) / agents.length;
        this.progress = Math.round(avgProgress * 0.8); // Orchestrator is slightly behind agents
        
        // Update substeps
        this.synthesisSteps[0].substeps = agents.map(agent => ({
            name: agent.name,
            status: agent.progress === 100 ? 'completed' : agent.status
        }));
        
        if (avgProgress > 50) {
            this.synthesisSteps[0].status = 'completed';
            this.synthesisSteps[1].status = 'in-progress';
        }
        
        if (avgProgress > 75) {
            this.synthesisSteps[1].status = 'completed';
            this.synthesisSteps[2].status = 'in-progress';
        }
    }
    
    generateExecutiveSummary(agents) {
        return `# Market Entry Recommendation: Healthcare SaaS - APAC

## Key Findings

**Market Opportunity**
• TAM: $2.3B (growing 24% CAGR)
• SAM: $890M (addressable in first 3 years)
• SOM: $120M (realistic capture with current capabilities)

**Financial Projections**
• Base case valuation: $450M (12x ARR)
• Bull case: $680M (assumes 68% gross margin)
• Break-even: Month 18

**Regulatory Landscape**
• Low barrier: No FDA approval required for SaaS
• Key risk: Data sovereignty laws in China/Singapore
• Mitigation: Local hosting infrastructure ($2M investment)

## Recommendation
-> PROCEED with market entry
-> Prioritize Singapore launch (Q1 2025)
-> Defer China expansion until regulatory clarity (H2 2025)

CRITICAL DEPENDENCIES:
• Resolve market size discrepancy (Research vs Financial)
• Validate assumptions in debate session`;
    }
}

// Application State
const app = {
    agents: [],
    orchestrator: new Orchestrator(),
    currentView: 'dashboard',
    selectedAgent: null,
    
    init() {
        console.log('App initializing...'); // Debug
        
        try {
            this.loadState();
            console.log('State loaded'); // Debug
            
            this.attachEventListeners();
            console.log('Event listeners attached'); // Debug
            
            this.updateUI();
            console.log('UI updated'); // Debug
            
            // Start orchestrator update loop
            setInterval(() => {
                this.orchestrator.update(this.agents);
                this.updateUI();
            }, 2000);
            
            // Create sample agents if none exist
            if (this.agents.length === 0) {
                this.createSampleAgents();
            }
            
            console.log('App initialized successfully!'); // Debug
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    },
    
    createSampleAgents() {
        const sampleAgents = [
            {
                name: 'Market Research Agent',
                type: 'research',
                focus: 'Conduct comprehensive market sizing for healthcare SaaS in APAC region',
                tools: ['web-search', 'pdf-processing', 'data-apis'],
                priority: 'high'
            },
            {
                name: 'Financial Analyst',
                type: 'financial',
                focus: 'Build 3-statement model and DCF valuation for target company',
                tools: ['spreadsheet', 'code-execution'],
                priority: 'high'
            },
            {
                name: 'Healthcare Expert',
                type: 'industry',
                focus: 'Assess regulatory landscape and compliance requirements',
                tools: ['web-search', 'data-apis'],
                priority: 'medium'
            }
        ];
        
        sampleAgents.forEach(agentData => {
            const agent = new Agent(
                agentData.name,
                agentData.type,
                agentData.focus,
                agentData.tools,
                agentData.priority
            );
            this.agents.push(agent);
        });
        
        this.saveState();
    },
    
    attachEventListeners() {
        console.log('Attaching event listeners...'); // Debug
        
        // Modal controls
        const newAgentBtn = document.getElementById('newAgentBtn');
        const addAgentBtn = document.getElementById('addAgentBtn');
        const modalClose = document.getElementById('modalClose');
        const modalCancel = document.getElementById('modalCancel');
        const createAgentBtn = document.getElementById('createAgentBtn');
        
        console.log('Buttons found:', { 
            newAgentBtn: !!newAgentBtn, 
            addAgentBtn: !!addAgentBtn,
            modalClose: !!modalClose,
            modalCancel: !!modalCancel,
            createAgentBtn: !!createAgentBtn
        }); // Debug
        
        if (newAgentBtn) newAgentBtn.addEventListener('click', () => this.openModal());
        if (addAgentBtn) addAgentBtn.addEventListener('click', () => this.openModal());
        if (modalClose) modalClose.addEventListener('click', () => this.closeModal());
        if (modalCancel) modalCancel.addEventListener('click', () => this.closeModal());
        if (createAgentBtn) createAgentBtn.addEventListener('click', () => this.createAgent());
        
        // Navigation
        document.getElementById('backBtn').addEventListener('click', () => this.showView('dashboard'));
        document.getElementById('orchestratorBackBtn').addEventListener('click', () => this.showView('dashboard'));

        // Chat
        document.getElementById('chatSendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.getElementById('chatInput').value = e.target.textContent;
                this.sendMessage();
            });
        });
        
        // Modal backdrop click
        document.getElementById('agentModal').addEventListener('click', (e) => {
            if (e.target.id === 'agentModal') this.closeModal();
        });
    },
    
    openModal() {
        document.getElementById('agentModal').classList.add('active');
    },
    
    closeModal() {
        document.getElementById('agentModal').classList.remove('active');
        // Reset form
        document.getElementById('agentName').value = '';
        document.getElementById('agentFocus').value = '';
    },
    
    createAgent() {
        console.log('Create agent button clicked'); // Debug
        
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
        
        console.log('Creating agent:', { name, type, focus, priority }); // Debug
        
        const agent = new Agent(name, type, focus, tools, priority, autoSync);
        this.agents.push(agent);
        
        console.log('Agent created, total agents:', this.agents.length); // Debug
        
        this.closeModal();
        this.saveState();
        this.updateUI();
    },
    
    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById(viewName).classList.add('active');
        this.currentView = viewName;
    },
    
    openAgentDetail(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;

        this.selectedAgent = agent;
        this.renderAgentDetail(agent);
        this.showView('agentDetailView');
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

    deleteAgent(agentId) {
        // Close the dropdown menu
        const menu = document.getElementById(`menu-${agentId}`);
        if (menu) {
            menu.classList.remove('active');
        }

        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;

        const agentName = agent.name || 'this agent';
        if (!confirm(`Are you sure you want to delete ${agentName}? This action cannot be undone.`)) {
            return;
        }

        // Remove agent from array
        this.agents = this.agents.filter(a => a.id !== agentId);

        // If we're viewing this agent's detail, go back to dashboard
        if (this.selectedAgent && this.selectedAgent.id === agentId) {
            this.selectedAgent = null;
            this.showView('dashboard');
        }

        this.saveState();
        this.updateUI();
        console.log('Agent deleted, remaining agents:', this.agents.length);
    },

    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message || !this.selectedAgent) return;
        
        this.selectedAgent.addMessage('You', message);
        input.value = '';
        
        // Simulate agent response
        setTimeout(() => {
            const responses = [
                'Processing your request...',
                'I\'ve updated the analysis based on your input.',
                'That\'s a great point. I\'ll incorporate that into my research.',
                'I\'ll adjust the timeline accordingly. ETA updated.',
                'Let me check the data sources and get back to you.'
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            this.selectedAgent.addMessage('Agent', response);
            this.renderAgentDetail(this.selectedAgent);
        }, 1000);
        
        this.renderAgentDetail(this.selectedAgent);
    },
    
    renderAgentDetail(agent) {
        // Update header
        document.getElementById('detailAgentIcon').textContent = agent.getIcon();
        document.getElementById('detailAgentName').textContent = agent.name.toUpperCase();
        document.getElementById('detailProgressText').textContent = `${agent.progress}% Complete`;
        document.getElementById('detailETA').textContent = `ETA: ${agent.eta}`;
        
        const statusBadge = document.getElementById('detailStatus');
        statusBadge.textContent = agent.status.toUpperCase().replace('-', ' ');
        statusBadge.className = 'status-badge';
        if (agent.status === 'in-progress') statusBadge.classList.add('status-active');
        
        // Render plan steps
        const planSteps = document.getElementById('planSteps');
        planSteps.innerHTML = agent.plan.map((step, index) => {
            const stepStatus = step.completed ? 'completed' : (index === agent.plan.findIndex(s => !s.completed) ? 'in-progress' : 'queued');
            const icon = step.completed ? 'DONE' : (stepStatus === 'in-progress' ? 'RUN' : 'WAIT');
            
            return `
                <div class="plan-step ${stepStatus}">
                    <div class="step-header">
                        <span class="step-icon">${icon}</span>
                        <span class="step-title">${index + 1}. ${step.title}</span>
                    </div>
                    ${stepStatus === 'in-progress' && step.progress ? `
                        <div class="step-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${step.progress}%"></div>
                            </div>
                        </div>
                    ` : ''}
                    ${step.blocker ? `
                        <div class="step-blocker">ISSUE: ${step.blocker}</div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        // Render deliverable
        document.getElementById('deliverableTitle').textContent = agent.deliverable.title;
        document.getElementById('deliverablePreview').innerHTML = agent.deliverable.content.replace(/\n/g, '<br>');
        
        const dataList = document.getElementById('deliverableData');
        dataList.innerHTML = agent.deliverable.data.map(item => `<li>${item}</li>`).join('');
        
        const depsList = document.getElementById('deliverableDeps');
        depsList.innerHTML = agent.deliverable.dependencies.map(item => `<li>${item}</li>`).join('');
        
        // Render chat
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = agent.chatHistory.map(msg => `
            <div class="chat-message ${msg.sender === 'You' ? 'user' : 'agent'}">
                <div class="message-sender">${msg.sender}</div>
                <div class="message-content">${msg.content}</div>
            </div>
        `).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Render activity log
        const activityLog = document.getElementById('activityLog');
        activityLog.innerHTML = agent.activityLog.map(log => `
            <div class="activity-item">
                <span class="activity-time">[${log.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}]</span>
                ${log.message}
            </div>
        `).join('');
    },
    
    updateUI() {
        if (this.currentView === 'dashboard') {
            this.renderDashboard();
        } else if (this.currentView === 'orchestratorView') {
            this.renderOrchestratorView();
        } else if (this.currentView === 'agentDetailView' && this.selectedAgent) {
            this.renderAgentDetail(this.selectedAgent);
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
            if (agent.status === 'completed' || agent.progress === 100) {
                statusCounts.completed++;
            } else if (agent.status === 'executing' || agent.status === 'in-progress') {
                statusCounts.executing++;
            } else if (agent.status === 'draft') {
                statusCounts.draft++;
            }
        });

        document.getElementById('completedCount').textContent = statusCounts.completed;
        document.getElementById('executingCount').textContent = statusCounts.executing;
        document.getElementById('draftCount').textContent = statusCounts.draft;

        // Update orchestrator insight count
        document.getElementById('orchestratorInsightCount').textContent = this.orchestrator.insights.length;

        // Render orchestrator sections
        this.renderOrchestratorSections();

        // Update agent count
        document.getElementById('activeAgentCount').textContent = this.agents.length;
        
        // Render agent cards
        const agentsGrid = document.getElementById('agentsGrid');
        agentsGrid.innerHTML = this.agents.map(agent => {
            const statusClass = agent.status === 'blocked' ? 'blocked' : 
                              agent.progress === 100 ? 'on-track' : 
                              agent.status === 'in-progress' ? 'on-track' : 'waiting';
            const statusIcon = agent.status === 'blocked' ? '!' : 
                             agent.progress === 100 ? 'OK' : 
                             agent.status === 'in-progress' ? 'OK' : '..';
            const statusText = agent.status === 'blocked' ? '1 Blocker' : 
                             agent.progress === 100 ? 'Completed' : 
                             agent.status === 'in-progress' ? 'On Track' : 'Waiting';
            
            return `
                <div class="agent-card" onclick="app.openAgentDetail(${agent.id})">
                    <div class="agent-card-header">
                        <span class="agent-icon">${agent.getIcon()}</span>
                        <div class="agent-info">
                            <div class="agent-type">${agent.type}</div>
                            <div class="agent-name">${agent.name}</div>
                        </div>
                        <div class="agent-menu">
                            <button class="agent-menu-btn" onclick="event.stopPropagation(); app.toggleAgentMenu(event, ${agent.id})" title="More options">
                                ⋮
                            </button>
                            <div class="agent-menu-dropdown" id="menu-${agent.id}">
                                <button onclick="event.stopPropagation(); app.deleteAgent(${agent.id})">
                                    <span>🗑️</span> Delete Agent
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="agent-focus">${agent.focus}</div>
                    <div class="agent-progress">
                        <div class="progress-info">
                            <span class="progress-percentage">${agent.progress}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${agent.progress}%"></div>
                        </div>
                    </div>
                    <div class="agent-footer">
                        <span class="agent-eta">ETA: ${agent.eta}</span>
                        <span class="agent-status ${statusClass}">${statusIcon} ${statusText}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderOrchestratorSections() {
        // Render Executive Summary
        const executiveSummary = document.getElementById('executiveSummary');
        if (executiveSummary) {
            if (this.agents.length > 0) {
                const summary = this.orchestrator.generateExecutiveSummary(this.agents);
                executiveSummary.innerHTML = `<p style="margin: 0; line-height: 1.6;">${summary.replace(/\n/g, '<br>')}</p>`;
            } else {
                executiveSummary.innerHTML = '<p class="empty-state">No summary available yet.</p>';
            }
        }

        // Render Key Insights
        const keyInsightsList = document.getElementById('keyInsightsList');
        if (keyInsightsList) {
            if (this.orchestrator.insights.length > 0) {
                const insightItems = this.orchestrator.insights.map(insight => `
                    <div class="insight-item">
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 6px; font-weight: 500;">
                            ${insight.agent}
                        </div>
                        ${insight.text}
                    </div>
                `).join('');
                keyInsightsList.innerHTML = insightItems;
            } else {
                keyInsightsList.innerHTML = '<p class="empty-state">No insights reported yet.</p>';
            }
        }

        // Render Hypotheses
        const hypothesisList = document.getElementById('hypothesisList');
        if (hypothesisList) {
            hypothesisList.innerHTML = '<p class="empty-state">No hypotheses yet.</p>';
        }
    },

    renderOrchestratorView() {
        // Update header
        document.getElementById('orchestratorDetailProgress').textContent = `${this.orchestrator.progress}% Complete`;
        
        // Render synthesis steps
        const synthesisSteps = document.getElementById('synthesisSteps');
        synthesisSteps.innerHTML = this.synthesisSteps.map((step, index) => {
            const icon = step.status === 'completed' ? 'DONE' : step.status === 'in-progress' ? 'RUN' : 'WAIT';
            
            return `
                <div class="synthesis-step ${step.status}">
                    <div class="synthesis-step-title">
                        ${icon} ${index + 1}. ${step.title}
                    </div>
                    ${step.substeps.length > 0 ? `
                        <div class="synthesis-substeps">
                            ${step.substeps.map(sub => `
                                <div>${sub.status === 'completed' ? 'DONE' : 'WAIT'} ${sub.name}</div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        // Render executive summary
        const summary = this.orchestrator.generateExecutiveSummary(this.agents);
        document.getElementById('executiveSummary').innerHTML = summary.replace(/\n/g, '<br>');
        
        // Render contributions table
        const contributionsTable = document.getElementById('contributionsTable');
        contributionsTable.innerHTML = this.agents.map(agent => `
            <div class="contribution-row">
                <div class="contribution-agent">${agent.getIcon()} ${agent.name}</div>
                <div class="contribution-details">
                    ${agent.progress === 100 ? agent.deliverable.title : 
                      agent.status === 'in-progress' ? `IN PROGRESS: ${agent.deliverable.title}` : 
                      `PENDING: ${agent.deliverable.title}`}
                </div>
            </div>
        `).join('');
    },
    
    saveState() {
        // Save to localStorage (simplified - in production would use backend)
        localStorage.setItem('commandCenter_agents', JSON.stringify(this.agents.map(a => ({
            name: a.name,
            type: a.type,
            focus: a.focus,
            tools: a.tools,
            priority: a.priority
        }))));
    },
    
    loadState() {
        // Load from localStorage
        const saved = localStorage.getItem('commandCenter_agents');
        if (saved) {
            try {
                const agentData = JSON.parse(saved);
                // Don't auto-load saved agents for demo purposes
                // this.agents = agentData.map(data => new Agent(data.name, data.type, data.focus, data.tools, data.priority));
            } catch (e) {
                console.error('Error loading saved state:', e);
            }
        }
    }
};

// Expose app to window for inline event handlers
window.app = app;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.init();

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.agent-menu')) {
            document.querySelectorAll('.agent-menu-dropdown').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });
});
