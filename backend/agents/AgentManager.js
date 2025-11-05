/**
 * Agent Manager
 * 
 * Central coordinator for all agents.
 * 
 * Design decisions:
 * - Maintains registry of all agents
 * - Routes messages between agents
 * - Collects deliverables for orchestrator
 * - Emits events for WebSocket broadcasting
 * - Manages agent lifecycle
 * 
 * Key responsibilities:
 * 1. Create/start/stop agents
 * 2. Monitor agent health
 * 3. Coordinate with orchestrator
 * 4. Handle inter-agent communication
 * 5. Broadcast updates to frontend
 */

const { EventEmitter } = require('events');
const Agent = require('./Agent');
const Orchestrator = require('./Orchestrator');
const fs = require('fs');
const path = require('path');

class AgentManager extends EventEmitter {
    constructor(contextManager, aiService) {
        super();
        
        this.agents = new Map(); // agentId -> Agent instance
        this.contextManager = contextManager;
        this.aiService = aiService;
        
        // Create orchestrator
        this.orchestrator = new Orchestrator(aiService);
        
        // Setup orchestrator event listeners
        this.orchestrator.on('synthesisUpdated', (data) => {
            this.emit('orchestratorUpdate', data);
        });

        // Handle step 1 completion and navigation triggers
        this.on('step1Completed', (data) => {
            console.log(`Step 1 completed for agent ${data.agentId}, saving state and preparing navigation`);
            
            // Forward to WebSocket clients for UI updates
            this.emit('step1CompletedForUI', {
                ...data,
                message: `${data.agentData.name} completed Step 1 - continuing to Step 2`
            });
        });

        this.on('navigateToExecution', (data) => {
            console.log(`Triggering navigation to execution page for agent ${data.agentId}`);
            
            // Forward to WebSocket clients to trigger page navigation
            this.emit('triggerPageNavigation', {
                agentId: data.agentId,
                targetPage: 'execution',
                currentStep: data.currentStep
            });
        });
        
        this.loadAgentConfigs();
    }

    /**
     * Load saved agent configurations
     */
    loadAgentConfigs() {
        const configPath = path.join(__dirname, '../storage/agents.json');
        
        try {
            if (fs.existsSync(configPath)) {
                const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                console.log(`Loaded ${data.agents?.length || 0} agent configurations`);
                // Note: We load configs but don't auto-start agents
            }
        } catch (error) {
            console.error('Error loading agent configs:', error);
        }
    }

    /**
     * Save agent configurations
     */
    saveAgentConfigs() {
        const configPath = path.join(__dirname, '../storage/agents.json');
        
        try {
            const configs = Array.from(this.agents.values()).map(agent => ({
                id: agent.id,
                name: agent.name,
                type: agent.type,
                focus: agent.focus,
                tools: agent.tools,
                priority: agent.priority
            }));
            
            fs.writeFileSync(configPath, JSON.stringify({ agents: configs }, null, 2));
        } catch (error) {
            console.error('Error saving agent configs:', error);
        }
    }

    /**
     * Create new agent
     */
    createAgent(config) {
        const agent = new Agent(config, this.contextManager, this.aiService);
        
        // Setup event listeners for this agent
        this.setupAgentListeners(agent);
        
        this.agents.set(agent.id, agent);
        this.saveAgentConfigs();
        
        this.emit('agentCreated', {
            agentId: agent.id,
            name: agent.name,
            type: agent.type,
            state: agent.getState()
        });
        
        console.log(`Agent created: ${agent.name} (${agent.id})`);
        
        return agent;
    }

    /**
     * Setup event listeners for agent
     */
    setupAgentListeners(agent) {
        agent.on('started', (data) => {
            this.emit('agentStarted', data);
        });

        agent.on('phaseStarted', (data) => {
            this.emit('agentPhaseStarted', data);
        });

        agent.on('planGenerated', (data) => {
            this.emit('agentPlanGenerated', data);
        });

        agent.on('clarifyingQuestions', (data) => {
            this.emit('agentClarifyingQuestions', data);
        });

        agent.on('awaitingApproval', (data) => {
            this.emit('agentAwaitingApproval', data);
        });

        agent.on('approved', (data) => {
            this.emit('agentApproved', data);
        });

        agent.on('progress', (data) => {
            this.emit('agentProgress', data);
        });

        agent.on('stepStarted', (data) => {
            this.emit('agentStepStarted', data);
        });

        agent.on('stepCompleted', (data) => {
            this.emit('agentStepCompleted', data);
        });

        agent.on('completed', (data) => {
            this.emit('agentCompleted', data);
            
            // Send deliverable to orchestrator
            this.orchestrator.receiveDeliverable(agent.id, agent.name, data.deliverable);
        });

        agent.on('error', (data) => {
            this.emit('agentError', data);
        });

        agent.on('chatResponse', (data) => {
            this.emit('agentChatResponse', data);
        });

        agent.on('stopped', (data) => {
            this.emit('agentStopped', data);
        });

        agent.on('clarifyingQuestions', (data) => {
            this.emit('agentClarifyingQuestions', data);
        });

        agent.on('awaitingClarification', (data) => {
            this.emit('agentAwaitingClarification', data);
        });

        agent.on('planEnhanced', (data) => {
            this.emit('agentPlanEnhanced', data);
        });

        agent.on('insightsReported', (data) => {
            this.emit('agentInsightsReported', data);
        });
    }

    /**
     * Start agent execution
     */
    async startAgent(agentId) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        if (!this.aiService.isConfigured()) {
            throw new Error('AI service not configured. Please set API keys in settings.');
        }

        console.log(`Starting agent: ${agent.name}`);
        await agent.start();
        
        return agent;
    }

    /**
     * Stop agent execution
     */
    stopAgent(agentId) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        console.log(`Stopping agent: ${agent.name}`);
        agent.stop();
        
        return agent;
    }

    /**
     * Get agent by ID
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }

    /**
     * Get all agents
     */
    getAllAgents() {
        return Array.from(this.agents.values()).map(agent => agent.getState());
    }

    /**
     * Delete agent
     */
    deleteAgent(agentId) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        // Stop agent if running
        if (agent.isRunning) {
            agent.stop();
        }

        this.agents.delete(agentId);
        this.saveAgentConfigs();
        
        this.emit('agentDeleted', { agentId });
        
        console.log(`Agent deleted: ${agent.name}`);
        
        return true;
    }

    /**
     * Send chat message to agent
     */
    async chatWithAgent(agentId, message) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        const response = await agent.chat(message);
        
        return {
            agentId,
            message,
            response,
            timestamp: new Date()
        };
    }

    /**
     * Submit clarification answers to agent
     */
    submitClarificationAnswers(agentId, answers) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            throw new Error('Agent not found');
        }

        if (!agent.receiveClarificationAnswers) {
            throw new Error('Agent does not support clarification');
        }

        agent.receiveClarificationAnswers(answers);
        
        return {
            agentId,
            answers,
            status: 'submitted',
            timestamp: new Date()
        };
    }

    /**
     * Get agent status
     */
    getAgentStatus(agentId) {
        const agent = this.agents.get(agentId);
        
        if (!agent) {
            return null;
        }

        return agent.getState();
    }

    /**
     * Get orchestrator status
     */
    getOrchestratorStatus() {
        return this.orchestrator.getStatus();
    }

    /**
     * Trigger orchestrator synthesis
     */
    triggerSynthesis() {
        return this.orchestrator.synthesize();
    }

    /**
     * Get active agents count
     */
    getActiveAgentsCount() {
        return Array.from(this.agents.values())
            .filter(agent => agent.status === 'running' || agent.status === 'completed')
            .length;
    }

    /**
     * Broadcast message to all agents
     */
    broadcastToAllAgents(message) {
        const results = [];
        
        for (const [agentId, agent] of this.agents) {
            try {
                results.push({
                    agentId,
                    success: true
                });
            } catch (error) {
                results.push({
                    agentId,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }
}

module.exports = AgentManager;
