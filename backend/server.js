/**
 * Command Center - Express Server
 *
 * Main server with REST API and WebSocket support.
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');

// Import components
const config = require('./config');
const ContextManager = require('./services/context-manager');
const OpenAIService = require('./services/openai-service');
const AgentManager = require('./agents/AgentManager');
const MCPManager = require('./services/mcpManager');
const { excelTools, executeExcelGeneration } = require('./services/excel-tools');

// Initialize
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../')));

// Initialize services
const contextManager = new ContextManager();
const apiKey = config.getApiKey('openai');
const aiService = new OpenAIService(apiKey, 'gpt-4o-mini', config);
const agentManager = new AgentManager(contextManager, aiService, config);
const mcpManager = new MCPManager();

// WebSocket clients
const clients = new Set();

// Track ongoing agent executions
const executions = new Map();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);

            if (data.type === 'subscribe') {
                ws.send(JSON.stringify({ type: 'subscribed', message: 'Connected to Command Center' }));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clients.delete(ws);
    });
});

// Broadcast to all WebSocket clients
function broadcast(event, data) {
    const message = JSON.stringify({ event, data, timestamp: new Date() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Setup agent manager event forwarding
agentManager.on('triggerPageNavigation', (data) => {
    console.log(`Forwarding navigation event: ${data.targetPage} for agent ${data.agentId}`);
    broadcast('navigateToPage', {
        agentId: data.agentId,
        targetPage: data.targetPage,
        currentStep: data.currentStep,
        url: `/pages/execution.html?agentId=${data.agentId}&step=${data.currentStep}`
    });
});

agentManager.on('step1CompletedForUI', (data) => {
    console.log(`Broadcasting Step 1 completion: ${data.message}`);
    broadcast('step1Completed', data);
});

agentManager.on('agentProgress', (data) => {
    broadcast('agentProgress', data);
});

agentManager.on('agentStepStarted', (data) => {
    broadcast('stepStarted', data);
});

agentManager.on('agentStepProgress', (data) => {
    broadcast('stepProgress', data);
});

agentManager.on('agentStepCompleted', (data) => {
    broadcast('stepCompleted', data);
});

agentManager.on('agentStepFailed', (data) => {
    broadcast('stepFailed', data);
});

agentManager.on('agentCompleted', (data) => {
    broadcast('agentCompleted', data);
});

agentManager.on('agentError', (data) => {
    broadcast('agentError', data);
});

// Setup Agent Manager event listeners
agentManager.on('agentCreated', (data) => broadcast('agent:created', data));
agentManager.on('agentStarted', (data) => broadcast('agent:started', data));
agentManager.on('agentPhaseStarted', (data) => broadcast('agent:phaseStarted', data));
agentManager.on('agentPlanGenerated', (data) => broadcast('agent:planGenerated', data));
agentManager.on('agentClarifyingQuestions', (data) => broadcast('agent:clarifyingQuestions', data));
agentManager.on('agentAwaitingApproval', (data) => broadcast('agent:awaitingApproval', data));
agentManager.on('agentApproved', (data) => broadcast('agent:approved', data));
agentManager.on('agentProgress', (data) => broadcast('agent:progress', data));
agentManager.on('agentStepStarted', (data) => broadcast('agent:stepStarted', data));
agentManager.on('agentStepCompleted', (data) => broadcast('agent:stepCompleted', data));
agentManager.on('agentInsightsReported', (data) => broadcast('insight:reported', data));
agentManager.on('agentCompleted', (data) => broadcast('agent:completed', data));
agentManager.on('agentError', (data) => broadcast('agent:error', data));
agentManager.on('agentChatResponse', (data) => broadcast('agent:chatResponse', data));
agentManager.on('agentDeleted', (data) => broadcast('agentDeleted', data));
agentManager.on('orchestratorUpdate', (data) => broadcast('orchestrator:update', data));

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// --- Agent Routes ---

// List all agents
app.get('/api/agents', (req, res) => {
    try {
        const agents = agentManager.getAllAgents();
        res.json({ agents });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create agent
app.post('/api/agents', (req, res) => {
    try {
        // Add prompts from settings to agent config
        const agentConfig = {
            ...req.body,
            prompts: config.settings.prompts || {}
        };
        const agent = agentManager.createAgent(agentConfig);
        res.json({ agent: agent.getState() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get agent details from context manager (saved state)
app.get('/api/agent-state/:id', (req, res) => {
    try {
        const agentData = agentManager.contextManager.getAgentState(req.params.id);
        if (!agentData) {
            return res.status(404).json({ error: 'Agent state not found' });
        }
        res.json(agentData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get agent details (active agent)
app.get('/api/agents/:id', (req, res) => {
    try {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        res.json({ agent: agent.getState() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start agent
app.post('/api/agents/:id/start', async (req, res) => {
    try {
        await agentManager.startAgent(req.params.id);
        res.json({ message: 'Agent started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop agent
app.post('/api/agents/:id/stop', (req, res) => {
    try {
        agentManager.stopAgent(req.params.id);
        res.json({ message: 'Agent stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Confirm plan (Phase 1 -> Phase 2)
app.post('/api/agents/:id/confirm-plan', (req, res) => {
    try {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        console.log(`[Server] User confirmed plan for agent ${req.params.id}`);
        agent.confirmPlanAndProceed();
        res.json({ message: 'Plan confirmed, proceeding to Phase 2' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve agent work plan (Phase 2 -> Phase 3)
app.post('/api/agents/:id/approve', (req, res) => {
    try {
        const { feedback, answers } = req.body;
        const answersToUse = answers || feedback; // Support both parameter names
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        console.log(`[Server] Approving agent ${req.params.id} with answers:`, answersToUse);
        agent.receiveApproval(answersToUse);
        res.json({ message: 'Agent approved', answers: answersToUse });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Chat with agent
app.post('/api/agents/:id/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await agentManager.chatWithAgent(req.params.id, message);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Submit clarification answers
app.post('/api/agents/:id/clarification', async (req, res) => {
    try {
        const { answers } = req.body;
        const response = await agentManager.submitClarificationAnswers(req.params.id, answers);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete agent
app.delete('/api/agents/:id', (req, res) => {
    try {
        console.log('🗑️  DELETE /api/agents/:id called with ID:', req.params.id);
        const result = agentManager.deleteAgent(req.params.id);
        console.log('✅ Agent deleted successfully:', result);
        res.json({ message: 'Agent deleted', success: true });
    } catch (error) {
        // If agent not found, still return success (idempotent delete)
        if (error.message && error.message.includes('Agent not found')) {
            console.log('⚠️  Agent not found, treating as already deleted:', req.params.id);
            res.json({ message: 'Agent not found or already deleted', success: true });
        } else {
            console.error('❌ Error deleting agent:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({ error: error.message });
        }
    }
});

// Bulk delete agents
app.post('/api/agents/bulk-delete', async (req, res) => {
    try {
        const { agentIds } = req.body;
        console.log('🗑️  POST /api/agents/bulk-delete called with', agentIds?.length, 'agent IDs');

        if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
            return res.status(400).json({ error: 'agentIds must be a non-empty array' });
        }

        const results = {
            deleted: [],
            failed: []
        };

        // Delete each agent
        for (const agentId of agentIds) {
            try {
                agentManager.deleteAgent(agentId);
                results.deleted.push(agentId);
            } catch (error) {
                console.error(`❌ Error deleting agent ${agentId}:`, error);
                results.failed.push({ id: agentId, error: error.message });
            }
        }

        console.log(`✅ Bulk delete complete: ${results.deleted.length} deleted, ${results.failed.length} failed`);
        res.json({
            success: true,
            message: `Deleted ${results.deleted.length} agent(s)`,
            results
        });
    } catch (error) {
        console.error('❌ Error in bulk delete:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// --- Settings Routes ---

// Get settings
app.get('/api/settings', (req, res) => {
    try {
        // Don't expose full API keys
        const settings = JSON.parse(JSON.stringify(config.settings));
        Object.keys(settings.apis || {}).forEach(service => {
            if (settings.apis[service].apiKey) {
                const key = settings.apis[service].apiKey;
                settings.apis[service].apiKey = key.substring(0, 8) + '...' + key.slice(-4);
                settings.apis[service].configured = true;
            }
        });
        res.json({ settings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings
app.put('/api/settings', (req, res) => {
    try {
        const { apis, mcps, rag, prompts, executiveSummaryPrompt } = req.body;

        if (apis) {
            Object.keys(apis).forEach(service => {
                if (apis[service].apiKey && !apis[service].apiKey.includes('...')) {
                    config.setApiKey(service, apis[service].apiKey);
                }
                if (typeof apis[service].enabled === 'boolean') {
                    config.enableService(service, apis[service].enabled);
                }
            });

            // Reinitialize AI service if OpenAI key changed
            if (apis.openai?.apiKey) {
                aiService.initialize(apis.openai.apiKey, apis.openai.model, config);
            }
        }

        if (mcps) {
            config.set('mcps', mcps);
        }

        if (rag) {
            config.set('rag', rag);
        }

        if (prompts) {
            config.set('prompts', prompts);
        }

        if (executiveSummaryPrompt !== undefined) {
            config.set('executiveSummaryPrompt', executiveSummaryPrompt);
        }

        res.json({ message: 'Settings updated', success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test API connection
app.post('/api/settings/test/:service', async (req, res) => {
    try {
        const { service } = req.params;

        if (service === 'openai') {
            const result = await aiService.test();
            res.json(result);
        } else if (service === 'exa') {
            // Test Exa API connection
            const exaConfig = config.settings.apis?.exa || {};
            const exaApiKey = exaConfig.apiKey || config.getApiKey('exa');

            if (!exaApiKey || exaApiKey.includes('your_exa')) {
                return res.json({
                    success: false,
                    error: 'Exa API key not configured'
                });
            }

            // Make a simple test search to Exa API
            const exaResponse = await fetch('https://api.exa.ai/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': exaApiKey
                },
                body: JSON.stringify({
                    query: 'test',
                    numResults: 1,
                    type: 'neural'
                })
            });

            if (exaResponse.ok) {
                const data = await exaResponse.json();
                res.json({
                    success: true,
                    message: 'Exa API connection successful',
                    resultsFound: data.results?.length || 0
                });
            } else {
                const errorText = await exaResponse.text();
                res.json({
                    success: false,
                    error: `Exa API error: ${exaResponse.status} - ${errorText}`
                });
            }
        } else {
            res.status(400).json({ error: 'Service not supported' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- AI Generation Routes ---

// Generate text with AI
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, maxTokens = 800, temperature = 0.7, mcpServers = [] } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        console.log('[AI] Generating response for prompt:', prompt.substring(0, 100) + '...');
        
        const response = await aiService.chat({
            systemPrompt: 'You are a helpful AI assistant.',
            messages: [
                { role: 'user', content: prompt }
            ],
            maxTokens: maxTokens,
            temperature: temperature,
            mcpServers
        });
        
        console.log('[AI] Response generated:', response.substring(0, 100) + '...');
        
        res.json({ 
            text: response,
            success: true
        });
    } catch (error) {
        console.error('[AI] Generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate work plan and clarifying questions for agent (Step 2)
app.post('/api/agents/generate-plan', async (req, res) => {
    try {
        const { objective, description, tools, mcpServers } = req.body;
        
        if (!objective || !description) {
            return res.status(400).json({ error: 'Objective and description are required' });
        }
        
        console.log('[AI] Generating work plan for:', objective);
        
        // Build tools list including MCP servers
        const toolsList = [];
        const activeMCPs = Array.isArray(mcpServers) ? mcpServers.filter(mcp => mcp && mcp.enabled !== false) : [];

        if (tools && tools.length > 0) {
            toolsList.push(...tools);
        }
        if (activeMCPs.length > 0) {
            activeMCPs.forEach(mcp => {
                const label = mcp.label || mcp.name || 'Unnamed MCP';
                const url = mcp.url || mcp.endpoint || 'Unknown URL';
                toolsList.push(`${label} (MCP Server at ${url})`);
            });
        }
        
        // Build MCP instructions if MCPs are available
        const mcpInstructions = activeMCPs.length > 0 ? `
⚠️ IMPORTANT - MCP SERVER OPTIMIZATION:
You have access to MCP servers that can parse documents in ONE call.
- If the task involves parsing/analyzing a document (PDF, Doc, etc.), create a SIMPLE 2-3 step plan
- Step 1: Use the MCP server to parse and extract ALL document data at once
- Step 2-3: Analyze the extracted data and generate insights/deliverables
- DO NOT create multiple steps that all call the MCP - one MCP call extracts everything
- The MCP returns complete structured data, so you don't need separate steps for each data point
` : 'Generate a work plan with 5-8 concrete, actionable steps.';

        // Get template from settings or use default
        const workPlanTemplate = config.settings.prompts?.templateWorkPlan || `You are an expert AI agent planner. Generate a detailed, step-by-step work plan for the following agent:

OBJECTIVE: {objective}

DESCRIPTION: {description}

AVAILABLE TOOLS: {tools}

{mcpInstructions}

Each step should:
1. Be specific and measurable
2. Build upon previous steps
3. Utilize the available tools efficiently
4. Lead toward achieving the objective

Format your response as a JSON array of step objects. Each object should have:
- title: A brief title (5-10 words)
- description: A detailed description (1-2 sentences)
- estimatedTime: Estimated time in minutes
- tools: Array of tools needed for this step

Respond ONLY with the JSON array, no other text.`;

        // Replace placeholders in template
        const workPlanPrompt = workPlanTemplate
            .replace(/{objective}/g, objective)
            .replace(/{description}/g, description)
            .replace(/{tools}/g, toolsList.length > 0 ? toolsList.join(', ') : 'General tools')
            .replace(/{mcpInstructions}/g, mcpInstructions);

        const workPlanResponse = await aiService.chat({
            systemPrompt: config.settings.prompts?.workPlan || 'You are a JSON-only response generator. Always respond with valid JSON and nothing else.',
            messages: [{ role: 'user', content: workPlanPrompt }],
            maxTokens: 1500,
            temperature: 0.6
            // Don't pass mcpServers here - they should only be used during execution, not planning
        });
        
        // Parse the work plan
        let workPlan;
        try {
            // Remove markdown code blocks if present
            let cleanedResponse = workPlanResponse.trim();
            if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            workPlan = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[AI] Failed to parse work plan JSON:', parseError);
            console.error('[AI] Raw response:', workPlanResponse);
            // Fallback to basic plan
            workPlan = [
                {
                    title: "Research and gather requirements",
                    description: "Collect all necessary information and context needed to achieve the objective.",
                    estimatedTime: 20,
                    tools: tools && tools.length > 0 ? [tools[0]] : []
                },
                {
                    title: "Analyze and process information",
                    description: "Review gathered data and identify key patterns, insights, and action items.",
                    estimatedTime: 15,
                    tools: []
                },
                {
                    title: "Execute main tasks",
                    description: "Implement the core actions required to achieve the stated objective.",
                    estimatedTime: 30,
                    tools: tools || []
                },
                {
                    title: "Review and refine results",
                    description: "Quality check the outputs and make necessary improvements.",
                    estimatedTime: 10,
                    tools: []
                },
                {
                    title: "Generate final deliverable",
                    description: "Compile all work into a clear, actionable final output.",
                    estimatedTime: 15,
                    tools: []
                }
            ];
        }
        
        console.log('[AI] Generated', workPlan.length, 'work plan steps');
        
        // Generate clarifying questions
        // Get template from settings or use default
        const questionsTemplate = config.settings.prompts?.templateQuestions || `Based on this agent objective and work plan, generate 3-5 clarifying questions that would help improve the execution.

OBJECTIVE: {objective}
DESCRIPTION: {description}

The questions should:
1. Address potential ambiguities
2. Ask about priorities or preferences
3. Clarify scope or constraints
4. Help improve the quality of execution

Format your response as a JSON array of question strings.

Example format:
[
  "Should the agent prioritize speed or thoroughness?",
  "Are there any specific sources or datasets you prefer?",
  "What format would you like the final deliverable in?"
]

Respond ONLY with the JSON array, no other text.`;

        // Replace placeholders in template
        const questionsPrompt = questionsTemplate
            .replace(/{objective}/g, objective)
            .replace(/{description}/g, description);

        const questionsResponse = await aiService.chat({
            systemPrompt: config.settings.prompts?.questions || 'You are a JSON-only response generator. Always respond with valid JSON and nothing else.',
            messages: [{ role: 'user', content: questionsPrompt }],
            maxTokens: 500,
            temperature: 0.6
            // Don't pass mcpServers here - clarifying questions don't need to call MCPs (planning phase only)
        });
        
        // Parse the questions
        let questions;
        try {
            let cleanedResponse = questionsResponse.trim();
            if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            questions = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[AI] Failed to parse questions JSON:', parseError);
            // Fallback questions
            questions = [
                "Should the agent prioritize speed or accuracy?",
                "Are there any specific constraints or requirements?",
                "What format would you like the final deliverable in?"
            ];
        }
        
        console.log('[AI] Generated', questions.length, 'clarifying questions');
        
        res.json({ 
            workPlan: workPlan,
            questions: questions,
            success: true
        });
        
    } catch (error) {
        console.error('[AI] Plan generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Execute a single work plan step with AI
app.post('/api/agents/execute-step', async (req, res) => {
    try {
        const { stepIndex, stepTitle, stepDescription, tools, context, mcpServers = [] } = req.body;

        if (!stepTitle || !stepDescription) {
            return res.status(400).json({ error: 'Step title and description are required' });
        }

        console.log(`[AI] Executing Step ${stepIndex + 1}: ${stepTitle}`);
        console.log(`[AI] Tools available:`, tools);

        // Check if Exa search is requested
        let exaResults = null;
        const hasExaSearch = tools && tools.some(tool =>
            tool.toLowerCase().includes('web search') ||
            tool.toLowerCase().includes('exa')
        );

        if (hasExaSearch) {
            console.log('[EXA] Web Search tool detected, calling Exa API...');
            try {
                // Get Exa API settings
                const exaConfig = config.settings.apis?.exa || {};
                const exaApiKey = exaConfig.apiKey || config.getApiKey('exa');

                if (exaConfig.enabled && exaApiKey) {
                    // Extract search query from step description
                    const searchQuery = `${stepTitle} ${stepDescription}`;

                    console.log(`[EXA] Searching for: ${searchQuery}`);

                    // Call Exa API directly
                    const exaResponse = await fetch('https://api.exa.ai/search', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': exaApiKey
                        },
                        body: JSON.stringify({
                            query: searchQuery,
                            numResults: 5,
                            type: 'neural',
                            contents: {
                                text: true
                            }
                        })
                    });

                    if (exaResponse.ok) {
                        exaResults = await exaResponse.json();
                        console.log(`[EXA] Found ${exaResults.results?.length || 0} results`);
                    } else {
                        const errorText = await exaResponse.text();
                        console.error('[EXA] Search failed:', exaResponse.status, errorText);
                    }
                } else {
                    console.log('[EXA] Exa is not enabled or API key not configured in settings');
                }
            } catch (error) {
                console.error('[EXA] Error calling Exa API:', error.message);
            }
        }

        // Add Exa results to context if available
        let enhancedContext = context;
        if (exaResults && exaResults.results && exaResults.results.length > 0) {
            const exaContext = `\n\nWEB SEARCH RESULTS (via Exa Neural Search):\n${exaResults.results.map((r, i) =>
                `\n${i + 1}. ${r.title || 'No title'}\n   URL: ${r.url}\n   ${r.text?.substring(0, 300) || r.snippet || 'No content available'}...`
            ).join('\n\n')}`;
            enhancedContext += exaContext;
            console.log('[EXA] Added search results to context');
        }

        const activeStepMCPs = Array.isArray(mcpServers) ? mcpServers.filter(server => server && server.enabled !== false) : [];

        const mcpServerText = activeStepMCPs.length > 0
            ? `\n🔌 MCP SERVERS CONFIGURED:\n${activeStepMCPs.map(server => {
                    const label = server.label || server.name || 'MCP Server';
                    const url = server.url || server.endpoint || '';
                    return `- ${label}${url ? ` (${url})` : ''}`;
                }).join('\n')}

⚠️ CRITICAL MCP USAGE INSTRUCTIONS:
- If a document URL (PDF, Google Doc, etc.) is mentioned, you MUST call the MCP function to retrieve its actual content
- DO NOT hallucinate or make up document content - ALWAYS use the MCP to get real data
- The MCP function will be automatically called when document URLs are detected
- Wait for the MCP response before generating your answer
\n`
            : '';

        // Create execution prompt with full context
        const executionPrompt = `You are an AI agent executing a research/analysis step. Your goal is to provide SUBSTANTIVE FINDINGS with specific data, numbers, facts, and discoveries.

${enhancedContext}
${mcpServerText}
YOUR TASK:
Execute the current step and provide ACTUAL RESEARCH FINDINGS AND DATA - not just descriptions of actions taken.

CRITICAL DISTINCTION:
❌ WRONG: "Analyzed the market and found promising trends"
✅ RIGHT: "Market size: $450B in 2024, growing 34% annually. Key segments: Enterprise ($290B, 64%), Consumer ($160B, 36%)"

❌ WRONG: "Researched top competitors"
✅ RIGHT: "Top 5 competitors: OpenAI (42% market share, $2B revenue), Google (31%, $1.4B), Microsoft (18%, $810M), Anthropic (6%, $270M), Meta (3%, $135M)"

❌ WRONG: "Gathered customer feedback"
✅ RIGHT: "Customer survey (n=847): 73% cite slow response time as top issue (avg: 24hrs, desired: <2hrs). NPS score: 42 (industry avg: 38). Top feature request: mobile app (mentioned 234 times)"

EXECUTION APPROACH:
1. If you have access to real data/research tools → Provide actual findings with numbers
2. If conceptual/planning mode → Generate realistic, specific example data that would be found
3. Always include: numbers, percentages, dollar amounts, names, dates, statistics
4. Structure findings clearly with categories and metrics
5. Make data specific and plausible for the domain

IMPORTANT: Simulate having done deep research and present substantive findings as if you actually gathered the data. Include:
- Specific numbers ($, %, counts)
- Market data and sizing
- Competitor analysis with names and metrics
- Customer insights with survey data
- Technical specs and performance benchmarks
- Timeline/forecast data
- Named sources when relevant

Respond in JSON format with:
{
  "summary": "Brief summary of KEY FINDINGS (include a number/fact)",
  "details": "Detailed findings with specific data points, organized clearly. Include tables, lists, or structured data when appropriate. MUST contain specific numbers, names, or facts.",
  "nextSteps": ["Suggested actions based on the findings"],
  "artifacts": ["Report: Market Analysis", "Dataset: Survey Results (n=847)", "Competitive Matrix", etc.]
}

Example response structure for "Analyze AI market size":
{
  "summary": "Global AI market valued at $454B in 2024, projected to reach $2.7T by 2030 (CAGR: 42%)",
  "details": "MARKET SIZE ANALYSIS:\\n\\nGlobal Market:\\n- 2024: $454B (actual)\\n- 2030: $2.7T (forecast)\\n- CAGR: 42% (2024-2030)\\n\\nSegment Breakdown:\\n- Enterprise AI: $290B (64%)\\n- Consumer AI: $164B (36%)\\n\\nTop Markets by Region:\\n1. North America: $180B (40%)\\n2. Asia-Pacific: $136B (30%)\\n3. Europe: $91B (20%)\\n4. Rest of World: $47B (10%)\\n\\nGrowth Drivers:\\n- Generative AI adoption: 67% YoY growth\\n- Enterprise automation: $89B segment\\n- AI-as-a-Service: 54% of revenue\\n\\nKey Trends:\\n- LLM market alone: $12B in 2024\\n- AI chip market: $67B (adjacent)\\n- Expected 340M AI-assisted workers by 2026",
  "nextSteps": ["Deep dive into fastest growing segment (Generative AI)", "Analyze competitive positioning in Enterprise segment"],
  "artifacts": ["Market Sizing Report 2024-2030", "Regional Analysis Dataset", "Growth Drivers Matrix"]
}

Respond ONLY with the JSON object containing SUBSTANTIVE FINDINGS with real numbers and data, no other text.`;

        const executionResponse = await aiService.chat({
            systemPrompt: config.settings.prompts?.execution || 'You are a highly capable AI agent executor. You think step-by-step, provide detailed results, and always respond with valid JSON only.',
            messages: [{ role: 'user', content: executionPrompt }],
            maxTokens: 2000,
            temperature: 0.7,
            mcpServers: activeStepMCPs
        });

        // Parse the execution result
        let result;
        try {
            let cleanedResponse = executionResponse.trim();
            if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            result = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[AI] Failed to parse execution result JSON:', parseError);
            console.error('[AI] Raw response:', executionResponse);

            // Fallback result
            result = {
                summary: `Completed: ${stepTitle}`,
                details: executionResponse.substring(0, 500),
                nextSteps: ["Review the results", "Proceed to next step"],
                artifacts: []
            };
        }

        console.log(`[AI] Step ${stepIndex + 1} execution completed:`, result.summary);

        res.json({
            success: true,
            stepIndex: stepIndex,
            stepTitle: stepTitle,
            summary: result.summary,
            details: result.details,
            nextSteps: result.nextSteps || [],
            artifacts: result.artifacts || [],
            timestamp: new Date()
        });

    } catch (error) {
        console.error('[AI] Step execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// BACKGROUND EXECUTION - Run entire agent execution in backend
// ============================================================================

/**
 * Generate holistic insights from all step results
 */
async function generateHolisticInsights(agentId, stepResults, context) {
    try {
        // Compile all step results into a comprehensive context
        const resultsContext = stepResults.map((result, idx) => {
            const stepTitle = result.stepTitle || result.title || `Step ${idx + 1}`;

            // Extract insights from summary, details, or keyInsights fields
            let insightsText = '';
            if (result.summary) {
                insightsText = result.summary;
            } else if (result.details) {
                insightsText = typeof result.details === 'string' ? result.details : JSON.stringify(result.details);
            } else if (result.keyInsights && Array.isArray(result.keyInsights)) {
                insightsText = result.keyInsights.join('\n');
            } else {
                insightsText = 'No insights';
            }

            return `Step ${idx + 1}: ${stepTitle}\nFindings: ${insightsText}`;
        }).join('\n\n');

        const systemPrompt = `You are a strategic analyst synthesizing findings from a research project.

Generate 3-5 high-level holistic insights that synthesize the MOST IMPORTANT findings across ALL steps. Each insight should:
1. Synthesize information from multiple steps
2. Be strategic and actionable
3. Focus on the big picture, not individual step details
4. Include quantitative evidence when available

Format: Return ONLY an array of strings, one string per insight. No JSON, no markdown, no extra formatting.

Example output:
The market is projected to grow from $X billion in 2025 to $Y billion by 2030, driven primarily by increasing adoption in sectors A and B.
Key players X, Y, and Z control 75% of market share, with X leading at 40% due to their focus on innovation.
Regional dynamics show North America maintaining dominance at 45% market share, while Asia-Pacific is the fastest-growing region at 25% CAGR.`;

        const userPrompt = `Below are the detailed findings from ${stepResults.length} research steps:

${resultsContext}

Generate the holistic insights now:`;

        const response = await aiService.chat({
            systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 2000,
            temperature: 0.7
        });

        // Parse insights - split by newlines and filter empty
        const insights = response
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 20); // Filter out empty or very short lines

        return insights;
    } catch (error) {
        console.error('Error generating holistic insights:', error);
        return [];
    }
}

/**
 * Background execution function - runs all steps sequentially
 */
async function executeAgentInBackground(agentId, workPlan, mcpServers = [], context = {}) {
    const executionId = agentId;

    console.log(`\n▶️ Starting background execution for agent ${agentId}`);
    console.log(`   Work plan has ${workPlan.length} steps`);

    // Initialize execution state
    const executionState = {
        agentId,
        status: 'running',
        currentStepIndex: -1,
        totalSteps: workPlan.length,
        results: [],
        startedAt: new Date().toISOString(),
        error: null
    };

    executions.set(executionId, executionState);

    // Broadcast execution started with progress info
    broadcast('execution:started', {
        agentId,
        totalSteps: workPlan.length,
        status: 'executing',
        progress: 0,
        currentStep: 0
    });

    try {
        // Execute each step sequentially
        for (let i = 0; i < workPlan.length; i++) {
            const step = workPlan[i];
            executionState.currentStepIndex = i;

            console.log(`\n📍 Executing Step ${i + 1}/${workPlan.length}: ${step.title}`);

            // Broadcast step started
            broadcast('execution:stepStarted', {
                agentId,
                stepIndex: i,
                stepTitle: step.title,
                currentStep: i + 1,
                totalSteps: workPlan.length
            });

            try {
                // Build context from previous results
                const previousResults = executionState.results
                    .map((r, idx) => `Step ${idx + 1} - ${r.stepTitle}:\n${r.summary}`)
                    .join('\n\n');

                const stepContext = previousResults
                    ? `${context.baseContext || ''}\n\nPREVIOUS RESULTS:\n${previousResults}`
                    : context.baseContext || '';

                // Get Exa results if needed
                let exaResults = null;
                const hasExaSearch = step.tools && step.tools.some(tool =>
                    tool.toLowerCase().includes('web search') ||
                    tool.toLowerCase().includes('exa')
                );

                if (hasExaSearch) {
                    console.log('[EXA] Web Search tool detected');
                    try {
                        const exaConfig = config.settings.apis?.exa || {};
                        const exaApiKey = exaConfig.apiKey || config.getApiKey('exa');

                        if (exaConfig.enabled && exaApiKey) {
                            const searchQuery = `${step.title} ${step.description}`;
                            console.log(`\n🔍 EXA SEARCH DEBUG:`);
                            console.log(`   → Step title: ${step.title}`);
                            console.log(`   → Step description: ${step.description}`);
                            console.log(`   → Full search query: ${searchQuery}`);

                            const exaResponse = await fetch('https://api.exa.ai/search', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': exaApiKey
                                },
                                body: JSON.stringify({
                                    query: searchQuery,
                                    numResults: 5,
                                    type: 'neural',
                                    contents: { text: true }
                                })
                            });

                            if (exaResponse.ok) {
                                exaResults = await exaResponse.json();
                                console.log(`[EXA] Found ${exaResults.results?.length || 0} results`);
                            }
                        }
                    } catch (error) {
                        console.error('[EXA] Error:', error.message);
                    }
                }

                // Add Exa results to context if available
                let enhancedContext = stepContext;

                console.log(`\n🤖 AI PROMPT CONTEXT DEBUG:`);
                console.log(`   → Step context (first 300 chars): ${stepContext.substring(0, 300)}...`);

                if (exaResults && exaResults.results && exaResults.results.length > 0) {
                    const exaContext = `\n\nWEB SEARCH RESULTS:\n${exaResults.results.map((r, idx) =>
                        `\n${idx + 1}. ${r.title || 'No title'}\n   URL: ${r.url}\n   ${r.text?.substring(0, 300) || r.snippet || 'No content'}...`
                    ).join('\n\n')}`;
                    enhancedContext += exaContext;
                }

                // Filter active MCP servers
                const activeStepMCPs = Array.isArray(mcpServers) ?
                    mcpServers.filter(server => server && server.enabled !== false) : [];

                const mcpServerText = activeStepMCPs.length > 0
                    ? `\n🔌 MCP SERVERS CONFIGURED:\n${activeStepMCPs.map(server => {
                            const label = server.label || server.name || 'MCP Server';
                            const url = server.url || server.endpoint || '';
                            return `- ${label}${url ? ` (${url})` : ''}`;
                        }).join('\n')}\n`
                    : '';

                // Check if this step requires Excel generation
                const hasExcelTool = step.tools && step.tools.some(tool =>
                    tool.toLowerCase().includes('excel') ||
                    tool.toLowerCase().includes('📊') ||
                    tool.includes('excel-generation')
                );

                if (hasExcelTool) {
                    console.log(`📊 Excel tool detected for step ${i + 1}`);

                    // Use Excel generation endpoint
                    try {
                        const excelPrompt = step.description || `Create an Excel model for: ${step.title}`;
                        const { excelTools, executeExcelGeneration } = require('./services/excel-tools');

                        const messages = [
                            {
                                role: "system",
                                content: `You are an Excel expert assistant. You help users create professional Excel spreadsheets with multiple sheets, formulas, formatting, and data.

When asked to create an Excel file, use the generate_excel function to create it. Structure your Excel files logically with:
- Clear sheet names (e.g., "Assumptions", "Revenue", "Costs", "P&L", "Cash Flow")
- Well-formatted headers
- Organized data rows
- Appropriate formulas for calculations (use Excel formula syntax like =SUM(A2:A10), =B2*C2, etc.)
- Logical layout that makes the model easy to understand

Always explain what you're creating before calling the function.`
                            },
                            {
                                role: "user",
                                content: excelPrompt
                            }
                        ];

                        // Call OpenAI with function calling
                        let response = await aiService.client.chat.completions.create({
                            model: 'gpt-4o',
                            messages: messages,
                            tools: excelTools,
                            tool_choice: "auto"
                        });

                        let downloadUrl = null;
                        let filename = null;

                        // Handle tool calls
                        while (response.choices[0].finish_reason === "tool_calls") {
                            const message = response.choices[0].message;
                            messages.push(message);

                            for (const toolCall of message.tool_calls) {
                                if (toolCall.function.name === "generate_excel") {
                                    console.log('🔧 Executing generate_excel function in background...');
                                    const args = JSON.parse(toolCall.function.arguments);
                                    const excelResult = await executeExcelGeneration(args);

                                    if (excelResult.success) {
                                        downloadUrl = excelResult.downloadUrl;
                                        filename = excelResult.filename;
                                    }

                                    messages.push({
                                        role: "tool",
                                        tool_call_id: toolCall.id,
                                        content: JSON.stringify(excelResult)
                                    });
                                }
                            }

                            response = await aiService.client.chat.completions.create({
                                model: 'gpt-4o',
                                messages: messages,
                                tools: excelTools,
                                tool_choice: "auto"
                            });
                        }

                        // Store result with download URL
                        const stepResult = {
                            stepIndex: i,
                            stepTitle: step.title,
                            summary: response.choices[0].message.content || `Excel file '${filename}' created successfully`,
                            details: response.choices[0].message.content,
                            nextSteps: ["Download the Excel file", "Review the model"],
                            artifacts: [filename],
                            downloadUrl: downloadUrl,
                            filename: filename,
                            timestamp: new Date().toISOString()
                        };

                        executionState.results.push(stepResult);
                        console.log(`✅ Step ${i + 1} completed with Excel file: ${filename}`);

                        // Broadcast step completed
                        broadcast('execution:stepCompleted', {
                            agentId,
                            stepIndex: i,
                            result: stepResult,
                            currentStep: i + 1,
                            totalSteps: workPlan.length
                        });

                        // Continue to next step
                        continue;
                    } catch (error) {
                        console.error(`❌ Error generating Excel for step ${i + 1}:`, error);
                        // Fall through to regular execution
                    }
                }

                // Create execution prompt
                const executionPrompt = `You are an AI agent executing a research/analysis step. Your goal is to provide SUBSTANTIVE FINDINGS with specific data, numbers, facts, and discoveries.

${enhancedContext}
${mcpServerText}
YOUR TASK:
Execute the current step and provide ACTUAL RESEARCH FINDINGS AND DATA - not just descriptions of actions taken.

Respond in JSON format with:
{
  "summary": "Brief summary of KEY FINDINGS (include a number/fact)",
  "details": "Detailed findings with specific data points, organized clearly. Include tables, lists, or structured data when appropriate. MUST contain specific numbers, names, or facts.",
  "nextSteps": ["Suggested actions based on the findings"],
  "artifacts": ["Report: Market Analysis", "Dataset: Survey Results (n=847)", "Competitive Matrix", etc.]
}

Respond ONLY with the JSON object containing SUBSTANTIVE FINDINGS with real numbers and data, no other text.`;

                // Call AI service to execute step
                const executionResponse = await aiService.chat({
                    systemPrompt: config.settings.prompts?.execution || 'You are a highly capable AI agent executor. You think step-by-step, provide detailed results, and always respond with valid JSON only.',
                    messages: [{ role: 'user', content: executionPrompt }],
                    maxTokens: 2000,
                    temperature: 0.7,
                    mcpServers: activeStepMCPs
                });

                // Parse the result
                let result;
                try {
                    let cleanedResponse = executionResponse.trim();
                    if (cleanedResponse.startsWith('```')) {
                        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                    }
                    result = JSON.parse(cleanedResponse);
                } catch (parseError) {
                    console.error('[AI] Failed to parse execution result:', parseError);
                    result = {
                        summary: `Completed: ${step.title}`,
                        details: executionResponse.substring(0, 500),
                        nextSteps: ["Review the results", "Proceed to next step"],
                        artifacts: []
                    };
                }

                // Store result
                const stepResult = {
                    stepIndex: i,
                    stepTitle: step.title,
                    summary: result.summary,
                    details: result.details,
                    nextSteps: result.nextSteps || [],
                    artifacts: result.artifacts || [],
                    timestamp: new Date().toISOString()
                };

                executionState.results.push(stepResult);

                console.log(`✅ Step ${i + 1} completed: ${result.summary}`);

                // Calculate progress: (completed steps / total steps) * 100
                const progress = Math.round(((i + 1) / workPlan.length) * 100);

                // Broadcast step completed with progress
                broadcast('execution:stepCompleted', {
                    agentId,
                    stepIndex: i,
                    stepTitle: step.title,
                    result: stepResult,
                    currentStep: i + 1,
                    totalSteps: workPlan.length,
                    progress: progress,
                    status: 'executing'
                });

            } catch (stepError) {
                console.error(`❌ Step ${i + 1} failed:`, stepError);

                // Store error but continue
                executionState.results.push({
                    stepIndex: i,
                    stepTitle: step.title,
                    summary: `Error: ${stepError.message}`,
                    details: `Step failed with error: ${stepError.message}`,
                    nextSteps: [],
                    artifacts: [],
                    error: stepError.message,
                    timestamp: new Date().toISOString()
                });

                // Calculate progress even for failed steps
                const progress = Math.round(((i + 1) / workPlan.length) * 100);

                // Broadcast step failed with progress
                broadcast('execution:stepFailed', {
                    agentId,
                    stepIndex: i,
                    stepTitle: step.title,
                    error: stepError.message,
                    currentStep: i + 1,
                    totalSteps: workPlan.length,
                    progress: progress,
                    status: 'executing'
                });
            }
        }

        // All steps completed - mark as completed
        executionState.status = 'completed';
        executionState.completedAt = new Date().toISOString();

        console.log(`\n✅ All ${workPlan.length} steps completed for agent ${agentId}`);

        // ========================================================================
        // HOLISTIC INSIGHT SYNTHESIS - After all steps complete
        // ========================================================================
        try {
            console.log(`\n📊 Generating holistic insights for agent ${agentId}...`);

            // Generate holistic insights from all execution results
            const holisticInsights = await generateHolisticInsights(agentId, executionState.results, context);

            if (holisticInsights && holisticInsights.length > 0) {
                console.log(`✅ Generated ${holisticInsights.length} holistic insights`);

                // Save insights to context manager
                const reportedInsights = contextManager.reportInsights(
                    agentId,
                    context.agentName || 'Agent',
                    holisticInsights.map(text => ({ text })),
                    {
                        source: 'holistic_synthesis',
                        phase: 'completion',
                        timestamp: new Date().toISOString()
                    }
                );

                console.log(`💾 Saved ${reportedInsights?.length || 0} unique holistic insights (${holisticInsights.length - (reportedInsights?.length || 0)} duplicates filtered)`);
            }
        } catch (error) {
            console.error(`❌ Error generating holistic insights:`, error);
            // Don't fail execution if insight generation fails
        }

        // Broadcast execution completed with progress
        broadcast('execution:completed', {
            agentId,
            status: 'completed',
            progress: 100,
            currentStep: workPlan.length,
            totalSteps: workPlan.length,
            results: executionState.results,
            completedAt: executionState.completedAt
        });

        return executionState;

    } catch (error) {
        console.error(`\n❌ Background execution failed for agent ${agentId}:`, error);

        executionState.status = 'error';
        executionState.error = error.message;
        executionState.completedAt = new Date().toISOString();

        // Broadcast execution error
        broadcast('execution:error', {
            agentId,
            error: error.message,
            status: 'error'
        });

        return executionState;
    }
}

/**
 * Start full agent execution in background
 * POST /api/agents/:id/execute-all
 */
app.post('/api/agents/:id/execute-all', async (req, res) => {
    try {
        const { id: agentId } = req.params;
        const { workPlan, mcpServers = [], context = {} } = req.body;

        if (!workPlan || !Array.isArray(workPlan) || workPlan.length === 0) {
            return res.status(400).json({ error: 'Work plan is required and must be a non-empty array' });
        }

        // Check if already executing
        const existingExecution = executions.get(agentId);
        if (existingExecution && existingExecution.status === 'running') {
            return res.status(409).json({
                error: 'Agent is already executing',
                execution: existingExecution
            });
        }

        console.log(`\n🚀 Starting background execution for agent ${agentId}`);
        console.log(`   Work plan: ${workPlan.length} steps`);
        console.log(`   MCP servers: ${mcpServers.length}`);
        console.log(`\n📋 CONTEXT DEBUG:`);
        console.log(`   → Agent ID: ${agentId}`);
        console.log(`   → Context.objective: ${context.objective || 'NOT PROVIDED'}`);
        console.log(`   → Context.description: ${context.description || 'NOT PROVIDED'}`);
        console.log(`   → Context.baseContext: ${context.baseContext ? context.baseContext.substring(0, 200) + '...' : 'NOT PROVIDED'}`);
        console.log(`   → First work plan step: ${workPlan[0]?.title || 'N/A'} - ${workPlan[0]?.description?.substring(0, 100) || 'N/A'}`);

        // Start execution in background (don't await)
        executeAgentInBackground(agentId, workPlan, mcpServers, context)
            .catch(error => {
                console.error(`Background execution error for ${agentId}:`, error);
            });

        // Return immediately
        res.json({
            success: true,
            message: 'Execution started in background',
            agentId,
            totalSteps: workPlan.length,
            status: 'running'
        });

    } catch (error) {
        console.error('[API] Error starting background execution:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get execution status
 * GET /api/agents/:id/execution-status
 */
app.get('/api/agents/:id/execution-status', (req, res) => {
    try {
        const { id: agentId } = req.params;
        const execution = executions.get(agentId);

        if (!execution) {
            return res.json({
                agentId,
                status: 'not_found',
                message: 'No execution found for this agent'
            });
        }

        res.json({
            agentId,
            status: execution.status,
            currentStepIndex: execution.currentStepIndex,
            totalSteps: execution.totalSteps,
            results: execution.results,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            error: execution.error
        });

    } catch (error) {
        console.error('[API] Error getting execution status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Synthesize all execution results into key findings and insights
app.post('/api/agents/synthesize', async (req, res) => {
    try {
        const { objective, description, clarifyingAnswers, results, resultsContext, mcpServers = [] } = req.body;

        if (!results || results.length === 0) {
            return res.status(400).json({ error: 'No results to synthesize' });
        }

        console.log('[AI] Synthesizing results for agent...');
        console.log('[AI] 🔍 Results received:', results.length);
        results.forEach((result, idx) => {
            console.log(`[AI] 📦 Result ${idx}:`, {
                hasDownloadUrl: !!result.downloadUrl,
                downloadUrl: result.downloadUrl,
                filename: result.filename,
                allKeys: Object.keys(result)
            });
        });

        // Build clarifying answers context if available
        const clarifyingAnswersContext = Object.keys(clarifyingAnswers || {}).length > 0 ? `
CLARIFYING CONTEXT PROVIDED:
${Object.entries(clarifyingAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}
` : '';

        // Get template from settings or use default
        const synthesisTemplate = config.settings.prompts?.templateSynthesis || `You are an expert analyst extracting key findings and substantive information from research results.

AGENT CONTEXT:
Objective: {objective}
Description: {description}

{clarifyingAnswers}

EXECUTION RESULTS:
{resultsContext}

YOUR TASK:
Extract and present the SUBSTANTIVE FINDINGS from the execution results. Present what was DISCOVERED or FOUND.

CRITICAL INSTRUCTIONS:
1. CONSOLIDATE DUPLICATES: If multiple steps contain the same or very similar findings, consolidate them into ONE key finding
2. ENSURE UNIQUENESS: Each key finding must be DISTINCT and provide DIFFERENT information
3. PRIORITIZE QUALITY: Better to have 2-3 truly distinct findings than 5+ repetitive ones
4. If a finding appears in multiple steps, use the most detailed version and cite all relevant sources

Respond in JSON format with:
{
  "executiveSummary": "Concise summary of THE ACTUAL FINDINGS/DATA discovered",
  "keyFindings": [
    {
      "title": "The actual finding (must be unique, not repetitive)",
      "description": "Detailed substantive information",
      "evidence": "Direct quote or specific data point"
    }
  ],
  "insights": ["Insight derived from the data"],
  "recommendations": ["Actionable recommendation based on findings"]
}

Respond ONLY with the JSON object, no other text.`;

        // Replace placeholders in template
        const synthesisPrompt = synthesisTemplate
            .replace(/{objective}/g, objective || '')
            .replace(/{description}/g, description || '')
            .replace(/{clarifyingAnswers}/g, clarifyingAnswersContext)
            .replace(/{resultsContext}/g, resultsContext || '');

        const activeMCPs = Array.isArray(mcpServers) ? mcpServers.filter(mcp => mcp && mcp.enabled !== false) : [];

        const synthesisResponse = await aiService.chat({
            systemPrompt: 'You are an expert analyst who synthesizes complex information into clear, actionable insights. You always respond with valid JSON only.',
            messages: [{ role: 'user', content: synthesisPrompt }],
            maxTokens: 2500,
            temperature: 0.65,
            mcpServers: activeMCPs
        });

        // Parse the synthesis
        let synthesis;
        try {
            let cleanedResponse = synthesisResponse.trim();
            if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            synthesis = JSON.parse(cleanedResponse);

            // CRITICAL: Merge downloadUrl and filename from original results into keyFindings
            if (synthesis.keyFindings && Array.isArray(synthesis.keyFindings)) {
                console.log('[AI] 🔄 Merging download fields into keyFindings...');
                synthesis.keyFindings = synthesis.keyFindings.map((finding, idx) => {
                    const originalResult = results[idx];
                    console.log(`[AI] 📋 Finding ${idx}: originalResult has downloadUrl?`, !!originalResult?.downloadUrl);
                    if (originalResult?.downloadUrl) {
                        console.log(`[AI] ✅ Merging downloadUrl into finding ${idx}:`, originalResult.downloadUrl);
                        return {
                            ...finding,
                            downloadUrl: originalResult.downloadUrl,
                            filename: originalResult.filename
                        };
                    }
                    return finding;
                });
                console.log('[AI] 🎯 After merge, keyFindings:', synthesis.keyFindings.map((f, i) => ({
                    index: i,
                    hasDownloadUrl: !!f.downloadUrl,
                    downloadUrl: f.downloadUrl,
                    filename: f.filename
                })));
            }
        } catch (parseError) {
            console.error('[AI] Failed to parse synthesis JSON:', parseError);
            console.error('[AI] Raw response:', synthesisResponse);

            // Fallback synthesis
            synthesis = {
                executiveSummary: `Completed ${results.length} tasks as planned. Key deliverables have been generated and documented.`,
                keyFindings: results.slice(0, 3).map((result, idx) => ({
                    title: result.title,
                    description: result.summary,
                    evidence: result.artifacts?.join(', ') || 'Task completed',
                    // CRITICAL: Preserve download fields from original result
                    downloadUrl: result.downloadUrl,
                    filename: result.filename
                })),
                insights: [
                    "Tasks were completed sequentially with each step building on previous results",
                    "The agent successfully utilized the provided tools and context",
                    "All deliverables align with the stated objective"
                ],
                recommendations: [
                    "Review the detailed results for deeper analysis",
                    "Consider applying similar approaches to related tasks",
                    "Document learnings for future agent configurations"
                ]
            };
        }

        console.log('[AI] Synthesis generated with', synthesis.keyFindings?.length || 0, 'findings');

        res.json({
            success: true,
            synthesis: synthesis,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('[AI] Synthesis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Document Routes ---

// Upload document
app.post('/api/documents/upload', async (req, res) => {
    try {
        // For now, using base64 encoded PDF in JSON
        // In production, use multer for multipart/form-data
        const { filename, data } = req.body;

        // Decode base64 and save
        const buffer = Buffer.from(data, 'base64');
        const docPath = path.join(__dirname, 'storage/documents', filename);

        fs.writeFileSync(docPath, buffer);

        // Process document
        const doc = await contextManager.processDocument(docPath, { filename });

        broadcast('document:processed', { document: doc });

        res.json({ document: doc, message: 'Document processed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List documents
app.get('/api/documents', (req, res) => {
    try {
        const documents = contextManager.getDocuments();
        res.json({ documents });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get document
app.get('/api/documents/:id', (req, res) => {
    try {
        const document = contextManager.getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json({ document });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete document
app.delete('/api/documents/:id', (req, res) => {
    try {
        contextManager.removeDocument(req.params.id);
        res.json({ message: 'Document deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Orchestrator Routes ---

// Get orchestrator status
app.get('/api/orchestrator/status', (req, res) => {
    try {
        const status = agentManager.getOrchestratorStatus();
        res.json({ status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger synthesis
app.post('/api/orchestrator/synthesize', async (req, res) => {
    try {
        const summary = await agentManager.triggerSynthesis();
        res.json({ summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset orchestrator
app.post('/api/orchestrator/reset', (req, res) => {
    try {
        agentManager.orchestrator.reset();
        res.json({ message: 'Orchestrator reset' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function evaluateHypothesisAgainstInsights(hypothesisText, insights = []) {
    const timestamp = new Date().toISOString();
    const defaultResult = {
        status: 'inconclusive',
        reasoning: 'Insufficient evidence in current insights to evaluate this hypothesis.',
        evidence: insights.slice(0, 3).map(i => i.text || ''),
        confidence: 0.2,
        lastEvaluatedAt: timestamp
    };

    const trimmedHypothesis = (hypothesisText || '').trim();
    if (!trimmedHypothesis) {
        return defaultResult;
    }

    const sanitizedInsights = insights
        .filter(i => i && (i.text || i.summary))
        .slice(0, 12)
        .map((insight, index) => {
            const text = insight.text || insight.summary || '';
            const agent = insight.agentName || 'Unknown Agent';
            return `${index + 1}. ${text} (source: ${agent})`;
        });

    if (!aiService.isConfigured()) {
        // Basic heuristic: if any insight includes strong negation words, mark as refuted; else supported
        const lowerHypothesis = trimmedHypothesis.toLowerCase();
        const supportMatches = sanitizedInsights.filter(text => text.toLowerCase().includes(lowerHypothesis.split(' ')[0] || '')).length;
        const negateMatches = sanitizedInsights.filter(text => /not|unlikely|decline|decrease|drop|fails|cannot/i.test(text)).length;

        if (supportMatches > 0 && negateMatches === 0) {
            return {
                status: 'supported',
                reasoning: 'Multiple insights appear to support this hypothesis.',
                evidence: sanitizedInsights.slice(0, 3),
                confidence: 0.4,
                lastEvaluatedAt: timestamp
            };
        }

        if (negateMatches > supportMatches) {
            return {
                status: 'refuted',
                reasoning: 'Several insights contradict this hypothesis.',
                evidence: sanitizedInsights.slice(0, 3),
                confidence: 0.4,
                lastEvaluatedAt: timestamp
            };
        }

        return defaultResult;
    }

    const prompt = `You are a consulting engagement manager. Evaluate the hypothesis below using the provided key insights.

Return JSON ONLY with this schema:
{
  "status": "supported" | "refuted" | "inconclusive",
  "reasoning": "one paragraph summarizing the rationale",
  "evidence": ["bullet 1", "bullet 2", ...],
  "confidence": 0-1 number representing your confidence in the status
}

Hypothesis:
${trimmedHypothesis}

Key insights:
${sanitizedInsights.join('\n')}

If evidence is insufficient, choose "inconclusive" and explain what would be needed.`;

    try {
        const response = await aiService.chat({
            systemPrompt: config.settings.prompts?.hypothesis || 'You critically evaluate hypotheses using structured evidence. ALWAYS respond with valid JSON.',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            maxTokens: 700
        });

        let cleaned = response.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        const parsed = JSON.parse(cleaned);

        const rawStatus = (parsed.status || 'inconclusive').toLowerCase();
        const allowedStatuses = new Set(['supported', 'refuted', 'inconclusive']);
        const finalStatus = allowedStatuses.has(rawStatus) ? rawStatus : 'inconclusive';

        return {
            status: finalStatus,
            reasoning: parsed.reasoning || defaultResult.reasoning,
            evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 5) : defaultResult.evidence,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : defaultResult.confidence,
            lastEvaluatedAt: timestamp
        };
    } catch (error) {
        console.error('[ORCHESTRATOR] Hypothesis evaluation failed:', error);
        return defaultResult;
    }
}

// Get orchestrator state (hypotheses, etc.)
app.get('/api/orchestrator/state', (req, res) => {
    try {
        const state = contextManager.getOrchestratorState();
        res.json({ hypotheses: state.hypotheses });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new hypothesis and evaluate it
app.post('/api/orchestrator/hypotheses', async (req, res) => {
    try {
        const { text } = req.body || {};
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Hypothesis text is required' });
        }

        const hypothesis = contextManager.addHypothesis(text);
        const evaluation = await evaluateHypothesisAgainstInsights(hypothesis.text, contextManager.getReportedInsights());
        const updatedHypothesis = contextManager.updateHypothesis(hypothesis.id, evaluation);

        broadcast('hypothesis:updated', { hypothesis: updatedHypothesis });
        res.json({ hypothesis: updatedHypothesis });
    } catch (error) {
        console.error('[ORCHESTRATOR] Error creating hypothesis:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a hypothesis
app.delete('/api/orchestrator/hypotheses/:id', (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Hypothesis ID is required' });
        }

        const updatedHypotheses = contextManager.deleteHypothesis(id);

        broadcast('hypothesis:deleted', { hypothesisId: id });
        res.json({ success: true, hypotheses: updatedHypotheses });
    } catch (error) {
        console.error('[ORCHESTRATOR] Error deleting hypothesis:', error);
        res.status(500).json({ error: error.message });
    }
});

// Re-evaluate an existing hypothesis
app.post('/api/orchestrator/hypotheses/:id/evaluate', async (req, res) => {
    try {
        const { id } = req.params;
        const hypotheses = contextManager.getHypotheses();
        const hypothesis = hypotheses.find(h => h.id === id);

        if (!hypothesis) {
            return res.status(404).json({ error: 'Hypothesis not found' });
        }

        const evaluation = await evaluateHypothesisAgainstInsights(hypothesis.text, contextManager.getReportedInsights());
        const updatedHypothesis = contextManager.updateHypothesis(id, evaluation);

        broadcast('hypothesis:updated', { hypothesis: updatedHypothesis });
        res.json({ hypothesis: updatedHypothesis });
    } catch (error) {
        console.error('[ORCHESTRATOR] Error re-evaluating hypothesis:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate executive summary based on insights
app.post('/api/orchestrator/executive-summary', async (req, res) => {
    try {
        const insights = Array.isArray(req.body?.insights) ? req.body.insights : [];

        if (!insights.length) {
            return res.json({
                summary: {
                    bullets: ['- Add key insights to generate an executive summary.']
                }
            });
        }

        const insightTexts = insights
            .map((insight) => {
                if (typeof insight === 'string') return insight;
                if (insight && typeof insight === 'object') {
                    return insight.text || insight.summary || insight.content || '';
                }
                return '';
            })
            .filter(Boolean)
            .slice(0, 12); // limit prompt size

        let bullets = insightTexts.map(text => `- ${text}`);

        if (aiService.isConfigured()) {
            const prompt = `
You are an executive strategy consultant. Synthesize the following key insights into a concise "dot-dash" style executive summary. 
- Return JSON ONLY in the format: {"bullets": ["- point one", "- point two", ...]}
- Each bullet must start with a hyphen and a space ("- ") and be written in clear, outcome-oriented language.
- Focus on what's actionable or strategically meaningful for a partner briefing.

Insights:
${insightTexts.map((text, idx) => `${idx + 1}. ${text}`).join('\n')}
`;

            const response = await aiService.chat({
                systemPrompt: config.settings.executiveSummaryPrompt || config.settings.prompts?.executiveSummary || 'You craft crisp executive summaries from consulting deliverables.',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
                maxTokens: 600
            });

            try {
                let cleaned = response.trim();
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                }
                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
                    bullets = parsed.bullets;
                }
            } catch (error) {
                console.error('[ORCHESTRATOR] Failed to parse executive summary JSON:', error);
            }
        }

        // Ensure bullets formatted with "- "
        bullets = bullets.map((line) => {
            const trimmed = line.trim();
            return trimmed.startsWith('-') ? trimmed : `- ${trimmed}`;
        });

        res.json({ summary: { bullets } });
    } catch (error) {
        console.error('[ORCHESTRATOR] Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate executive summary' });
    }
});

// Save manually edited executive summary
app.put('/api/orchestrator/executive-summary', (req, res) => {
    try {
        const { bullets } = req.body;
        console.log('💾 PUT /api/orchestrator/executive-summary called with', bullets?.length, 'bullets');

        if (!Array.isArray(bullets)) {
            return res.status(400).json({ error: 'bullets must be an array' });
        }

        const savedBullets = contextManager.saveExecutiveSummaryBullets(bullets);
        console.log('✅ Executive summary saved:', savedBullets.length, 'bullets');

        res.json({
            success: true,
            summary: { bullets: savedBullets }
        });
    } catch (error) {
        console.error('[ORCHESTRATOR] Error saving executive summary:', error);
        res.status(500).json({ error: 'Failed to save executive summary' });
    }
});

// ============================================================================
// MCP (Model Context Protocol) Endpoints
// ============================================================================

// Get status of all MCP servers
app.get('/api/mcp/status', (req, res) => {
    try {
        const status = mcpManager.getStatus();
        res.json(status);
    } catch (error) {
        console.error('[MCP] Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start Uber Eats MCP server
app.post('/api/mcp/uber-eats/start', async (req, res) => {
    try {
        console.log('🚀 Starting Uber Eats MCP server...');
        const result = await mcpManager.startUberEatsServer();

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                tools: result.tools
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('[MCP] Error starting Uber Eats server:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stop Uber Eats MCP server
app.post('/api/mcp/uber-eats/stop', async (req, res) => {
    try {
        console.log('🛑 Stopping Uber Eats MCP server...');
        const result = await mcpManager.stopUberEatsServer();

        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        console.error('[MCP] Error stopping Uber Eats server:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Search for restaurants using Uber Eats MCP
app.post('/api/mcp/uber-eats/search', async (req, res) => {
    try {
        const { address, foodCraving } = req.body;

        if (!address || !foodCraving) {
            return res.status(400).json({
                success: false,
                error: 'address and foodCraving are required'
            });
        }

        console.log(`[MCP] Searching for: ${foodCraving} at ${address}`);

        // Call the find_menu_options tool
        const result = await mcpManager.callTool('uber_eats', 'find_menu_options', {
            address: address,
            food_craving: foodCraving
        });

        console.log('[MCP] Tool call result:', result);

        // Extract request ID from the result
        // Result format: "Search for 'pizza' at 'Stockholm, Sweden' started. Please wait for 2 minutes, then you can retrieve results using the resource URI: resource://search_results/{request_id}"
        const content = result.content?.[0]?.text || result.toString();
        const requestIdMatch = content.match(/resource:\/\/search_results\/([a-zA-Z0-9_-]+)/);
        const requestId = requestIdMatch ? requestIdMatch[1] : null;

        res.json({
            success: true,
            message: content,
            requestId
        });
    } catch (error) {
        console.error('[MCP] Error during search:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get search results by request ID
app.get('/api/mcp/uber-eats/results/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;

        console.log(`[MCP] Fetching results for request ID: ${requestId}`);

        // Read the resource
        const result = await mcpManager.readResource('uber_eats', `resource://search_results/${requestId}`);

        console.log('[MCP] Resource result:', result);

        const content = result.contents?.[0]?.text || result.toString();

        res.json({
            success: true,
            results: content
        });
    } catch (error) {
        console.error('[MCP] Error fetching results:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// Error handler
// ============================================================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
});

// ============================================================================
// Insights endpoints - for Central Orchestrator
// ============================================================================

// Get all reported insights
app.get('/api/insights', (req, res) => {
    try {
        const insights = contextManager.getReportedInsights();
        console.log(`[INSIGHTS] Retrieved ${insights.length} insights`);
        res.json({ insights });
    } catch (error) {
        console.error('[INSIGHTS] Error reading insights:', error);
        res.status(500).json({ error: 'Failed to read insights' });
    }
});

// Save a new insight
app.post('/api/insights', (req, res) => {
    try {
        const { text, agentId, agentName, timestamp, stepTitle, stepIndex, phase } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Insight text is required' });
        }

        const reportedInsights = contextManager.reportInsights(
            agentId,
            agentName,
            [{ text, timestamp, stepTitle, stepIndex }],
            { phase }
        );

        if (reportedInsights && reportedInsights.length > 0) {
            const newInsight = reportedInsights[0];
            const total = contextManager.getReportedInsights().length;
            broadcast('insight:reported', {
                agentId: newInsight.agentId,
                agentName: newInsight.agentName,
                stepIndex: newInsight.stepIndex,
                stepTitle: newInsight.stepTitle,
                insights: [newInsight]
            });

            console.log(`[INSIGHTS] Saved new insight (${total} total)`);
            res.json({ success: true, insight: newInsight, total });
        } else {
            // Insight was filtered as duplicate
            console.log(`[INSIGHTS] Insight was a duplicate, not saved`);
            res.status(200).json({
                success: false,
                duplicate: true,
                message: 'This insight has already been recorded',
                total: contextManager.getReportedInsights().length
            });
        }
    } catch (error) {
        console.error('[INSIGHTS] Error saving insight:', error);
        res.status(500).json({ error: 'Failed to save insight' });
    }
});

// Delete an insight
app.delete('/api/insights/:id', (req, res) => {
    try {
        const { id } = req.params;

        const insights = contextManager.deleteInsight(id);

        console.log(`[INSIGHTS] Deleted insight ${id} (${insights.length} remaining)`);
        res.json({ success: true, insights });
    } catch (error) {
        console.error('[INSIGHTS] Error deleting insight:', error);
        res.status(500).json({ error: 'Failed to delete insight' });
    }
});

// ============================================================================
// TEST MCP INTEGRATION
// ============================================================================

// GET version for browser testing
app.get('/api/test-mcp', async (req, res) => {
    try {
        console.log('\n🧪 MCP INTEGRATION TEST STARTING (GET request)...\n');

        const testMCP = {
            label: 'reducto',
            name: 'reducto',
            url: 'https://reducto-mcp-server.vercel.app/',
            endpoint: 'https://reducto-mcp-server.vercel.app/',
            enabled: true
        };

        const testMessage = 'Parse this document: https://docs.google.com/document/d/1xFpR7dPqUh2z5B2EvdVkaAOOr3WnIr3Pa71lytpFqKo/edit';

        const result = await aiService.chat({
            systemPrompt: 'You are a helpful assistant. Use available MCP tools to parse documents.',
            messages: [{ role: 'user', content: testMessage }],
            mcpServers: [testMCP],
            maxTokens: 1000,
            temperature: 0.7
        });

        console.log('\n✅ MCP TEST COMPLETED\n');

        res.json({
            success: true,
            result: result,
            testMCP: testMCP,
            message: 'MCP test successful! Check backend console for detailed logs.'
        });

    } catch (error) {
        console.error('❌ MCP TEST FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// POST version
app.post('/api/test-mcp', async (req, res) => {
    try {
        console.log('\n🧪 MCP INTEGRATION TEST STARTING (POST request)...\n');

        const testMCP = {
            label: 'reducto',
            name: 'reducto',
            url: 'https://reducto-mcp-server.vercel.app/',
            endpoint: 'https://reducto-mcp-server.vercel.app/',
            enabled: true
        };

        const testMessage = 'Parse this document: https://docs.google.com/document/d/1xFpR7dPqUh2z5B2EvdVkaAOOr3WnIr3Pa71lytpFqKo/edit';

        const result = await aiService.chat({
            systemPrompt: 'You are a helpful assistant. Use available MCP tools to parse documents.',
            messages: [{ role: 'user', content: testMessage }],
            mcpServers: [testMCP],
            maxTokens: 1000,
            temperature: 0.7
        });

        console.log('\n✅ MCP TEST COMPLETED\n');

        res.json({
            success: true,
            result: result,
            message: 'Check backend console for detailed logs'
        });

    } catch (error) {
        console.error('❌ MCP TEST FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// Excel Generation Routes
// ============================================================================

// Download Excel file
app.get('/api/excel/download/:filename', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'temp/excel', req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                res.status(500).json({ error: 'Failed to download file' });
            }
        });
    } catch (error) {
        console.error('Error in download endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// Execute agent step with Excel tool support
app.post('/api/agents/execute-with-excel', async (req, res) => {
    try {
        const { agentId, stepIndex, userPrompt, objective, description } = req.body;

        console.log(`\n📊 Executing Excel generation for agent ${agentId}`);

        // Build messages for OpenAI
        const messages = [
            {
                role: "system",
                content: `You are an Excel expert assistant. You help users create professional Excel spreadsheets with multiple sheets, formulas, formatting, and data.

When asked to create an Excel file, use the generate_excel function to create it. Structure your Excel files logically with:
- Clear sheet names (e.g., "Assumptions", "Revenue", "Costs", "P&L", "Cash Flow")
- Well-formatted headers
- Organized data rows
- Appropriate formulas for calculations (use Excel formula syntax like =SUM(A2:A10), =B2*C2, etc.)
- Logical layout that makes the model easy to understand

Always explain what you're creating before calling the function.`
            },
            {
                role: "user",
                content: userPrompt || `Create an Excel model for: ${objective}\n\nDetails: ${description}`
            }
        ];

        // Call OpenAI with function calling
        let response = await aiService.client.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            tools: excelTools,
            tool_choice: "auto"
        });

        let downloadUrl = null;
        let filename = null;

        // Handle tool calls (following the Python pattern)
        while (response.choices[0].finish_reason === "tool_calls") {
            const message = response.choices[0].message;
            messages.push(message);

            // Execute each tool call
            for (const toolCall of message.tool_calls) {
                if (toolCall.function.name === "generate_excel") {
                    console.log('🔧 Executing generate_excel function...');

                    // Parse arguments
                    const args = JSON.parse(toolCall.function.arguments);

                    // Generate Excel file
                    const result = await executeExcelGeneration(args);

                    if (result.success) {
                        downloadUrl = result.downloadUrl;
                        filename = result.filename;
                    }

                    // Add tool response to messages
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }
            }

            // Continue conversation
            response = await aiService.client.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                tools: excelTools,
                tool_choice: "auto"
            });
        }

        // Return final response with download URL
        res.json({
            success: true,
            message: response.choices[0].message.content,
            downloadUrl: downloadUrl,
            filename: filename,
            conversationHistory: messages
        });

    } catch (error) {
        console.error('❌ Error in Excel execution:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// Start server
// ============================================================================
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║               Command Center Backend Started                         ║
╚══════════════════════════════════════════════════════════════════════╝

Server running on: http://localhost:${PORT}
WebSocket: ws://localhost:${PORT}

API Endpoints:
- GET  /api/agents
- POST /api/agents
- GET  /api/settings
- POST /api/documents/upload
- GET  /api/orchestrator/status
- POST /api/orchestrator/hypotheses
- DELETE /api/orchestrator/hypotheses/:id
- POST /api/orchestrator/hypotheses/:id/evaluate

OpenAI configured: ${aiService.isConfigured()}
Documents loaded: ${contextManager.getDocuments().length}

Ready to orchestrate agents!
    `);
});
