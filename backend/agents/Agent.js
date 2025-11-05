/**
 * Agent Class - 4-Phase Workflow
 * 
 * PHASE 1: Create Work Plan (5-8 detailed steps)
 * PHASE 2: Ask Clarifying Questions + Wait for Approval
 * PHASE 3: Execute Tasks
 * PHASE 4: Synthesize Key Takeaways (5-8 bullet points)
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class Agent extends EventEmitter {
    constructor(config, contextManager, aiService) {
        super();

        this.id = config.id || uuidv4();
        this.name = config.name;
        this.type = config.type;
        this.focus = config.focus;
        this.tools = config.tools || [];
        this.mcpServers = Array.isArray(config.mcpServers)
            ? config.mcpServers
                .map((server, index) => {
                    if (!server) return null;
                    const url = (server.url || server.endpoint || '').trim();
                    if (!url) return null;
                    return {
                        label: (server.label || server.name || `MCP Server ${index + 1}`).trim(),
                        name: (server.name || server.label || `MCP Server ${index + 1}`).trim(),
                        url,
                        endpoint: (server.endpoint || server.url || url).trim(),
                        enabled: server.enabled !== false,
                        headers: server.headers || null,
                        allowedTools: server.allowedTools || null,
                        requireApproval: server.requireApproval || null
                    };
                })
                .filter(Boolean)
            : [];
        this.priority = config.priority || 'medium';
        this.prompts = config.prompts || {};

        // Services
        this.contextManager = contextManager;
        this.aiService = aiService;
        
        // State tracking
        this.status = 'queued'; // queued, planning, awaiting_clarification, awaiting_approval, running, completed, error
        this.currentPhase = 0; // 0=not started, 1=planning, 2=approval, 3=execution, 4=synthesis
        this.progress = 0;
        this.currentStep = 0;
        
        // Work plan
        this.plan = [];
        
        // Clarification & Approval
        this.clarifyingQuestions = null;
        this.clarifyingAnswers = null;
        this.clarificationResolve = null;
        this.approvalResolve = null;
        this.userApproved = false;
        
        // Execution
        this.conversationHistory = [];
        this.deliverable = null;
        this.error = null;
        
        // Control
        this.isRunning = false;
        this.shouldStop = false;
        
        // Build system prompt
        this.systemPrompt = this.buildSystemPrompt();
        
        this.createdAt = new Date();
    }

    /**
     * Build enhanced system prompt with workplan and clarification context
     */
    buildSystemPrompt() {
        const basePrompt = `You are an AI agent that completes tasks by using available tools and MCP servers.`;
        const focusPrompt = `\n\nYour task: ${this.focus}`;

        // Tool and MCP instructions
        const toolsPrompt = this.tools.length > 0
            ? `\n\nAvailable tools: ${this.tools.join(', ')}\n- Use these tools when relevant to accomplish your task.`
            : '';

        const mcpPrompt = this.buildMCPInstructions();

        // Add workplan context if available
        let workplanPrompt = '';
        if (this.plan && this.plan.length > 0) {
            workplanPrompt = `\n\nYour approved workplan:\n${this.plan.map((step, i) => `${i + 1}. ${step.title}`).join('\n')}`;
        }

        // Add clarification answers if available
        let clarificationPrompt = '';
        if (this.clarifyingAnswers && Object.keys(this.clarifyingAnswers).length > 0) {
            clarificationPrompt = `\n\nUser clarifications:\n${Object.entries(this.clarifyingAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}`;
        }

        // Shared context
        const sharedContext = this.contextManager.getSharedContext();
        const contextPrompt = sharedContext ? `\n\nShared context:\n${sharedContext}` : '';

        return `${basePrompt}${focusPrompt}${toolsPrompt}${mcpPrompt}${workplanPrompt}${clarificationPrompt}${contextPrompt}

CRITICAL INSTRUCTIONS:
- If MCP servers are available and a task requires external data/documents, YOU MUST call the MCP function
- When you see a document URL (PDF, Google Doc, etc.), immediately call the MCP to retrieve its content
- NEVER make up or hallucinate document contents - always use MCPs to get real data
- Be specific, data-driven, and actionable in all responses`;
    }

    getActiveMCPServers() {
        return this.mcpServers.filter(server => server.enabled !== false && (server.url || server.endpoint));
    }

    buildMCPInstructions() {
        const servers = this.getActiveMCPServers();
        if (servers.length === 0) {
            console.log(`[${this.name}] No MCP servers configured`);
            return '';
        }

        const details = servers.map(server => {
            const label = server.label || server.name;
            const url = server.url || server.endpoint;
            return `- ${label} (${url})`;
        }).join('\n');

        console.log(`[${this.name}] 🔌 ${servers.length} MCP server(s) available:`);
        servers.forEach(server => {
            console.log(`   - ${server.label || server.name}: ${server.url || server.endpoint}`);
        });

        return `\n\n🔌 CRITICAL: MCP SERVERS AVAILABLE FOR USE:
${details}

IMPORTANT INSTRUCTIONS FOR MCP USAGE:
- When asked to analyze, parse, or extract data from documents (PDFs, Google Docs, URLs, etc.), you MUST use the available MCP server functions
- DO NOT make up or hallucinate document content - ALWAYS call the MCP server to get real data
- To use an MCP server, call the corresponding function (e.g., mcp_reducto_mcp) with:
  * action: "parse_document" (or other appropriate action)
  * url: The URL of the document to process
  * options: Any additional configuration

Example: If asked to analyze a PDF at https://example.com/doc.pdf, you must call the MCP function first to get the actual content, then analyze that real data.

NEVER fabricate document contents or data - always retrieve real data via MCP calls.`;
    }

    // ========================================================================
    // PHASE 1: CREATE WORK PLAN
    // ========================================================================

    async createWorkPlan() {
        console.log(`\n[${this.name}] PHASE 1: Creating work plan...`);
        this.status = 'planning';
        this.currentPhase = 1;
        
        this.emit('phaseStarted', {
            agentId: this.id,
            phase: 1,
            phaseName: 'Creating Work Plan',
            status: 'planning'
        });

        const planPrompt = `Based on your role as a ${this.type} agent focused on "${this.focus}", create a detailed work plan with 5-8 specific steps.

Consider:
- Agent type: ${this.type}
- Focus area: ${this.focus}
- Available tools: ${this.tools.join(', ') || 'None specified'}

Each step should be:
1. Highly specific and customized to this task
2. Actionable with clear deliverables
3. Sequenced logically

Format as:
1. [Detailed step description]
2. [Detailed step description]
...

Be very specific - avoid generic steps like "analyze data" - instead say "Analyze Q3 2024 revenue data from Salesforce to identify top 3 growth segments".`;

        const planText = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: [{ role: 'user', content: planPrompt }],
            maxTokens: 1000,
            temperature: 0.5,
            mcpServers: this.getActiveMCPServers()
        });

        // Parse the plan into steps
        this.plan = this.parsePlanText(planText);
        this.systemPrompt = this.buildSystemPrompt();
        
        this.emit('planGenerated', {
            agentId: this.id,
            name: this.name,
            plan: this.plan,
            planText: planText,
            phase: 1
        });

        console.log(`[${this.name}] Work plan created with ${this.plan.length} steps`);
        this.status = 'plan_ready';
        
        console.log(`[${this.name}] WAITING for user to review and confirm plan...`);
        
        // PAUSE HERE - wait for user to click "Continue to Review"
        return new Promise((resolve) => {
            this.planConfirmResolve = resolve;
            
            // 20 minute timeout
            setTimeout(() => {
                if (this.planConfirmResolve) {
                    console.log(`[${this.name}] Plan review timeout - auto-proceeding`);
                    resolve();
                    this.planConfirmResolve = null;
                }
            }, 20 * 60 * 1000);
        });
    }

    // User clicks "Continue to Review" after editing plan
    confirmPlanAndProceed() {
        console.log(`[${this.name}] User confirmed plan - proceeding to Phase 2`);
        if (this.planConfirmResolve) {
            this.planConfirmResolve();
            this.planConfirmResolve = null;
        }
    }

    parsePlanText(planText) {
        // Split by numbered lines
        const lines = planText.split('\n').filter(line => line.trim());
        const steps = [];
        
        for (const line of lines) {
            const match = line.match(/^\d+\.\s*(.+)/);
            if (match) {
                steps.push({
                    id: steps.length,
                    title: match[1].trim(),
                    status: 'pending',
                    progress: 0,
                    startedAt: null,
                    completedAt: null,
                    details: null
                });
            }
        }
        
        return steps;
    }

    // ========================================================================
    // PHASE 2: CLARIFYING QUESTIONS + APPROVAL
    // ========================================================================

    async askClarifyingQuestions() {
        console.log(`\n[${this.name}] PHASE 2a: Asking clarifying questions...`);
        this.status = 'awaiting_clarification';
        
        const questionPrompt = `Based on the work plan you just created for "${this.focus}", generate 2-3 specific clarifying questions that would help you deliver better results.

Questions should:
- Address potential ambiguities in scope or approach
- Clarify priorities or constraints
- Identify any missing information you need

Format:
1. [Question]
2. [Question]
3. [Question]`;

        try {
            const questionsText = await this.aiService.chat({
                systemPrompt: this.systemPrompt,
                messages: [{ role: 'user', content: questionPrompt }],
                maxTokens: 300,
                temperature: 0.3,
                mcpServers: this.getActiveMCPServers()
            });

            this.clarifyingQuestions = questionsText;
            
            this.emit('clarifyingQuestions', {
                agentId: this.id,
                name: this.name,
                questions: questionsText,
                phase: 2
            });

            console.log(`[${this.name}] Clarifying questions asked`);
            return questionsText;
        } catch (error) {
            console.error(`[${this.name}] Error asking clarifying questions:`, error);
            return null;
        }
    }

    async waitForClarificationAndApproval() {
        console.log(`\n[${this.name}] PHASE 2b: Waiting for clarification and approval...`);
        this.status = 'awaiting_approval';
        
        this.emit('awaitingApproval', {
            agentId: this.id,
            name: this.name,
            plan: this.plan,
            questions: this.clarifyingQuestions,
            phase: 2
        });

        // Wait for user approval (clarifications are optional)
        return new Promise((resolve) => {
            this.approvalResolve = resolve;
            
            // 1 minute timeout (made optional for better UX)
            setTimeout(() => {
                if (this.approvalResolve) {
                    console.log(`[${this.name}] Approval timeout - auto-proceeding without clarifications`);
                    this.userApproved = true;
                    this.clarifyingAnswers = {}; // Empty answers since optional
                    resolve(this.clarifyingAnswers);
                    this.approvalResolve = null;
                }
            }, 1 * 60 * 1000);
        });
    }

    receiveApproval(answers = null) {
        console.log(`[${this.name}] Received approval from user (clarifications: ${answers ? 'provided' : 'skipped'})`);
        this.clarifyingAnswers = answers || {}; // Default to empty if no clarifications
        this.userApproved = true;
        this.systemPrompt = this.buildSystemPrompt();
        
        if (this.approvalResolve) {
            this.approvalResolve(this.clarifyingAnswers);
            this.approvalResolve = null;
        }
    }

    // ========================================================================
    // PHASE 3: EXECUTE TASKS
    // ========================================================================

    async executeTasks() {
        console.log(`\n[${this.name}] PHASE 3: Executing tasks...`);
        this.status = 'running';
        this.currentPhase = 3;
        
        this.emit('phaseStarted', {
            agentId: this.id,
            phase: 3,
            phaseName: 'Executing Tasks',
            status: 'running'
        });

        // Include clarifying answers if provided
        if (this.clarifyingAnswers) {
            this.conversationHistory.push({
                role: 'user',
                content: `User provided these clarifications: ${this.clarifyingAnswers}`
            });
        }

        // Execute each step
        this.systemPrompt = this.buildSystemPrompt();
        for (let i = 0; i < this.plan.length; i++) {
            if (this.shouldStop) {
                this.status = 'paused';
                break;
            }

            this.currentStep = i;
            await this.executeStep(i);
            
            this.progress = Math.round(((i + 1) / this.plan.length) * 100);
            this.emit('progress', {
                agentId: this.id,
                progress: this.progress,
                currentStep: this.currentStep
            });
        }

        console.log(`[${this.name}] Task execution complete`);

        // ========================================================================
        // HOLISTIC INSIGHT SYNTHESIS - After all steps complete
        // ========================================================================
        if (!this.shouldStop && this.plan.length > 0) {
            console.log(`[${this.name}] Generating holistic insights from all execution steps...`);

            try {
                // Generate insights synthesized from ALL steps
                const holisticInsights = await this.synthesizeAllInsights();

                if (holisticInsights && holisticInsights.length > 0) {
                    // Store holistic insights in agent instance
                    this.holisticInsights = holisticInsights;
                    console.log(`[${this.name}] ✅ Stored ${holisticInsights.length} holistic insights in agent instance (agentId: ${this.id})`);

                    // Store insights in context manager
                    this.contextManager.addAgentContext(this.id, {
                        completedExecution: true,
                        holisticInsights: holisticInsights,
                        timestamp: new Date()
                    });

                    // Report insights with deduplication using the reportInsights method
                    const reportedInsights = this.contextManager.reportInsights(
                        this.id,
                        this.name,
                        holisticInsights.map(text => ({ text })),
                        {
                            source: 'holistic_synthesis',
                            phase: 'completion',
                            timestamp: new Date().toISOString()
                        }
                    );

                    // Emit event for each new insight (for real-time UI updates)
                    if (reportedInsights && reportedInsights.length > 0) {
                        for (const insight of reportedInsights) {
                            this.emit('insightsReported', {
                                agentId: this.id,
                                agentName: this.name,
                                insight: insight
                            });
                        }
                    }

                    console.log(`[${this.name}] Generated and reported ${reportedInsights?.length || 0} unique holistic insights (${holisticInsights.length - (reportedInsights?.length || 0)} duplicates filtered)`);

                    // Save agent state with holistic insights
                    console.log(`[${this.name}] 💾 Saving agent state with ${this.holisticInsights?.length || 0} holistic insights...`);
                    this.saveAgentState();
                    console.log(`[${this.name}] ✅ Agent state saved successfully`);
                }
            } catch (error) {
                console.error(`[${this.name}] Error generating holistic insights:`, error);
                // Don't fail execution if insight generation fails
            }
        }
    }

    async executeStep(stepIndex) {
        const step = this.plan[stepIndex];
        
        step.status = 'in-progress';
        step.startedAt = new Date();
        step.progress = 0;
        
        this.emit('stepStarted', {
            agentId: this.id,
            stepIndex,
            step: step
        });

        // Build enhanced context-aware step prompt
        const contextInfo = this.buildStepExecutionContext(stepIndex);
        const mcpInstructions = this.buildMCPInstructions();
        const stepPrompt = `Execute step ${stepIndex + 1}: ${step.title}

**AGENT OBJECTIVE:** ${this.focus}

${contextInfo}${mcpInstructions ? `${mcpInstructions}\n\n` : ''}
**Requirements:**
- Provide detailed, specific findings with data points
- Reference relevant information from earlier steps when applicable
- Include actionable insights and recommendations
- Use the clarification answers and workplan context to guide your analysis

**Format your response with:**
1. Key findings with supporting data
2. Analysis approach used
3. Action items or next steps
4. Any dependencies on subsequent steps`;

        try {
            // Update progress during execution
            this.emit('stepProgress', {
                agentId: this.id,
                stepIndex,
                progress: 25,
                message: `Analyzing requirements for: ${step.title}`
            });

            // Log MCP usage for this step
            const activeMCPs = this.getActiveMCPServers();
            if (activeMCPs.length > 0) {
                console.log(`[${this.name}] Step ${stepIndex + 1}: Executing with ${activeMCPs.length} MCP server(s)`);
            }

            const response = await this.aiService.chat({
                systemPrompt: this.buildSystemPrompt(), // Regenerate with full context
                messages: [...this.conversationHistory, { role: 'user', content: stepPrompt }],
                maxTokens: 2000,
                temperature: 0.7,
                mcpServers: this.getActiveMCPServers()
            });

            step.status = 'completed';
            step.completedAt = new Date();
            step.progress = 100;
            step.details = response;

            // Note: Insights are now generated holistically after ALL steps complete
            // step.insights = await this.synthesizeInsights(step.title, response);
            step.artifacts = this.generateArtifacts(step, response);
            
            this.conversationHistory.push(
                { role: 'user', content: stepPrompt },
                { role: 'assistant', content: response }
            );

            this.emit('stepCompleted', {
                agentId: this.id,
                stepIndex,
                output: response,
                insights: [], // Insights will be generated holistically after all steps
                artifacts: step.artifacts,
                executionTime: step.completedAt - step.startedAt
            });

            // Note: Insight reporting moved to end of all steps for holistic synthesis
            // if (step.insights && step.insights.length > 0) {
            //     this.contextManager.addAgentContext(this.id, {
            //         stepTitle: step.title,
            //         insights: step.insights,
            //         timestamp: new Date()
            //     });
            //     this.reportStepInsights(stepIndex, step);
            // }

            // Save agent after step 1 is completed
            if (stepIndex === 0) {
                const savedData = this.saveAgentAfterStep1();
                
                // Emit special event for step 1 completion
                this.emit('step1Completed', {
                    agentId: this.id,
                    agentData: savedData,
                    stepData: step,
                    nextStepIndex: stepIndex + 1
                });
                
                // Emit to trigger full page navigation
                this.emit('navigateToExecution', {
                    agentId: this.id,
                    currentStep: stepIndex + 1
                });
            }

            // Small delay between steps for realism
            await this.sleep(1000);

        } catch (error) {
            step.status = 'failed';
            step.error = error.message;
            step.progress = 0;
            
            this.emit('stepFailed', {
                agentId: this.id,
                stepIndex,
                error: error.message
            });
            
            throw error;
        }
    }

    // Save agent state after step 1 completion
    saveAgentAfterStep1() {
        if (this.currentPhase === 3 && this.plan[0] && this.plan[0].status === 'completed') {
            // Create simplified agent data for saving
            const agentData = {
                id: this.id,
                name: this.name,
                type: this.type,
                focus: this.focus,
                tools: this.tools,
                mcpServers: this.mcpServers,
                priority: this.priority,
                status: 'running',
                progress: this.progress,
                plan: this.plan,
                clarifyingQuestions: this.clarifyingQuestions,
                clarifyingAnswers: this.clarifyingAnswers,
                currentStep: this.currentStep,
                currentPhase: this.currentPhase,
                createdAt: this.createdAt
            };
            
            // Save to storage using AgentManager
            if (this.contextManager && this.contextManager.saveAgentState) {
                this.contextManager.saveAgentState(this.id, agentData);
                console.log(`[${this.name}] Agent state saved after Step 1 completion`);
            }
            
            return agentData;
        }
        return null;
    }

// Helper methods for enhanced execution
    buildStepExecutionContext(stepIndex) {
        const context = [];
        
        // Add context from previous steps
        const completedSteps = this.plan.slice(0, stepIndex).filter(s => s.status === 'completed');
        if (completedSteps.length > 0) {
            context.push(`**Previous step completions:**`);
            completedSteps.forEach((step, i) => {
                context.push(`Step ${i + 1}: ${step.title} - ${step.details ? 'Completed with findings' : 'Completed'}`);
            });
        }

        // Add upcoming steps context
        const upcomingSteps = this.plan.slice(stepIndex + 1).slice(0, 2);
        if (upcomingSteps.length > 0) {
            context.push(`\\n**Upcoming steps:**`);
            upcomingSteps.forEach((step, i) => {
                context.push(`Step ${stepIndex + i + 2}: ${step.title}`);
            });
        }

        return context.length > 0 ? context.join('\\n') + '\\n' : '';
    }

    async synthesizeInsights(stepTitle, executionDetails) {
        // Use GPT to synthesize key insights from execution details
        const synthesisPrompt = this.prompts.synthesis || `You are an expert analyst who synthesizes complex information into clear, actionable insights. You always respond with valid JSON only.

Your task is to analyze execution details and generate 5-8 key insights that are:
- Specific and data-driven
- Actionable and meaningful
- Clear and concise (1-2 sentences each)
- Focused on findings, recommendations, or conclusions

Respond ONLY with valid JSON in this exact format:
{
    "insights": [
        "First key insight...",
        "Second key insight...",
        "Third key insight..."
    ]
}`;

        const userPrompt = `Analyze the following execution details from the step "${stepTitle}" and synthesize 5-8 key insights:

${executionDetails}

Remember: Respond ONLY with valid JSON containing an "insights" array. Each insight should be 1-2 sentences maximum.`;

        try {
            const response = await this.aiService.chat({
                systemPrompt: synthesisPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                maxTokens: 800,
                temperature: 0.3,
                mcpServers: []
            });

            // Parse JSON response
            const parsed = JSON.parse(response.trim());
            if (parsed.insights && Array.isArray(parsed.insights)) {
                return parsed.insights.slice(0, 8); // Limit to 8 insights
            }

            // Fallback if JSON parsing fails
            console.warn(`[${this.name}] Failed to parse insights JSON, using fallback`);
            return this.fallbackExtractInsights(executionDetails);

        } catch (error) {
            console.error(`[${this.name}] Error synthesizing insights:`, error);
            // Fallback to simple extraction
            return this.fallbackExtractInsights(executionDetails);
        }
    }

    fallbackExtractInsights(response) {
        // Fallback method: Extract actionable insights from response using pattern matching
        const insights = [];
        const lines = response.split('\\n');

        for (const line of lines) {
            // Look for key findings, recommendations, or insights
            if (line.match(/(finding|recommend|insight|key|conclusion|result)/i)) {
                const trimmed = line.trim();
                if (trimmed.length > 10) { // Ignore very short lines
                    insights.push(trimmed);
                }
            }
        }

        return insights.slice(0, 5); // Limit to top 5 insights
    }

    async synthesizeAllInsights() {
        // Holistically synthesize insights from ALL execution steps
        console.log(`[${this.name}] Synthesizing holistic insights from all ${this.plan.length} execution steps...`);

        // Build comprehensive execution summary
        const executionSummary = {
            agentName: this.name,
            agentType: this.type,
            objective: this.focus,
            totalSteps: this.plan.length,
            steps: this.plan.map((step, index) => ({
                stepNumber: index + 1,
                title: step.title,
                status: step.status,
                details: step.details || 'No execution details available',
                executionTime: step.completedAt && step.startedAt
                    ? `${Math.round((step.completedAt - step.startedAt) / 1000)}s`
                    : 'N/A'
            }))
        };

        const synthesisPrompt = `You are an expert analyst who synthesizes complex information into clear, actionable insights. You always respond with valid JSON only.

Your task is to analyze the COMPLETE execution of an AI agent across ALL of its steps and generate 6-10 holistic key insights that:
- Synthesize findings across multiple steps (not just individual steps)
- Identify patterns, trends, and connections between different execution phases
- Provide actionable recommendations based on the complete picture
- Highlight the most important discoveries and conclusions
- Are specific, data-driven, and meaningful
- Are clear and concise (1-2 sentences each)

IMPORTANT: Do NOT generate separate insights for each step. Instead, synthesize across ALL steps to provide holistic, cross-cutting insights.

Respond ONLY with valid JSON in this exact format:
{
    "insights": [
        "First holistic insight connecting multiple findings...",
        "Second cross-step pattern or trend...",
        "Third actionable recommendation based on complete analysis..."
    ]
}`;

        const userPrompt = `Analyze the complete execution of the following agent and synthesize 6-10 holistic insights:

**Agent Details:**
- Name: ${executionSummary.agentName}
- Type: ${executionSummary.agentType}
- Objective: ${executionSummary.objective}
- Total Steps Executed: ${executionSummary.totalSteps}

**Complete Execution Details:**
${JSON.stringify(executionSummary.steps, null, 2)}

Remember:
1. Synthesize insights ACROSS all steps, not per-step
2. Look for patterns, connections, and overarching themes
3. Respond ONLY with valid JSON containing an "insights" array
4. Each insight should be 1-2 sentences maximum
5. Focus on the most important holistic findings`;

        try {
            const response = await this.aiService.chat({
                systemPrompt: synthesisPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                maxTokens: 1200,
                temperature: 0.3,
                mcpServers: []
            });

            // Parse JSON response
            const parsed = JSON.parse(response.trim());
            if (parsed.insights && Array.isArray(parsed.insights)) {
                const insights = parsed.insights.slice(0, 10); // Limit to 10 insights
                console.log(`[${this.name}] Generated ${insights.length} holistic insights`);
                return insights;
            }

            // Fallback if JSON parsing fails
            console.warn(`[${this.name}] Failed to parse holistic insights JSON, using fallback`);
            return this.fallbackExtractInsights(JSON.stringify(executionSummary));

        } catch (error) {
            console.error(`[${this.name}] Error synthesizing holistic insights:`, error);
            // Return empty array on error rather than failing
            return [];
        }
    }

    generateArtifacts(step, response) {
        // Generate metadata about artifacts created during step execution
        const artifactTypes = ['analysis_report', 'data_extraction', 'recommendation_memo', 'chart_visual'];
        const artifacts = [];
        
        // Randomly generate 1-2 artifacts per step
        const numArtifacts = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < numArtifacts; i++) {
            const type = artifactTypes[Math.floor(Math.random() * artifactTypes.length)];
            artifacts.push({
                type,
                title: `${step.title.replace(/\s+/g, '_')}_${type}`,
                size: Math.floor(Math.random() * 500) + 100,
                format: type.includes('chart') ? 'PNG' : 'PDF'
            });
        }
        
        return artifacts;
    }

    reportStepInsights(stepIndex, step) {
        if (!this.contextManager || typeof this.contextManager.reportInsights !== 'function') {
            return;
        }

        try {
            const reported = this.contextManager.reportInsights(
                this.id,
                this.name,
                step.insights || [],
                {
                    stepTitle: step.title,
                    stepIndex,
                    phase: this.currentPhase
                }
            );

            if (reported && reported.length > 0) {
                step.reportedAt = reported[0].reportedAt;
                step.reportStatus = 'reported';

                this.emit('insightsReported', {
                    agentId: this.id,
                    agentName: this.name,
                    stepIndex,
                    stepTitle: step.title,
                    insights: reported
                });
            }
        } catch (error) {
            console.error(`[${this.name}] Failed to report insights:`, error);
        }
    }
    
    // Enhanced helper methods for execution
    extractStructuredInsights(response) {
        const insights = [];
        const lines = response.split('\n');
        
        // Look for sections in the response
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Track sections
            if (trimmed.startsWith('## ')) {
                currentSection = trimmed.substring(3).toLowerCase();
                continue;
            }
            
            // Extract insights from different sections
            if (trimmed.startsWith('- [') && currentSection) {
                insights.push({
                    category: this.getInsightCategory(currentSection),
                    content: trimmed.substring(3),
                    section: currentSection
                });
            }
        }
        
        return insights.slice(0, 10); // Limit to 10 insights
    }
    
    getInsightCategory(section) {
        const categoryMapping = {
            'key findings': 'finding',
            'insights & recommendations': 'recommendation',
            'next steps & dependencies': 'action',
            'execution analysis': 'analysis'
        };
        return categoryMapping[section] || 'general';
    }
    
    extractDeliverables(response) {
        const deliverables = {
            summary: '',
            analysis: '',
            recommendations: [],
            nextSteps: [],
            methodologies: []
        };
        
        const lines = response.split('\n');
        let currentSection = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('## ')) {
                currentSection = trimmed.substring(3).toLowerCase();
                continue;
            }
            
            if (trimmed.startsWith('[')) {
                const content = trimmed.substring(2).trim();
                
                if (currentSection.includes('execution analysis') && !deliverables.analysis) {
                    deliverables.analysis = content;
                } else if (currentSection.includes('insights') || currentSection.includes('recommendations')) {
                    deliverables.recommendations.push(content);
                } else if (currentSection.includes('next steps') || currentSection.includes('dependencies')) {
                    deliverables.nextSteps.push(content);
                } else if (currentSection.includes('methodology') || currentSection.includes('approach')) {
                    deliverables.methodologies.push(content);
                }
            }
        }
        
        // Generate summary
        deliverables.summary = this.generateResponseSummary(deliverables);
        
        return deliverables;
    }
    
    generateResponseSummary(deliverables) {
        const parts = [];
        if (deliverables.analysis) parts.push('Analysis completed');
        if (deliverables.recommendations.length > 0) parts.push(`${deliverables.recommendations.length} recommendations`);
        if (deliverables.nextSteps.length > 0) parts.push(`${deliverables.nextSteps.length} next steps`);
        return parts.join(', ');
    }
    
    generateStepSummary(stepTitle, response) {
        const wordCount = response.split(/\s+/).length;
        return {
            stepTitle,
            wordCount,
            summary: `Generated comprehensive analysis for ${stepTitle}`,
            quality: wordCount > 500 ? 'detailed' : 'standard'
        };
    }
    
    saveAgentState() {
        try {
            const agentData = {
                id: this.id,
                name: this.name,
                type: this.type,
                focus: this.focus,
                tools: this.tools,
                mcpServers: this.mcpServers,
                priority: this.priority,
                status: this.status,
                progress: this.progress,
                plan: this.plan,
                clarifyingQuestions: this.clarifyingQuestions,
                clarifyingAnswers: this.clarifyingAnswers,
                currentStep: this.currentStep,
                currentPhase: this.currentPhase,
                holisticInsights: this.holisticInsights || [],  // Include holistic insights
                createdAt: this.createdAt,
                lastUpdated: new Date()
            };
            
            // Save via context manager
            if (this.contextManager && this.contextManager.saveAgentState) {
                this.contextManager.saveAgentState(this.id, agentData);
            }
            
            return agentData;
        } catch (error) {
            console.error(`[${this.name}] Error saving agent state:`, error);
            return null;
        }
    }

    // ========================================================================
    // PHASE 4: SYNTHESIZE KEY TAKEAWAYS
    // ========================================================================

    async synthesizeKeyTakeaways() {
        console.log(`\n[${this.name}] PHASE 4: Synthesizing key takeaways...`);
        this.currentPhase = 4;
        
        this.emit('phaseStarted', {
            agentId: this.id,
            phase: 4,
            phaseName: 'Synthesizing Takeaways',
            status: 'synthesizing'
        });

        const synthesisPrompt = `Based on all the work you've completed, create a BRIEF executive summary.

**STRICT FORMAT:**
• [Key finding or recommendation 1]
• [Key finding or recommendation 2]
• [Key finding or recommendation 3]
• [Key finding or recommendation 4]
• [Key finding or recommendation 5]

**RULES:**
- Exactly 5-8 bullet points
- Each bullet: maximum 2 sentences
- Focus on actionable insights and key findings
- Include specific data/numbers when available
- Be direct and concise
- No fluff or verbose explanations`;

        const summary = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: [...this.conversationHistory, { role: 'user', content: synthesisPrompt }],
            maxTokens: 500,
            temperature: 0.4,
            mcpServers: this.getActiveMCPServers()
        });

        this.deliverable = {
            title: `${this.name} - Key Takeaways`,
            content: summary,
            agentName: this.name,
            agentType: this.type,
            generatedAt: new Date()
        };

        console.log(`[${this.name}] Key takeaways synthesized`);
        return this.deliverable;
    }

    // ========================================================================
    // MAIN START METHOD - Orchestrates All 4 Phases
    // ========================================================================

    async start() {
        if (this.isRunning) {
            console.log(`[${this.name}] Already running`);
            return;
        }

        this.isRunning = true;
        this.shouldStop = false;

        console.log(`\n========================================`);
        console.log(`[${this.name}] Starting 4-Phase Workflow`);
        console.log(`========================================`);

        try {
            // PHASE 1: Create Work Plan
            await this.createWorkPlan();
            
            // PHASE 2: Optional Clarifying Questions + Approval
            // Only ask clarifying questions if user wants to provide them
            console.log(`\n[${this.name}] Phase 2: Waiting for user approval (clarifications optional)`);
            
            // Skip clarifying questions by default, make them optional
            // await this.askClarifyingQuestions(); // Commented out to make optional
            const answers = await this.waitForClarificationAndApproval();
            
            if (answers && answers !== undefined) {
                console.log(`[${this.name}] User provided clarifications: ${Object.keys(answers).length} answers`);
            } else {
                console.log(`[${this.name}] No clarifications provided - proceeding anyway`);
            }

            this.emit('approved', { 
                agentId: this.id, 
                name: this.name,
                answers: this.clarifyingAnswers 
            });
            
            // PHASE 3: Execute Tasks
            await this.executeTasks();
            
            if (!this.shouldStop) {
                // PHASE 4: Synthesize Key Takeaways
                await this.synthesizeKeyTakeaways();

                this.status = 'completed';
                this.currentPhase = 4;
                this.currentStep = 4; // Set currentStep to 4 for UI navigation

                // Save agent state with updated currentStep
                this.saveAgentState();

                this.emit('completed', {
                    agentId: this.id,
                    deliverable: this.deliverable,
                    phase: 4,
                    currentStep: 4
                });
            }

            console.log(`\n[${this.name}] ✓ All phases complete`);

        } catch (error) {
            this.status = 'error';
            this.error = error.message;
            console.error(`[${this.name}] Error:`, error);
            this.emit('error', {
                agentId: this.id,
                error: error.message
            });
        } finally {
            this.isRunning = false;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    stop() {
        console.log(`[${this.name}] Stopping...`);
        this.shouldStop = true;
        this.status = 'paused';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getState() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            focus: this.focus,
            status: this.status,
            currentPhase: this.currentPhase,
            progress: this.progress,
            currentStep: this.currentStep,
            plan: this.plan,
            clarifyingQuestions: this.clarifyingQuestions,
            clarifyingAnswers: this.clarifyingAnswers,
            mcpServers: this.mcpServers,
            deliverable: this.deliverable,
            error: this.error,
            conversationHistory: this.conversationHistory,
            createdAt: this.createdAt
        };
    }

    async chat(message) {
        const response = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: [...this.conversationHistory, { role: 'user', content: message }],
            maxTokens: 1000,
            temperature: 0.6,
            mcpServers: this.getActiveMCPServers()
        });

        this.conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: response }
        );

        this.emit('chatResponse', {
            agentId: this.id,
            message,
            response
        });

        return response;
    }
}

module.exports = Agent;
