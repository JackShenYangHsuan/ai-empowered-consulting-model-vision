/**
 * Agent Class
 * 
 * Represents an individual AI agent that executes tasks independently.
 * 
 * Design decisions:
 * - Each agent has its own conversation history
 * - System prompt built from: type template + focus area + shared context
 * - Executes steps asynchronously (non-blocking)
 * - Emits events for progress updates
 * - Can be paused/resumed/stopped
 * 
 * Context flow:
 * 1. Agent type → Base system prompt
 * 2. Focus area → Specific instructions
 * 3. Shared PDFs → Injected as context
 * 4. Chat history → Maintains conversation
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class Agent extends EventEmitter {
    constructor(config, contextManager, aiService) {
        super();
        
        this.id = config.id || uuidv4();
        this.name = config.name;
        this.type = config.type; // research, financial, strategy, etc.
        this.focus = config.focus;
        this.tools = config.tools || [];
        this.priority = config.priority || 'medium';
        
        // References
        this.contextManager = contextManager;
        this.aiService = aiService;
        
        // State
        this.status = 'queued'; // queued, running, paused, completed, error
        this.progress = 0;
        this.currentStep = 0;
        this.plan = []; // Will be populated by generatePlan() when called async
        this.conversationHistory = [];
        this.deliverable = null;
        this.error = null;
        
        // Execution control
        this.isRunning = false;
        this.shouldStop = false;
        
        // Approval flow (3-phase: Plan → Approval → Execute)
        this.needsApproval = true; // Always wait for user approval after showing plan
        this.approvalResolve = null;
        this.userFeedback = null;
        
        // Build system prompt
        this.systemPrompt = this.buildSystemPrompt();
        
        this.createdAt = new Date();
    }

    /**
     * Build system prompt from agent type, focus, and context
     */
    buildSystemPrompt() {
        const basePrompts = {
            research: `You are a Research Agent specialized in gathering and analyzing information. 
Your role is to conduct thorough research, synthesize findings, and provide evidence-based insights.`,
            
            financial: `You are a Financial Analysis Agent specialized in financial modeling and valuation.
Your role is to build models, analyze financials, and provide quantitative recommendations.`,
            
            strategy: `You are a Strategy Agent specialized in synthesizing insights into actionable recommendations.
Your role is to integrate findings from multiple sources and provide strategic guidance.`,
            
            industry: `You are an Industry Expert Agent with deep domain knowledge.
Your role is to provide specialized insights and identify industry-specific risks and opportunities.`,
            
            slides: `You are a Presentation Agent specialized in creating executive-ready slides.
Your role is to transform analysis into clear, compelling visual presentations.`,
            
            meeting: `You are a Meeting Preparation Agent specialized in preparing for client interactions.
Your role is to anticipate questions, prepare talking points, and assemble briefing materials.`,
            
            custom: `You are a Custom AI Agent with flexible capabilities.
Your role is defined by your specific assignment.`
        };

        const basePrompt = basePrompts[this.type] || basePrompts.custom;
        
        // Add focus area
        const focusPrompt = `\n\nYour specific focus: ${this.focus}`;
        
        // Add shared context from documents
        const sharedContext = this.contextManager.getSharedContext();
        const contextPrompt = sharedContext ? `\n\nShared context from documents:\n${sharedContext}` : '';
        
        // Add tools information
        const toolsPrompt = this.tools.length > 0 
            ? `\n\nYou have access to these tools: ${this.tools.join(', ')}` 
            : '';
        
        return `${basePrompt}${focusPrompt}${contextPrompt}${toolsPrompt}

Your output should be structured, evidence-based, and actionable. Cite sources when applicable.`;
    }

    /**
     * Generate task plan based on agent type
     */
    async generatePlan() {
        const planTemplates = {
            research: [
                'Understand research objectives and scope',
                'Identify key information sources and data needs',
                'Design research methodology and approach',
                'Gather relevant data and documents',
                'Analyze and synthesize findings',
                'Cross-reference multiple sources for validation',
                'Generate comprehensive report with evidence',
                'Quality check and peer review preparation'
            ],
            financial: [
                'Define financial analysis objectives',
                'Identify required financial data and sources',
                'Collect and verify historical financial data',
                'Normalize and clean data for analysis',
                'Build comprehensive financial models',
                'Run scenario and sensitivity analysis',
                'Generate detailed financial projections',
                'Create executive summary and visualizations',
                'Prepare recommendations and risk assessment'
            ],
            strategy: [
                'Clarify strategic objectives and constraints',
                'Review insights from other agents',
                'Identify key strategic questions to address',
                'Analyze competitive landscape and market position',
                'Develop multiple strategic options with pros/cons',
                'Evaluate trade-offs and resource requirements',
                'Conduct risk-benefit analysis for each option',
                'Synthesize recommendations with implementation roadmap',
                'Prepare executive presentation and communication plan'
            ],
            industry: [
                'Define industry analysis scope and objectives',
                'Research industry landscape and market dynamics',
                'Analyze regulatory environment and compliance requirements',
                'Identify key risks and opportunities',
                'Assess competitive dynamics and market positioning',
                'Analyze value chain and ecosystem relationships',
                'Generate insights and actionable recommendations',
                'Prepare industry brief and strategic implications'
            ]
        };

        const plan = planTemplates[this.type] || [
            'Clarify objectives and scope',
            'Gather required information and resources',
            'Perform detailed analysis',
            'Generate insights and recommendations',
            'Prepare comprehensive deliverable',
            'Quality review and finalization'
        ];

        return plan.map((title, index) => ({
            id: index,
            title,
            status: 'pending', // pending, in-progress, completed, failed
            progress: 0,
            startedAt: null,
            completedAt: null,
            details: null
        }));
    }

    /**
     * Generate clarifying questions and wait for user response
     */
    async askClarifyingQuestions() {
        const questionPrompt = `Based on your role as a ${this.type} agent focused on "${this.focus}", please generate 2-3 specific clarifying questions to better understand the task objectives and requirements. These questions should help you deliver more precise and valuable insights.

Format your response as:
1. [Question 1]
2. [Question 2]  
3. [Question 3, if applicable]

Questions should be specific, actionable, and help define scope, priorities, or required information sources.`;

        try {
            const response = await this.aiService.chat({
                systemPrompt: this.systemPrompt,
                messages: [{ role: 'user', content: questionPrompt }],
                maxTokens: 500
            });

            this.clarifyingQuestions = response;
            this.needsClarification = true;

            this.emit('clarifyingQuestions', {
                agentId: this.id,
                questions: response
            });

            return response;
        } catch (error) {
            console.error('Error generating clarifying questions:', error);
            // Fallback: proceed without questions if AI call fails
            this.needsClarification = false;
            return null;
        }
    }

    /**
     * Receive clarifying answers from user and enhance plan
     */
    async processClarifyingAnswers(answers) {
        const enhancePrompt = `Based on the user's answers to your clarifying questions:
"${answers}"

Please enhance your execution plan with specific details, priorities, or considerations based on these answers. Update the plan details for each step to reflect any insights from the user's responses.`;

        try {
            const response = await this.aiService.chat({
                systemPrompt: this.systemPrompt,
                messages: [
                    { role: 'user', content: enhancePrompt }
                ],
                maxTokens: 1000
            });

            // Parse response and update plan details
            this.enhancePlanWithDetails(response);

            this.needsClarification = false;
            
            this.emit('planEnhanced', {
                agentId: this.id,
                enhancements: response
            });

        } catch (error) {
            console.error('Error processing clarifying answers:', error);
            // Proceed with original plan if enhancement fails
        }
    }

    /**
     * Enhance plan with AI-generated details
     */
    enhancePlanWithDetails(details) {
        // Add details to plan steps
        this.plan.forEach((step, index) => {
            // Simple enhancement - in real implementation, parse AI response more intelligently
            step.details = `Enhanced based on user input: ${details.slice(0, 100)}${details.length > 100 ? '...' : ''}`;
        });
    }

    /**
     * Wait for clarification answers
     */
    async waitForClarification() {
        return new Promise((resolve) => {
            this.clarificationResolve = resolve;
            
            // Timeout after 5 minutes if no response
            setTimeout(() => {
                if (this.needsClarification) {
                    console.log(`Agent ${this.name} proceeding without clarification (timeout)`);
                    this.needsClarification = false;
                    resolve();
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Receive clarification answers from external source
     */
    receiveClarificationAnswers(answers) {
        this.clarifyingAnswers = answers;
        if (this.clarificationResolve) {
            this.clarificationResolve();
            this.clarificationResolve = null;
        }
    }

    /**
     * Wait for user approval to proceed with execution
     */
    async waitForApproval() {
        return new Promise((resolve) => {
            this.approvalResolve = resolve;
            
            // Timeout after 10 minutes if no response
            setTimeout(() => {
                if (this.approvalResolve) {
                    console.log(`Agent ${this.name}: Approval timeout, auto-proceeding`);
                    this.approvalResolve();
                    this.approvalResolve = null;
                }
            }, 10 * 60 * 1000); // 10 minutes
        });
    }

    /**
     * Receive approval from user with optional feedback
     */
    receiveApproval(feedback = null) {
        this.userFeedback = feedback;
        if (this.approvalResolve) {
            this.approvalResolve();
            this.approvalResolve = null;
        }
    }

    /**
     * Start agent execution
     */
    async start() {
        if (this.isRunning) {
            console.log(`Agent ${this.name} is already running`);
            return;
        }

        this.isRunning = true;
        this.shouldStop = false;

        try {
            // PHASE 1: Generate the work plan
            this.status = 'planning';
            this.emit('started', { agentId: this.id, name: this.name, status: 'planning' });
            
            console.log(`Agent ${this.name}: PHASE 1 - Generating work plan...`);
            this.plan = await this.generatePlan();
            
            // PHASE 2: Wait for user approval
            this.status = 'awaiting_approval';
            this.emit('planGenerated', {
                agentId: this.id,
                name: this.name,
                plan: this.plan,
                phase: 'awaiting_approval',
                message: 'Work plan ready. Please review and approve to proceed.'
            });
            
            console.log(`Agent ${this.name}: PHASE 2 - Waiting for user approval...`);
            await this.waitForApproval();
            
            console.log(`Agent ${this.name}: PHASE 3 - Approved! Starting execution...`);
            
            // PHASE 3: Execute the plan
            this.status = 'running';
            this.emit('approved', { agentId: this.id, name: this.name });

            // Execute each step in the plan
            for (let i = 0; i < this.plan.length; i++) {
                if (this.shouldStop) {
                    this.status = 'paused';
                    break;
                }

                this.currentStep = i;
                await this.executeStep(i);
                
                // Update overall progress
                this.progress = Math.round(((i + 1) / this.plan.length) * 100);
                this.emit('progress', {
                    agentId: this.id,
                    progress: this.progress,
                    currentStep: this.currentStep
                });
            }

            if (!this.shouldStop) {
                // PHASE 4: Generate brief executive summary
                console.log(`Agent ${this.name}: PHASE 4 - Generating executive summary...`);
                await this.generateDeliverable();
                this.status = 'completed';
                this.emit('completed', {
                    agentId: this.id,
                    deliverable: this.deliverable,
                    phase: 'completed'
                });
            }

        } catch (error) {
            this.status = 'error';
            this.error = error.message;
            this.emit('error', {
                agentId: this.id,
                error: error.message
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Execute a single step in the plan
     */
    async executeStep(stepIndex) {
        const step = this.plan[stepIndex];
        step.status = 'in-progress';
        step.startedAt = new Date();

        this.emit('stepStarted', {
            agentId: this.id,
            stepIndex,
            stepTitle: step.title
        });

        try {
            // Build prompt for this step
            const stepPrompt = `Task: ${step.title}\n\nPlease complete this task based on your role and focus area. Provide detailed, actionable output.`;

            // Call AI service
            const response = await this.aiService.chat({
                systemPrompt: this.systemPrompt,
                messages: [...this.conversationHistory, { role: 'user', content: stepPrompt }],
                maxTokens: 2000
            });

            // Store response
            this.conversationHistory.push(
                { role: 'user', content: stepPrompt },
                { role: 'assistant', content: response }
            );

            step.status = 'completed';
            step.progress = 100;
            step.completedAt = new Date();

            this.emit('stepCompleted', {
                agentId: this.id,
                stepIndex,
                output: response
            });

            // Simulate work (in real implementation, this is where tools are used)
            await this.sleep(2000);

        } catch (error) {
            step.status = 'failed';
            step.error = error.message;
            throw error;
        }
    }

    /**
     * Generate final deliverable (PHASE 4: Brief executive summary)
     */
    async generateDeliverable() {
        const deliverablePrompt = `Based on all the work you've completed, create a BRIEF executive summary with:

**Format Requirements:**
- 5-8 concise bullet points only
- Each bullet: 1-2 sentences maximum
- Focus on key findings and actionable insights
- Be direct and specific, avoid verbose explanations
- Use data/numbers when available

The summary should be ready for C-level review.`;

        const deliverable = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: [...this.conversationHistory, { role: 'user', content: deliverablePrompt }],
            maxTokens: 800  // Reduced from 3000 to keep it brief
        });

        this.deliverable = {
            title: `${this.name} - Executive Summary`,
            content: deliverable,
            agentName: this.name,
            agentType: this.type,
            generatedAt: new Date(),
            dataPoints: this.extractDataPoints(deliverable)
        };

        return this.deliverable;
    }

    /**
     * Extract key data points from deliverable for orchestrator
     */
    extractDataPoints(content) {
        // Simple extraction - in production, use more sophisticated NLP
        const lines = content.split('\n');
        const dataPoints = [];

        lines.forEach(line => {
            // Look for bullet points, numbers, key findings
            if (line.match(/^[-•*]\s/) || line.match(/\d+[.)]/) || line.includes(':')) {
                dataPoints.push(line.trim());
            }
        });

        return dataPoints.slice(0, 10); // Top 10 key points
    }

    /**
     * Handle chat message from user
     */
    async chat(message) {
        this.conversationHistory.push({ role: 'user', content: message });

        const response = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: this.conversationHistory,
            maxTokens: 1000
        });

        this.conversationHistory.push({ role: 'assistant', content: response });

        this.emit('chatResponse', {
            agentId: this.id,
            message,
            response
        });

        return response;
    }

    /**
     * Stop agent execution
     */
    stop() {
        this.shouldStop = true;
        this.status = 'paused';
        this.emit('stopped', { agentId: this.id });
    }

    /**
     * Get current state
     */
    getState() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            focus: this.focus,
            status: this.status,
            progress: this.progress,
            currentStep: this.currentStep,
            plan: this.plan,
            deliverable: this.deliverable,
            error: this.error,
            conversationHistory: this.conversationHistory.slice(-20), // Last 20 messages
            createdAt: this.createdAt
        };
    }

    /**
     * Helper: Sleep for simulation
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Agent;
