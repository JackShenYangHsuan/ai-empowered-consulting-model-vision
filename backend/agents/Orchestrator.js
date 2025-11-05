/**
 * Orchestrator Agent
 * 
 * Central synthesis agent that collects outputs from all agents
 * and generates consolidated executive summaries.
 * 
 * Design decisions:
 * - Receives deliverables from all agents
 * - Detects contradictions between agent outputs
 * - Synthesizes findings into executive summary
 * - Coordinates debate sessions (future)
 * - Provides partner-ready output
 * 
 * Synthesis strategy:
 * 1. Collect all agent deliverables
 * 2. Identify key themes and findings
 * 3. Cross-reference data points
 * 4. Detect contradictions
 * 5. Generate consolidated summary
 * 6. Highlight critical dependencies
 */

const { EventEmitter } = require('events');

class Orchestrator extends EventEmitter {
    constructor(aiService, settings = {}) {
        super();

        this.aiService = aiService;
        this.settings = settings;
        this.deliverables = new Map(); // agentId -> deliverable
        this.synthesisStatus = 'idle'; // idle, synthesizing, completed
        this.executiveSummary = null;
        this.contradictions = [];
        this.keyFindings = [];
        this.lastSynthesisAt = null;
    }

    /**
     * Receive deliverable from agent
     */
    receiveDeliverable(agentId, agentName, deliverable) {
        console.log(`Orchestrator received deliverable from ${agentName}`);
        
        this.deliverables.set(agentId, {
            agentId,
            agentName,
            deliverable,
            receivedAt: new Date()
        });

        // Auto-synthesize if enough agents have reported
        if (this.deliverables.size >= 2 && this.synthesisStatus === 'idle') {
            setTimeout(() => this.synthesize(), 2000);
        }

        this.emit('deliverableReceived', {
            agentId,
            agentName,
            deliverableCount: this.deliverables.size
        });
    }

    /**
     * Synthesize all deliverables into executive summary
     */
    async synthesize() {
        if (this.deliverables.size === 0) {
            console.log('No deliverables to synthesize');
            return null;
        }

        console.log(`Synthesizing ${this.deliverables.size} agent deliverables...`);
        
        this.synthesisStatus = 'synthesizing';
        this.emit('synthesisStarted', { deliverableCount: this.deliverables.size });

        try {
            // 1. Collect all findings
            const allDeliverables = Array.from(this.deliverables.values());
            
            // 2. Build synthesis prompt
            const synthesisPrompt = this.buildSynthesisPrompt(allDeliverables);
            
            // 3. Generate executive summary
            const summary = await this.aiService.chat({
                systemPrompt: this.getSystemPrompt(),
                messages: [{ role: 'user', content: synthesisPrompt }],
                maxTokens: 3000,
                temperature: 0.5 // Lower temperature for more focused output
            });

            // 4. Extract contradictions
            await this.detectContradictions(allDeliverables);

            // 5. Extract key findings
            this.extractKeyFindings(allDeliverables);

            this.executiveSummary = {
                content: summary,
                agentCount: this.deliverables.size,
                agents: allDeliverables.map(d => ({
                    id: d.agentId,
                    name: d.agentName
                })),
                contradictions: this.contradictions,
                keyFindings: this.keyFindings,
                generatedAt: new Date()
            };

            this.synthesisStatus = 'completed';
            this.lastSynthesisAt = new Date();

            this.emit('synthesisUpdated', {
                summary: this.executiveSummary,
                status: 'completed'
            });

            console.log('Synthesis completed successfully');
            
            return this.executiveSummary;

        } catch (error) {
            console.error('Synthesis error:', error);
            this.synthesisStatus = 'error';
            this.emit('synthesisError', { error: error.message });
            throw error;
        }
    }

    /**
     * Get system prompt for orchestrator
     */
    getSystemPrompt() {
        // Use custom prompt if provided in settings
        if (this.settings.executiveSummaryPrompt && this.settings.executiveSummaryPrompt.trim()) {
            return this.settings.executiveSummaryPrompt;
        }

        // Default prompt
        return `You are the Central Orchestrator Agent for a consulting engagement.

Your role is to synthesize findings from multiple specialized agents (Research, Financial, Strategy, Industry Experts, etc.) into a cohesive executive summary.

Your output should:
1. Integrate findings from all agents
2. Identify key themes and insights
3. Highlight critical recommendations
4. Flag any contradictions or gaps
5. Be structured and executive-ready
6. Focus on actionable insights

Format your summary with clear sections:
- Executive Overview
- Key Findings
- Financial Implications
- Strategic Recommendations
- Critical Dependencies
- Next Steps`;
    }

    /**
     * Build synthesis prompt from all deliverables
     */
    buildSynthesisPrompt(deliverables) {
        let prompt = `Please synthesize the following findings from ${deliverables.length} specialized agents:\n\n`;

        deliverables.forEach((item, index) => {
            prompt += `--- AGENT ${index + 1}: ${item.agentName} ---\n`;
            prompt += `${item.deliverable.content}\n\n`;
        });

        prompt += `\nPlease provide a comprehensive executive summary that integrates all these findings into actionable recommendations.`;

        return prompt;
    }

    /**
     * Detect contradictions between agent outputs
     */
    async detectContradictions(deliverables) {
        if (deliverables.length < 2) {
            this.contradictions = [];
            return;
        }

        try {
            const contradictionPrompt = `Analyze these agent findings and identify any contradictions or conflicting data points:\n\n`;
            
            let findings = '';
            deliverables.forEach((item, index) => {
                // Extract key data points
                const dataPoints = item.deliverable.dataPoints || [];
                findings += `${item.agentName}: ${dataPoints.join('; ')}\n\n`;
            });

            const response = await this.aiService.chat({
                systemPrompt: 'You are analyzing agent outputs for contradictions.',
                messages: [{ role: 'user', content: contradictionPrompt + findings }],
                maxTokens: 500
            });

            // Parse contradictions (simple version)
            const lines = response.split('\n').filter(line => line.trim());
            this.contradictions = lines.slice(0, 5); // Top 5 contradictions

        } catch (error) {
            console.error('Error detecting contradictions:', error);
            this.contradictions = [];
        }
    }

    /**
     * Extract key findings from all deliverables
     */
    extractKeyFindings(deliverables) {
        const findings = [];

        deliverables.forEach(item => {
            if (item.deliverable.dataPoints) {
                item.deliverable.dataPoints.forEach(point => {
                    findings.push({
                        agent: item.agentName,
                        finding: point
                    });
                });
            }
        });

        // Take top 10 most significant
        this.keyFindings = findings.slice(0, 10);
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            status: this.synthesisStatus,
            deliverableCount: this.deliverables.size,
            executiveSummary: this.executiveSummary,
            contradictions: this.contradictions,
            keyFindings: this.keyFindings,
            lastSynthesisAt: this.lastSynthesisAt,
            agents: Array.from(this.deliverables.values()).map(d => ({
                agentId: d.agentId,
                agentName: d.agentName,
                receivedAt: d.receivedAt
            }))
        };
    }

    /**
     * Clear all deliverables (reset)
     */
    reset() {
        this.deliverables.clear();
        this.synthesisStatus = 'idle';
        this.executiveSummary = null;
        this.contradictions = [];
        this.keyFindings = [];
        this.lastSynthesisAt = null;

        this.emit('reset');
    }

    /**
     * Schedule debate between agents (future feature)
     */
    scheduleDebate(agentIds, topic) {
        console.log(`Debate scheduled: ${topic} between agents: ${agentIds.join(', ')}`);
        // Future implementation
        this.emit('debateScheduled', { agentIds, topic });
    }
}

module.exports = Orchestrator;
