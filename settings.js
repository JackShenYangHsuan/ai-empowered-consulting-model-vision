/**
 * Settings Page JavaScript
 */

const api = new APIClient();
let mcps = [];
let mcpsSaveTimeout = null;
let defaultPrompts = null;

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Settings page loaded');
    
    try {
        await loadSettings();
        attachEventListeners();
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings. Is the backend running?', 'error');
    }
});

// ============================================================================
// Load Settings
// ============================================================================

async function loadSettings() {
    try {
        const { settings } = await api.getSettings();
        
        // OpenAI
        if (settings.apis?.openai) {
            // Default to enabled if configured (OpenAI is required for agents to work)
            const isEnabled = settings.apis.openai.enabled !== false;
            document.getElementById('openaiEnabled').checked = isEnabled;
            if (settings.apis.openai.configured) {
                document.getElementById('openaiKey').value = settings.apis.openai.apiKey; // Will be masked
                document.getElementById('openaiKey').placeholder = settings.apis.openai.apiKey;
            }
            document.getElementById('openaiModel').value = settings.apis.openai.model || 'gpt-4o-mini';
        }

        // Anthropic
        if (settings.apis?.anthropic) {
            document.getElementById('anthropicEnabled').checked = settings.apis.anthropic.enabled || false;
            if (settings.apis.anthropic.configured) {
                document.getElementById('anthropicKey').placeholder = settings.apis.anthropic.apiKey;
            }
            document.getElementById('anthropicModel').value = settings.apis.anthropic.model || 'claude-3-opus-20240229';
        }

        // Exa
        if (settings.apis?.exa) {
            document.getElementById('exaEnabled').checked = settings.apis.exa.enabled || false;
            if (settings.apis.exa.configured) {
                document.getElementById('exaKey').placeholder = settings.apis.exa.apiKey;
            }
        }

        // MCPs
        mcps = (settings.mcps || []).map(mcp => ({
            ...mcp,
            label: mcp.label || mcp.name || '',
            name: mcp.name || mcp.label || ''
        }));
        renderMCPs();

        // Prompts
        loadPrompts(settings.prompts || {});

        console.log('Settings loaded successfully');
    } catch (error) {
        console.error('Error loading settings:', error);
        throw error;
    }
}

function loadPrompts(prompts) {
    // Store default prompts for reset functionality
    if (!defaultPrompts) {
        defaultPrompts = getDefaultPrompts();
    }

    // Load all prompts (system prompts)
    document.getElementById('promptWorkPlan').value = prompts.workPlan || defaultPrompts.workPlan;
    document.getElementById('promptQuestions').value = prompts.questions || defaultPrompts.questions;
    document.getElementById('promptExecution').value = prompts.execution || defaultPrompts.execution;

    // Load user message templates
    document.getElementById('templateWorkPlan').value = prompts.templateWorkPlan || defaultPrompts.templateWorkPlan;
    document.getElementById('templateQuestions').value = prompts.templateQuestions || defaultPrompts.templateQuestions;
    document.getElementById('templateExecution').value = prompts.templateExecution || defaultPrompts.templateExecution;
    document.getElementById('templateSynthesis').value = prompts.templateSynthesis || defaultPrompts.templateSynthesis;
}

function getDefaultPrompts() {
    return {
        // System prompts
        workPlan: `You are a JSON-only response generator. Always respond with valid JSON and nothing else.`,
        questions: `You are a JSON-only response generator. Always respond with valid JSON and nothing else.`,
        execution: `You are a highly capable AI agent executor. You think step-by-step, provide detailed results, and always respond with valid JSON only.`,

        // User message templates
        templateWorkPlan: `You are an expert AI agent planner. Generate a detailed, step-by-step work plan for the following agent:

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

Respond ONLY with the JSON array, no other text.`,

        templateQuestions: `Based on this agent objective and work plan, generate 3-5 clarifying questions that would help improve the execution.

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

Respond ONLY with the JSON array, no other text.`,

        templateExecution: `You are an AI agent executing a research/analysis step. Your goal is to provide SUBSTANTIVE FINDINGS with specific data, numbers, facts, and discoveries.

{context}
{mcpInstructions}

YOUR TASK:
Execute the current step and provide ACTUAL RESEARCH FINDINGS AND DATA - not just descriptions of actions taken.

Respond in JSON format with:
{
  "summary": "Brief summary of KEY FINDINGS (include a number/fact)",
  "details": "Detailed findings with specific data points, organized clearly.",
  "nextSteps": ["Suggested actions based on the findings"],
  "artifacts": ["List of deliverables created"]
}

Respond ONLY with the JSON object, no other text.`,

        templateSynthesis: `You are an expert analyst extracting key findings and substantive information from research results. Your job is to present THE ACTUAL FINDINGS, DATA, AND ANSWERS discovered during execution - NOT descriptions of what tasks were completed.

AGENT CONTEXT:
Objective: {objective}
Description: {description}

{clarifyingAnswers}

EXECUTION RESULTS:
{resultsContext}

YOUR TASK:
Extract and present the SUBSTANTIVE FINDINGS from the execution results. Do NOT describe what the agent did - instead, present what was DISCOVERED or FOUND.

WRONG APPROACH (what NOT to do):
❌ "Successfully analyzed market size data"
❌ "Researched competitive landscape"
❌ "Gathered customer feedback"

RIGHT APPROACH (what TO do):
✅ "AI market size: $200B globally in 2024, growing at 37% CAGR"
✅ "Top 3 competitors: OpenAI (40% market share), Google (28%), Anthropic (15%)"
✅ "Key customer pain point: 73% want faster response times (avg current: 24hrs)"

CRITICAL: Extract actual data points, numbers, facts, names, statistics, quotes, and substantive information from the results. Present findings as if you're delivering the research outcomes to an executive.

Look for:
- Market sizes, revenue figures, growth rates (with $, %, timeframes)
- Names of companies, people, products, technologies
- Survey results, statistics, percentages
- Competitive intelligence, market share data
- Customer quotes, feedback themes with counts
- Technical specifications, performance metrics
- Dates, timelines, forecasts
- Research conclusions and learnings

Respond in JSON format with:
{
  "executiveSummary": "Concise summary of THE ACTUAL FINDINGS/DATA discovered (not what tasks were done). Include specific numbers or key facts.",
  "keyFindings": [
    {
      "title": "The actual finding (e.g., 'Market Size: $200B')",
      "description": "Detailed substantive information, data, or discovery with specifics",
      "evidence": "Direct quote or specific data point from the research (e.g., '37% CAGR projected 2024-2028')"
    }
  ],
  "insights": [
    "Insight derived from the data with specific numbers/facts (e.g., 'Growth driven primarily by enterprise adoption (65% of revenue)')",
    "Pattern or trend identified with supporting data",
    "Key learning or implication with quantitative backing"
  ],
  "recommendations": [
    "Actionable recommendation based on the specific findings and data",
    "Strategic suggestion tied to discovered information",
    "Next step that follows from the research outcomes"
  ]
}

Generate 3-5 key findings (each with real data/facts), 3-5 insights (each with evidence), and 3-5 recommendations (each tied to specific findings).

IMPORTANT: If the results don't contain specific data/facts yet, extract whatever substantive information IS there (concepts, frameworks, approaches, preliminary findings). But always focus on WHAT WAS FOUND, not what actions were taken.

Respond ONLY with the JSON object, no other text.`
    };
}

// ============================================================================
// Save Settings
// ============================================================================

async function saveSettings() {
    try {
        showStatus('Saving...', 'info');

        const settings = {
            apis: {
                openai: {
                    apiKey: document.getElementById('openaiKey').value,
                    model: document.getElementById('openaiModel').value,
                    enabled: document.getElementById('openaiEnabled').checked
                },
                anthropic: {
                    apiKey: document.getElementById('anthropicKey').value,
                    model: document.getElementById('anthropicModel').value,
                    enabled: document.getElementById('anthropicEnabled').checked
                },
                exa: {
                    apiKey: document.getElementById('exaKey').value,
                    enabled: document.getElementById('exaEnabled').checked
                }
            },
            mcps: mcps,
            prompts: {
                // System prompts
                workPlan: document.getElementById('promptWorkPlan').value,
                questions: document.getElementById('promptQuestions').value,
                execution: document.getElementById('promptExecution').value,
                // User message templates
                templateWorkPlan: document.getElementById('templateWorkPlan').value,
                templateQuestions: document.getElementById('templateQuestions').value,
                templateExecution: document.getElementById('templateExecution').value,
                templateSynthesis: document.getElementById('templateSynthesis').value
            }
        };

        await api.updateSettings(settings);
        showStatus('Settings saved successfully!', 'success');

        // Reload to show masked keys
        setTimeout(() => loadSettings(), 1000);
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings: ' + error.message, 'error');
    }
}

// ============================================================================
// Test API Connections
// ============================================================================

async function testConnection(service, buttonId) {
    const button = document.getElementById(buttonId);
    const originalText = button.textContent;

    button.textContent = 'Testing...';
    button.disabled = true;

    try {
        const result = await api.testAPIConnection(service);

        if (result.success) {
            button.textContent = '✓ Success';
            button.style.backgroundColor = 'var(--accent-success)';
            button.style.color = 'white';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = '';
                button.style.color = '';
                button.disabled = false;
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        button.textContent = '✗ Failed';
        button.style.backgroundColor = 'var(--accent-danger)';
        button.style.color = 'white';
        showStatus(`${service} test failed: ${error.message}`, 'error');
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button.disabled = false;
        }, 2000);
    }
}

// ============================================================================
// MCP Management
// ============================================================================

function renderMCPs() {
    const list = document.getElementById('mcpList');

    if (mcps.length === 0) {
        list.innerHTML = '<div class="empty-state">No MCP endpoints configured</div>';
        return;
    }

    list.innerHTML = mcps.map((mcp, index) => {
        const label = mcp.label || mcp.name || 'Unnamed MCP';
        const url = mcp.url || mcp.endpoint || '';
        return `
        <div class="mcp-item">
            <div class="mcp-item-info">
                <div class="mcp-item-label">${label}</div>
                <div class="mcp-item-url">${url}</div>
            </div>
            <div class="mcp-item-actions">
                <label class="toggle-switch">
                    <input type="checkbox" ${mcp.enabled ? 'checked' : ''} onchange="toggleMCP(${index})">
                    <span class="toggle-slider"></span>
                </label>
                <button class="btn-secondary btn-small" onclick="removeMCP(${index})">Delete</button>
            </div>
        </div>
    `;
    }).join('');
}

function toggleMCP(index) {
    mcps[index].enabled = !mcps[index].enabled;
    scheduleMCPSave();
}

function removeMCP(index) {
    mcps.splice(index, 1);
    renderMCPs();
    scheduleMCPSave();
}

function addMCP() {
    const label = document.getElementById('mcpName').value.trim();
    const endpoint = document.getElementById('mcpEndpoint').value.trim();

    if (!label || !endpoint) {
        showStatus('Please fill in all fields', 'error');
        return;
    }

    // Validate URL format
    try {
        new URL(endpoint);
    } catch (e) {
        showStatus('Please enter a valid URL (e.g., https://mcp-server.example.com)', 'error');
        return;
    }

    mcps.push({
        label,
        name: label, // Maintain backward compatibility with existing consumers
        url: endpoint,
        endpoint,
        enabled: true
    });

    renderMCPs();
    scheduleMCPSave();
    closeMCPModal();
    showStatus('MCP server added successfully', 'success');
}

function openMCPModal() {
    document.getElementById('mcpModal').classList.add('active');
    document.getElementById('mcpName').value = '';
    document.getElementById('mcpEndpoint').value = '';
    requestAnimationFrame(() => {
        document.getElementById('mcpName').focus();
    });
}

function closeMCPModal() {
    document.getElementById('mcpModal').classList.remove('active');
    if (mcpsSaveTimeout) {
        // Save any pending changes immediately when closing
        clearTimeout(mcpsSaveTimeout);
        persistMCPs();
    }
}

// ============================================================================
// Status Messages
// ============================================================================

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message-fixed status-${type}`;
    statusEl.style.display = 'flex';

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

function resetPrompts() {
    if (confirm('Are you sure you want to reset all prompts to their default values?')) {
        loadPrompts({});
        showStatus('Prompts reset to defaults', 'success');
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

function attachEventListeners() {
    // Save button
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // Tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });

    // Reset prompts button
    document.getElementById('resetPromptsBtn').addEventListener('click', resetPrompts);

    // Test buttons
    document.getElementById('testOpenAI').addEventListener('click', () => testConnection('openai', 'testOpenAI'));
    document.getElementById('testAnthropic').addEventListener('click', () => testConnection('anthropic', 'testAnthropic'));
    document.getElementById('testExa').addEventListener('click', () => testConnection('exa', 'testExa'));

    // MCP modal
    document.getElementById('addMCPBtn').addEventListener('click', openMCPModal);
    document.getElementById('mcpModalClose').addEventListener('click', closeMCPModal);
    document.getElementById('mcpModalCancel').addEventListener('click', closeMCPModal);
    document.getElementById('addMCPConfirm').addEventListener('click', addMCP);
    document.getElementById('mcpModal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeMCPModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('mcpModal').classList.contains('active')) {
            closeMCPModal();
        }
        if (event.key === 'Enter' && document.getElementById('mcpModal').classList.contains('active')) {
            const activeElement = document.activeElement;
            if (activeElement === document.getElementById('mcpName') || activeElement === document.getElementById('mcpEndpoint')) {
                addMCP();
            }
        }
    });
}

function scheduleMCPSave() {
    if (mcpsSaveTimeout) {
        clearTimeout(mcpsSaveTimeout);
    }

    mcpsSaveTimeout = setTimeout(() => {
        persistMCPs();
    }, 400);
}

async function persistMCPs() {
    mcpsSaveTimeout = null;
    try {
        showStatus('Saving MCP configuration...', 'info');
        await api.updateSettings({ mcps });
        showStatus('MCP configuration saved', 'success');
    } catch (error) {
        console.error('Error saving MCP configuration:', error);
        showStatus('Failed to save MCP configuration: ' + error.message, 'error');
    }
}
