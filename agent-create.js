// Current step tracker
let currentStep = 1;
let currentTeammateId = null;
let selectedTeammateMCPs = [];

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3003'
    : `${window.location.protocol}//${window.location.host}`;

// API client will be initialized after page loads
let apiClient = null;

// Load project context from Firebase (with localStorage fallback)
async function getProjectContextAsync() {
    try {
        // Try to load from Firebase first
        if (typeof projectContextDB !== 'undefined') {
            const context = await projectContextDB.get();
            if (context && (context.keyQuestion || context.constraints || context.otherContext)) {
                let contextString = '\n\n## Project Context\n';
                if (context.keyQuestion) {
                    contextString += `\n**Key Question:** ${context.keyQuestion}`;
                }
                if (context.constraints) {
                    contextString += `\n\n**Constraints:** ${context.constraints}`;
                }
                if (context.otherContext) {
                    contextString += `\n\n**Other Context:** ${context.otherContext}`;
                }
                return contextString;
            }
        }
    } catch (error) {
        console.error('Error loading project context from Firebase:', error);
    }

    // Fallback to localStorage
    try {
        const savedContext = localStorage.getItem('projectContext');
        if (savedContext) {
            const context = JSON.parse(savedContext);
            if (!context.keyQuestion && !context.constraints && !context.otherContext) {
                return '';
            }
            let contextString = '\n\n## Project Context\n';
            if (context.keyQuestion) {
                contextString += `\n**Key Question:** ${context.keyQuestion}`;
            }
            if (context.constraints) {
                contextString += `\n\n**Constraints:** ${context.constraints}`;
            }
            if (context.otherContext) {
                contextString += `\n\n**Other Context:** ${context.otherContext}`;
            }
            return contextString;
        }
    } catch (error) {
        console.error('Error loading project context from localStorage:', error);
    }
    return '';
}

// Synchronous version for backward compatibility (loads from localStorage only)
function getProjectContext() {
    try {
        const savedContext = localStorage.getItem('projectContext');
        if (savedContext) {
            const context = JSON.parse(savedContext);
            if (!context.keyQuestion && !context.constraints && !context.otherContext) {
                return '';
            }
            let contextString = '\n\n## Project Context\n';
            if (context.keyQuestion) {
                contextString += `\n**Key Question:** ${context.keyQuestion}`;
            }
            if (context.constraints) {
                contextString += `\n\n**Constraints:** ${context.constraints}`;
            }
            if (context.otherContext) {
                contextString += `\n\n**Other Context:** ${context.otherContext}`;
            }
            return contextString;
        }
    } catch (error) {
        console.error('Error loading project context:', error);
    }
    return '';
}

console.log('✅ teammate-create.js loaded - version 4.0 - BACKEND ORCHESTRATED EXECUTION');

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('✅ DOM Content Loaded - initializing...');

    // Check if we're loading an existing agent (support both agentId and teammateId for backwards compatibility)
    const urlParams = new URLSearchParams(window.location.search);
    const teammateId = urlParams.get('agentId') || urlParams.get('teammateId');

    // Only show step 1 by default if NOT loading an existing agent
    if (!teammateId) {
        updateStepDisplay();
    }

    // Wait a moment for Firebase SDK to load, then initialize
    setTimeout(async () => {
        try {
            // Initialize API client first
            if (typeof APIClient === 'undefined') {
                console.error('❌ APIClient not loaded yet');
                throw new Error('APIClient class not found');
            }
            apiClient = new APIClient(API_BASE);
            console.log('✅ API Client initialized');

            // Initialize Firebase first
            const firebaseReady = initFirebase();
            if (!firebaseReady) {
                console.error('❌ Firebase initialization failed');
                throw new Error('Firebase failed to initialize');
            }

            // Wait a bit more for Firebase to be fully ready
            await new Promise(resolve => setTimeout(resolve, 500));

            // Setup WebSocket for backend execution updates
            setupWebSocketListeners();
            apiClient.connectWebSocket();

            // Load MCP servers from settings
            loadMCPServers();

            // Load existing agent if teammateId is present
            if (teammateId) {
                console.log('🔄 Loading existing agent:', teammateId);
                await loadExistingTeammate(teammateId);
            }
        } catch (error) {
            console.error('❌ Initialization error:', error);
        }
    }, 100);
});

// ============================================================================
// WebSocket Event Listeners for Backend Execution
// ============================================================================

function setupWebSocketListeners() {
    console.log('📡 Setting up WebSocket listeners for backend execution...');

    // Execution started
    apiClient.on('execution:started', (data) => {
        console.log('🚀 Execution started:', data);
        if (data.agentId === currentTeammateId) {
            executionState.isRunning = true;
            executionState.totalSteps = data.totalSteps;
        }
    });

    // Step started
    apiClient.on('execution:stepStarted', (data) => {
        console.log(`📍 Step ${data.currentStep}/${data.totalSteps} started:`, data.stepTitle);
        if (data.agentId === currentTeammateId) {
            executionState.currentStepIndex = data.stepIndex;

            // Update work plan step status
            if (executionState.workPlan[data.stepIndex]) {
                executionState.workPlan[data.stepIndex].status = 'running';
            }

            updateExecutionProgress();

            addLogEntry({
                type: 'info',
                title: `Step ${data.currentStep}: ${data.stepTitle}`,
                message: 'Starting execution...',
                status: 'running'
            });
        }
    });

    // Step completed
    apiClient.on('execution:stepCompleted', (data) => {
        console.log(`✅ Step ${data.currentStep}/${data.totalSteps} completed:`, data.stepTitle);
        if (data.agentId === currentTeammateId) {
            // Update work plan step status
            if (executionState.workPlan[data.stepIndex]) {
                executionState.workPlan[data.stepIndex].status = 'completed';
            }

            executionState.completedSteps++;

            // Store result - preserve ALL fields from backend, especially downloadUrl and filename
            executionState.results.push({
                ...data.result,  // CRITICAL: Spread ALL fields from backend result first
                stepIndex: data.stepIndex,
                title: data.stepTitle || data.result.stepTitle,
                summary: data.result.summary || 'Step completed successfully',
                details: data.result.details || '',
                artifacts: data.result.artifacts || [],
                nextSteps: data.result.nextSteps || [],
                timestamp: data.result.timestamp,
                reported: false,
                reportedAt: null,
                // These will be preserved if they exist in data.result:
                // downloadUrl: data.result.downloadUrl,
                // filename: data.result.filename
            });

            console.log('📦 [WebSocket] Stored result with keys:', Object.keys(executionState.results[executionState.results.length - 1]));

            updateExecutionProgress();

            addLogEntry({
                type: 'success',
                title: `Step ${data.currentStep}: ${data.stepTitle}`,
                message: data.result.summary || 'Step completed successfully',
                status: 'completed'
            });

            // Save progress to Firebase
            saveExecutionProgress().catch(error => {
                console.error('Error saving to Firebase:', error);
            });
        }
    });

    // Step failed
    apiClient.on('execution:stepFailed', (data) => {
        console.error(`❌ Step ${data.currentStep}/${data.totalSteps} failed:`, data.stepTitle);
        if (data.agentId === currentTeammateId) {
            // Update work plan step status
            if (executionState.workPlan[data.stepIndex]) {
                executionState.workPlan[data.stepIndex].status = 'failed';
            }

            updateExecutionProgress();

            addLogEntry({
                type: 'error',
                title: `Step ${data.currentStep}: ${data.stepTitle}`,
                message: `Error: ${data.error}`,
                status: 'failed'
            });
        }
    });

    // Execution completed
    apiClient.on('execution:completed', (data) => {
        console.log('✅ All steps completed!', data);
        if (data.agentId === currentTeammateId) {
            executionState.isRunning = false;
            executionState.status = 'completed';

            // Call synthesis and auto-navigate to step 4
            synthesizeResults().then(() => {
                setTimeout(() => {
                    console.log('🎉 Auto-navigating to Step 4 (Synthesis)...');
                    populateStep4();

                    // Auto-navigate to step 4 without confirmation
                    if (currentStep < 4) {
                        currentStep = 4;
                        updateStepDisplay();
                        window.scrollTo(0, 0);
                    }
                }, 500);
            });

            // Save final state to Firebase
            saveExecutionProgress().catch(error => {
                console.error('Error saving final state to Firebase:', error);
            });
        }
    });

    // Execution error
    apiClient.on('execution:error', (data) => {
        console.error('❌ Execution failed:', data);
        if (data.teammateId === currentTeammateId) {
            executionState.isRunning = false;
            executionState.status = 'error';

            addLogEntry({
                type: 'error',
                title: 'Execution Failed',
                message: data.error,
                status: 'failed'
            });

            alert(`Execution failed: ${data.error}`);
        }
    });

    console.log('✅ WebSocket listeners registered');
}

// Load MCP servers from settings
async function loadMCPServers() {
    const mcpToolsList = document.getElementById('mcpToolsList');
    console.log('🔍 loadMCPServers() called');
    console.log('📍 mcpToolsList element:', mcpToolsList);

    try {
        const response = await fetch(`${API_BASE}/api/settings`);
        const data = await response.json();
        const mcps = data.settings?.mcps || [];

        console.log('📦 Fetched data:', data);
        console.log('📋 MCPs array:', mcps);
        console.log('🔢 MCPs length:', mcps.length);

        if (mcps.length === 0) {
            console.log('⚠️ No MCPs found, clearing list');
            mcpToolsList.innerHTML = '';
            clearAllMCPChips();
            selectedTeammateMCPs = [];
            return;
        }

        // Display available MCP servers as simple checkboxes
        clearAllMCPChips();
        const html = mcps.map((mcp, index) => {
            const label = mcp.label || mcp.name || 'Unnamed MCP';
            const url = mcp.url || mcp.endpoint || '';
            const toolId = `mcp-${index}`;
            const safeLabel = label.replace(/"/g, '&quot;');
            const safeUrl = url.replace(/"/g, '&quot;');
            const isDisabled = !mcp.enabled;

            console.log(`  MCP ${index}:`, { label, url, enabled: mcp.enabled, isDisabled });

            return `
            <div class="tool-item ${isDisabled ? 'tool-item-disabled' : ''}">
                <label class="tool-toggle">
                    <input
                        type="checkbox"
                        class="tool-checkbox"
                        id="mcp-${index}"
                        value="${safeLabel}"
                        data-label="${safeLabel}"
                        data-url="${safeUrl}"
                        data-tool-id="${toolId}"
                        ${isDisabled ? 'disabled' : ''}
                    >
                    <span class="tool-name">${label}</span>
                </label>
            </div>
            `;
        }).join('');

        console.log('📝 Generated HTML:', html);
        mcpToolsList.innerHTML = html;
        console.log('✅ HTML inserted into mcpToolsList');

        document.querySelectorAll('#mcpToolsList input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => handleMCPSelectionChange(checkbox));
        });

        applyMCPSelections();

        console.log('✅ Loaded', mcps.length, 'MCP servers');

    } catch (error) {
        console.error('❌ Error loading MCP servers:', error);
        mcpToolsList.innerHTML = '';
    }
}

// Show/Hide Add MCP Form
window.showAddMCPForm = function() {
    const form = document.getElementById('addMCPForm');
    if (form) {
        form.style.display = 'block';
        // Focus on the label input
        setTimeout(() => {
            document.getElementById('newMcpLabel')?.focus();
        }, 100);
    }
}

window.hideAddMCPForm = function() {
    const form = document.getElementById('addMCPForm');
    if (form) {
        form.style.display = 'none';
        // Clear inputs
        document.getElementById('newMcpLabel').value = '';
        document.getElementById('newMcpUrl').value = '';
    }
}

// Add new MCP server
window.addNewMCPServer = async function() {
    const labelInput = document.getElementById('newMcpLabel');
    const urlInput = document.getElementById('newMcpUrl');

    const label = labelInput?.value.trim();
    const url = urlInput?.value.trim();

    // Validation
    if (!label) {
        alert('Please enter a label for the MCP server');
        labelInput?.focus();
        return;
    }

    if (!url) {
        alert('Please enter a URL for the MCP server');
        urlInput?.focus();
        return;
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL (e.g., https://example.com)');
        urlInput?.focus();
        return;
    }

    console.log('➕ Adding new MCP server:', label, url);

    try {
        // Get current settings
        const response = await fetch(`${API_BASE}/api/settings`);
        const data = await response.json();
        const currentMcps = data.settings?.mcps || [];

        // Check if URL already exists
        const exists = currentMcps.some(mcp =>
            (mcp.url || mcp.endpoint || '').trim() === url
        );

        if (exists) {
            alert('An MCP server with this URL already exists');
            return;
        }

        // Add new MCP to settings
        const newMcp = {
            label: label,
            name: label,
            url: url,
            endpoint: url,
            enabled: true
        };

        currentMcps.push(newMcp);

        // Save to backend
        const saveResponse = await fetch(`${API_BASE}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mcps: currentMcps
            })
        });

        if (!saveResponse.ok) {
            throw new Error('Failed to save MCP server');
        }

        console.log('✅ MCP server added successfully');

        // Hide form and clear inputs
        window.hideAddMCPForm();

        // Reload MCP list
        await loadMCPServers();

        // Auto-select the newly added MCP
        const checkboxes = document.querySelectorAll('#mcpToolsList input[type="checkbox"]');
        const lastCheckbox = checkboxes[checkboxes.length - 1];
        if (lastCheckbox) {
            lastCheckbox.checked = true;
            handleMCPSelectionChange(lastCheckbox);
        }

        // Show success message
        showSuccessMessage('MCP server added successfully!');

    } catch (error) {
        console.error('❌ Error adding MCP server:', error);
        alert(`Failed to add MCP server: ${error.message}`);
    }
}

// Helper function to show success message
function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn 0.3s ease-out;
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            document.body.removeChild(successDiv);
        }, 300);
    }, 3000);
}

// Load existing teammate from Firebase
async function loadExistingTeammate(teammateId) {
    try {
        console.log('🔄 [loadExistingTeammate] Loading existing teammate:', teammateId);
        console.log('📦 teammateDB object:', teammateDB);
        console.log('🔥 Firebase db:', db);

        if (!teammateDB || !db) {
            throw new Error('Firebase not initialized. teammateDB or db is undefined.');
        }

        const teammate = await teammateDB.get(teammateId);
        console.log('✅ Teammate loaded from Firebase:', teammate);

        if (!teammate) {
            console.log(`⚠️ Agent ${teammateId} has been deleted or doesn't exist`);
            alert(`This agent has been deleted.\n\nYou'll be redirected to the dashboard.`);
            window.location.href = 'index.html';
            return; // Stop execution
        }

        currentTeammateId = teammateId;
        console.log(`🎯 [loadExistingTeammate] Set currentTeammateId to: ${currentTeammateId}`);

        // Populate Step 1 form with teammate data
        const objectiveInput = document.querySelector('#step1 .form-input');
        const descriptionInput = document.querySelector('#step1 .form-textarea');

        if (objectiveInput) {
            objectiveInput.value = teammate.objective || teammate.name || '';
        }
        if (descriptionInput) {
            descriptionInput.value = teammate.description || '';
        }

        // Clear default tools
        const selectedToolsContainer = document.querySelector('.selected-tools');
        if (selectedToolsContainer) {
            selectedToolsContainer.innerHTML = '';
        }

        // Add teammate's tools
        if (teammate.tools && teammate.tools.length > 0) {
            teammate.tools.forEach(tool => addToolChip(tool));
        }

        // Populate Step 2 if work plan exists
        if (teammate.workPlan && teammate.workPlan.length > 0) {
            console.log('📋 Restoring work plan...');
            populateStep2(teammate.workPlan, teammate.clarifyingQuestions || []);

            // Restore clarifying answers if they exist
            if (teammate.clarifyingAnswers) {
                const questions = document.querySelectorAll('#step2 .question-card');
                Object.entries(teammate.clarifyingAnswers).forEach(([questionText, answer]) => {
                    questions.forEach(questionCard => {
                        const cardQuestionText = questionCard.querySelector('.question-text')?.textContent || '';
                        if (cardQuestionText === questionText) {
                            const answerInput = questionCard.querySelector('.answer-input');
                            if (answerInput) {
                                answerInput.value = answer;
                            }
                        }
                    });
                });
            }
        }

        // Track MCP selections for this agent
        selectedTeammateMCPs = Array.isArray(teammate.mcpServers)
            ? teammate.mcpServers.map(mcp => ({
                ...mcp,
                label: mcp.label || mcp.name || ''
            }))
            : [];
        applyMCPSelections();
        executionState.mcpServers = selectedTeammateMCPs;

        // Determine which step to show - prioritize saved currentStep
        const status = teammate.status || 'draft';

        // First check if there's a saved currentStep
        if (teammate.currentStep) {
            currentStep = teammate.currentStep;
            console.log('📍 Restoring to saved step:', currentStep);
        }
        // Otherwise, determine based on status and data
        else if (status === 'completed' && teammate.executionResults && teammate.executionResults.length > 0) {
            currentStep = 4; // If execution is complete, show Step 4 (Synthesis)
        } else if (status === 'executing' || (teammate.executionResults && teammate.executionResults.length > 0)) {
            currentStep = 3; // Show Step 3 for execution/results
        } else if (teammate.workPlan && teammate.workPlan.length > 0) {
            currentStep = 2; // Show Step 2 for review
        } else {
            currentStep = 1; // Default to Step 1
        }

        // Restore execution state if on Step 3 or 4
        if (currentStep >= 3 && teammate.executionResults) {
            executionState.workPlan = teammate.workPlan || [];
            executionState.clarifyingAnswers = teammate.clarifyingAnswers || {};
            executionState.results = teammate.executionResults || [];
            executionState.mcpServers = teammate.mcpServers || [];
            executionState.totalSteps = teammate.workPlan?.length || 0;
            executionState.completedSteps = teammate.executionResults?.length || 0;
        }

        // Populate Step 4 if that's where we are
        if (currentStep === 4) {
            setTimeout(() => {
                populateStep4();
            }, 300);
        }

        updateStepDisplay();
        console.log('✅ Loaded teammate successfully, showing step', currentStep);

        // Initialize current step
        if (currentStep === 3) {
            setTimeout(() => initializeStep3(), 300);
        }

    } catch (error) {
        console.error('❌ Error loading agent:', error);
        console.error('❌ Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        const errorMessage = `Failed to load agent: ${error.message}\n\nCheck the console for more details.`;
        alert(errorMessage);

        // Don't redirect immediately - give user time to see the error
        console.log('⚠️ Not redirecting to allow debugging. Reload page to try again.');
    }
}

// Make navigation functions globally available
window.nextStep = function() {
    if (currentStep < 4) {
        currentStep++;
        updateStepDisplay();
        window.scrollTo(0, 0);

        // Initialize Step 3 when entering it
        if (currentStep === 3) {
            initializeStep3();
        }

        // Initialize Step 4 when entering it
        if (currentStep === 4) {
            populateStep4();
        }
    }
}

// Start execution from Step 2 - moves to Step 3 and auto-starts execution
window.startExecutionFromStep2 = async function() {
    console.log('🚀 Starting execution from Step 2');

    // Move to Step 3
    currentStep = 3;
    updateStepDisplay();
    window.scrollTo(0, 0);

    // Initialize Step 3
    await initializeStep3();

    // Automatically start execution
    setTimeout(() => {
        startExecution();
    }, 500);
}

window.prevStep = function() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
        window.scrollTo(0, 0);
    }
}

window.goBack = function() {
    window.location.href = 'index.html';
}

window.skipClarifications = function() {
    // Skip to next step without answering questions
    window.nextStep();
}

// Helper function to get all available tools from Step 1
function getAllAvailableTools() {
    const tools = [];

    // Get regular tools
    const toolCheckboxes = document.querySelectorAll('#toolsList .tool-checkbox:not([id^="mcp-"])');
    toolCheckboxes.forEach(checkbox => {
        const toolName = checkbox.parentElement.querySelector('.tool-name')?.textContent.trim();
        if (toolName) {
            tools.push(toolName);
        }
    });

    // Get MCP servers
    const mcpCheckboxes = document.querySelectorAll('#mcpToolsList .tool-checkbox');
    mcpCheckboxes.forEach(checkbox => {
        const label = checkbox.dataset.label || checkbox.value;
        if (label) {
            tools.push(label);
        }
    });

    return tools;
}

// Make createAgent available globally
window.createAgent = async function() {
    console.log('🚀 createAgent called!');

    // Get form values
    const objective = document.querySelector('#step1 .form-input').value.trim();
    const description = document.querySelector('#step1 .form-textarea').value.trim();

    console.log('📝 Form values:', { objective, description });

    // Get selected tools from checkboxes
    const toolCheckboxes = document.querySelectorAll('#toolsList .tool-checkbox:checked:not([id^="mcp-"])');
    const tools = Array.from(toolCheckboxes).map(checkbox => {
        return checkbox.parentElement.querySelector('.tool-name').textContent.trim();
    });

    console.log('🔧 Regular tools selected:', tools);
    console.log('✅ Excel tool selected?', tools.some(t => t.toLowerCase().includes('excel')));

    // Get selected MCP servers
    const mcpCheckboxes = document.querySelectorAll('#mcpToolsList input[type="checkbox"]:checked');
    const selectedMCPs = Array.from(mcpCheckboxes).map(checkbox => {
        const label = checkbox.dataset.label || checkbox.value;
        return {
            label,
            name: label,
            url: checkbox.dataset.url || '',
            enabled: true
        };
    });
    selectedTeammateMCPs = selectedMCPs;

    console.log('🔌 MCP servers selected:', selectedMCPs);

    // Validation
    if (!objective) {
        alert('Please enter an objective for your teammate');
        return;
    }

    if (!description) {
        alert('Please enter a description for your teammate');
        return;
    }

    console.log('✅ Validation passed!');

    // Prepare teammate data
    const teammateData = {
        name: objective.substring(0, 100), // Use objective as name
        objective: objective,
        description: description,
        tools: tools,
        mcpServers: selectedMCPs, // Include selected MCP servers
        status: 'draft'
    };

    console.log('📦 Teammate data prepared:', teammateData);

    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    console.log('🔄 Loading overlay element:', loadingOverlay);
    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
        console.log('✅ Loading overlay activated');
    } else {
        console.log('⚠️ Loading overlay not found!');
    }

    // Show loading state on button
    const createBtn = document.querySelector('#step1 .btn-primary');
    console.log('🔘 Create button:', createBtn);
    const originalText = createBtn.textContent;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating Teammate...';
    console.log('✅ Button state updated');

    try {
        // Ensure Firebase is initialized
        if (!db) {
            console.log('🔄 Initializing Firebase before creating teammate...');
            const initialized = initFirebase();
            if (!initialized) {
                throw new Error('Failed to initialize Firebase. Please refresh the page and try again.');
            }
            // Wait a moment for initialization to complete
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('💾 Saving teammate to Firebase...');
        console.log('Teammate data:', teammateData);
        
        // Save or update to Firebase
        if (currentTeammateId) {
            // Update existing teammate
            await teammateDB.update(currentTeammateId, {
                ...teammateData,
                currentStep: 2 // Moving to Step 2
            });
            console.log('✅ Teammate updated successfully:', currentTeammateId);
        } else {
            // Create new agent
            const savedTeammate = await teammateDB.create({
                ...teammateData,
                currentStep: 1
            });
            currentTeammateId = savedTeammate.id;
            console.log('✅ Teammate created successfully with ID:', currentTeammateId);
        }
        
        // Generate work plan and clarifying questions for Step 2
        console.log('🤖 Generating AI work plan...');
        await generateWorkPlan();

        // Hide loading overlay
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }

        // Move to step 2
        currentStep = 2;
        updateStepDisplay();
        window.scrollTo(0, 0);

    } catch (error) {
        console.error('❌ Error creating teammate:', error);

        // Hide loading overlay
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }

        // Show specific error message
        let errorMessage = 'Failed to create teammate. ';
        if (error.code === 'permission-denied') {
            errorMessage += 'Permission denied. Please check Firebase security rules.';
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Please try again.';
        }

        alert(errorMessage);

        // Reset button
        createBtn.disabled = false;
        createBtn.textContent = originalText;
    }
}

function updateStepDisplay() {
    // Update step indicators
    document.querySelectorAll('.step-item').forEach((item, index) => {
        const stepNumber = index + 1;
        item.classList.remove('active', 'completed');
        
        if (stepNumber === currentStep) {
            item.classList.add('active');
        } else if (stepNumber < currentStep) {
            item.classList.add('completed');
        }
    });
    
    // Update step content
    document.querySelectorAll('.step-content').forEach((content, index) => {
        const stepNumber = index + 1;
        content.classList.remove('active');
        
        if (stepNumber === currentStep) {
            content.classList.add('active');
        }
    });
}

// Tool management
document.addEventListener('click', function(e) {
    // Remove tool chip
    if (e.target.classList.contains('tool-remove')) {
        const chip = e.target.closest('.tool-chip');
        if (!chip) return;

        const toolId = chip.dataset.toolId;
        if (toolId && toolId.startsWith('mcp-')) {
            const checkbox = document.querySelector(`#mcpSelection input[data-tool-id="${toolId}"]`);
            if (checkbox) {
                checkbox.checked = false;
                handleMCPSelectionChange(checkbox);
                return;
            }
        }

        chip.remove();
    }
    
    // Add tool from suggestions
    if (e.target.classList.contains('tool-suggestion')) {
        const toolName = e.target.textContent.replace('+ ', '').trim();
        addToolChip(toolName);
    }
    
    // Delete workplan step
    if (e.target.classList.contains('btn-delete')) {
        console.log('🗑️ Delete button clicked');
        e.preventDefault(); // Prevent any default behavior
        const step = e.target.closest('.workplan-step');
        if (step) {
            console.log('✅ Removing step');
            step.remove();
            renumberSteps();
        } else {
            console.error('❌ Could not find .workplan-step parent');
        }
    }
});

// Add tool from input
document.querySelector('.btn-add')?.addEventListener('click', function() {
    const input = document.querySelector('.tool-input');
    const toolName = input.value.trim();
    
    if (toolName) {
        addToolChip(toolName);
        input.value = '';
    }
});

function addToolChip(toolName, toolId = null) {
    const container = document.querySelector('.selected-tools');
    if (!container) return;
    
    const normalizedId = toolId || `tool-${toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const existingById = container.querySelector(`.tool-chip[data-tool-id="${normalizedId}"]`);
    if (existingById) {
        return existingById;
    }
    
    const existingByName = Array.from(container.querySelectorAll('.tool-chip')).find(chip => {
        return chip.querySelector('span')?.textContent.trim() === toolName;
    });
    if (existingByName) {
        return existingByName;
    }
    
    const chip = document.createElement('div');
    chip.className = 'tool-chip';
    chip.dataset.toolId = normalizedId;
    chip.innerHTML = `
        <span>${toolName}</span>
        <button class="tool-remove">×</button>
    `;
    
    container.appendChild(chip);
    return chip;
}

function removeToolChip(toolId) {
    const chip = document.querySelector(`.tool-chip[data-tool-id="${toolId}"]`);
    if (chip) {
        chip.remove();
    }
}

function clearAllMCPChips() {
    document.querySelectorAll('.tool-chip[data-tool-id^="mcp-"]').forEach(chip => chip.remove());
}

function getCheckedMCPs() {
    return Array.from(document.querySelectorAll('#mcpToolsList input[type="checkbox"]:checked')).map(checkbox => {
        const label = checkbox.dataset.label || checkbox.value;
        return {
            label,
            name: label,
            url: checkbox.dataset.url || '',
            enabled: true
        };
    });
}

function handleMCPSelectionChange(checkbox) {
    const toolId = checkbox.dataset.toolId || '';
    const label = checkbox.value;
    if (!label) return;

    // Find the parent MCP server item
    const mcpItem = checkbox.closest('.mcp-server-item');
    const badge = mcpItem?.querySelector('.mcp-selected-badge');

    if (checkbox.checked) {
        const chipLabel = `${label} (MCP Server)`;
        addToolChip(chipLabel, toolId);

        // Show the SELECTED badge
        if (badge) {
            badge.style.display = 'inline-block';
        }
        // Highlight the item
        if (mcpItem) {
            mcpItem.style.background = '#e0f2fe';
            mcpItem.style.borderColor = '#0284c7';
            mcpItem.style.borderWidth = '2px';
        }
    } else {
        removeToolChip(toolId);

        // Hide the SELECTED badge
        if (badge) {
            badge.style.display = 'none';
        }
        // Remove highlight
        if (mcpItem) {
            mcpItem.style.background = '#f0f9ff';
            mcpItem.style.borderColor = '#bae6fd';
            mcpItem.style.borderWidth = '2px';
        }
    }

    selectedTeammateMCPs = getCheckedMCPs();
    executionState.mcpServers = selectedTeammateMCPs;

    console.log('🔌 MCP Selection Updated:', selectedTeammateMCPs.map(m => m.label).join(', ') || 'None');
}

function applyMCPSelections() {
    const checkboxes = document.querySelectorAll('#mcpToolsList input[type="checkbox"]');
    if (!checkboxes.length) return;

    const selectedUrls = new Set(
        (selectedTeammateMCPs || []).map(mcp => (mcp && (mcp.url || mcp.endpoint || '')).trim()).filter(Boolean)
    );

    checkboxes.forEach(checkbox => {
        const url = (checkbox.dataset.url || '').trim();
        const shouldSelect = selectedUrls.has(url);
        checkbox.checked = shouldSelect;
        handleMCPSelectionChange(checkbox);
    });

    selectedTeammateMCPs = getCheckedMCPs();
    executionState.mcpServers = selectedTeammateMCPs;
}

// Add workplan step
document.querySelector('.btn-add-step')?.addEventListener('click', function() {
    const stepsContainer = document.querySelector('.workplan-steps');
    if (!stepsContainer) return;

    const stepCount = stepsContainer.querySelectorAll('.workplan-step').length + 1;

    // Get available tools
    const availableTools = getAllAvailableTools();
    const toolsHtml = availableTools.length > 0
        ? `<div class="step-label" style="margin-top: 12px;">Tools</div>
           <div class="step-tools-checkboxes" style="display: flex; flex-direction: column; gap: 8px; padding: 8px 0;">
               ${availableTools.map(tool => `
                   <label class="tool-checkbox-label" style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                       <input type="checkbox"
                              class="step-tool-checkbox"
                              value="${tool}"
                              style="cursor: pointer;">
                       <span>${tool}</span>
                   </label>
               `).join('')}
           </div>`
        : '';

    const newStep = document.createElement('div');
    newStep.className = 'workplan-step';
    newStep.innerHTML = `
        <div class="step-handle">::</div>
        <div class="step-number">${stepCount}</div>
        <div class="step-content-box">
            <div class="step-label">Step</div>
            <input type="text" class="step-input" placeholder="Enter step title">
            <div class="step-label">Description</div>
            <textarea class="step-textarea" rows="2" placeholder="Enter step description"></textarea>
            ${toolsHtml}
        </div>
        <button class="btn-delete">×</button>
    `;

    stepsContainer.appendChild(newStep);
});

function renumberSteps() {
    const steps = document.querySelectorAll('.workplan-step');
    steps.forEach((step, index) => {
        const numberElement = step.querySelector('.step-number');
        if (numberElement) {
            numberElement.textContent = index + 1;
        }
    });
}

// Tab switching (Step 4)
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        // In a real implementation, you would switch tab content here
        console.log('Switched to tab:', this.textContent);
    });
});

// Update clarification questions progress
document.querySelectorAll('.answer-input').forEach(input => {
    input.addEventListener('input', updateQuestionsProgress);
});

function updateQuestionsProgress() {
    const inputs = document.querySelectorAll('.answer-input');
    const totalQuestions = inputs.length;
    const answeredQuestions = Array.from(inputs).filter(input => input.value.trim() !== '').length;
    
    const progressElement = document.querySelector('.questions-progress');
    if (progressElement) {
        progressElement.textContent = `${answeredQuestions} of ${totalQuestions} answered`;
    }
}

// Generate AI work plan and clarifying questions for Step 2
async function generateWorkPlan() {
    try {
        // Get teammate data
        const teammate =currentTeammateId ? await teammateDB.get(currentTeammateId) : {
            objective: document.querySelector('#step1 .form-input').value.trim(),
            description: document.querySelector('#step1 .form-textarea').value.trim(),
            tools: Array.from(document.querySelectorAll('#step1 .tool-chip'))
                .map(chip => chip.querySelector('span').textContent.trim()),
            mcpServers: getCheckedMCPs()
        };
        
        console.log('Calling AI API to generate work plan...');
        console.log('Selected MCP servers:', teammate.mcpServers);
        executionState.mcpServers = teammate.mcpServers || [];

        // Get project context (async from Firebase)
        const projectContext = await getProjectContextAsync();
        if (projectContext) {
            console.log('📋 Including project context in work plan generation');
        }

        // Call backend API to generate work plan
        const response = await fetch(`${API_BASE}/api/agents/generate-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                objective: teammate.objective,
                description: teammate.description,
                tools: teammate.tools,
                mcpServers: teammate.mcpServers,
                projectContext: projectContext
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate work plan');
        }
        
        const data = await response.json();
        console.log('✅ Generated work plan:', data);
        
        // Populate Step 2 with generated work plan
        populateStep2(data.workPlan, data.questions);
        
        // Save work plan to Firebase
        if (currentTeammateId) {
            await teammateDB.update(currentTeammateId, {
                workPlan: data.workPlan,
                clarifyingQuestions: data.questions,
                currentStep: 2,
                status: 'planning'
            });
            console.log('✅ Saved work plan to Firebase');
        }
        
    } catch (error) {
        console.error('❌ Error generating work plan:', error);
        alert(`Failed to generate work plan: ${error.message}\n\nMake sure the backend server is running at ${API_BASE}.`);
    }
}

// Populate Step 2 with work plan and questions
function populateStep2(workPlan, questions) {
    // Populate work plan steps
    const stepsContainer = document.querySelector('.workplan-steps');
    if (stepsContainer && workPlan) {
        // Get available tools from Step 1
        const availableTools = getAllAvailableTools();

        stepsContainer.innerHTML = workPlan.map((step, index) => {
            // Escape special characters in strings
            const safeTitle = (step.title || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const safeDescription = (step.description || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

            // Generate interactive tool checkboxes
            const toolsHtml = availableTools.length > 0
                ? `<div class="step-label" style="margin-top: 12px;">Tools</div>
                   <div class="step-tools-checkboxes" style="display: flex; flex-direction: column; gap: 8px; padding: 8px 0;">
                       ${availableTools.map(tool => {
                           const isChecked = step.tools && step.tools.some(t =>
                               t.toLowerCase() === tool.toLowerCase() ||
                               t.toLowerCase().includes(tool.toLowerCase().replace(/[^\w]/g, ''))
                           );
                           return `
                               <label class="tool-checkbox-label" style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                                   <input type="checkbox"
                                          class="step-tool-checkbox"
                                          value="${tool}"
                                          ${isChecked ? 'checked' : ''}
                                          style="cursor: pointer;">
                                   <span>${tool}</span>
                               </label>
                           `;
                       }).join('')}
                   </div>`
                : '';

            return `
                <div class="workplan-step" data-step-index="${index}">
                    <div class="step-handle">::</div>
                    <div class="step-number">${index + 1}</div>
                    <div class="step-content-box">
                        <div class="step-label">Step</div>
                        <input type="text" class="step-input" value="${safeTitle}">
                        <div class="step-label">Description</div>
                        <textarea class="step-textarea" rows="2">${safeDescription}</textarea>
                        ${toolsHtml}
                    </div>
                    <button type="button" class="btn-delete">×</button>
                </div>
            `;
        }).join('');

        // Note: Delete button handlers are managed by document-level delegation (see line ~825)
        // No need to re-attach listeners here
    }
    
    // Populate clarifying questions
    if (questions && questions.length > 0) {
        const questionsContainer = document.querySelector('.clarification-section');
        const existingQuestions = questionsContainer?.querySelectorAll('.question-card');
        
        // Clear existing questions
        if (existingQuestions) {
            existingQuestions.forEach(q => q.remove());
        }
        
        // Add new questions
        questions.forEach((question, index) => {
            if (!questionsContainer) return;
            
            const questionCard = document.createElement('div');
            questionCard.className = 'question-card';
            
            // Safely escape the question text
            const safeQuestion = (question || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            questionCard.innerHTML = `
                <div class="question-icon">?</div>
                <div class="question-content">
                    <div class="question-text">${safeQuestion}</div>
                    <textarea class="answer-input" placeholder="Enter your answer..." rows="2"></textarea>
                </div>
            `;
            questionsContainer.appendChild(questionCard);
        });
        
        // Update progress
        const progressElement = document.querySelector('.questions-progress');
        if (progressElement) {
            progressElement.textContent = `0 of ${questions.length} answered`;
        }
        
        // Re-attach input listeners for progress tracking
        document.querySelectorAll('.answer-input').forEach(input => {
            input.addEventListener('input', updateQuestionsProgress);
        });
    }
    
    console.log('✅ Step 2 populated with', workPlan.length, 'steps and', questions.length, 'questions');
}

function skipClarifications() {
    // Hide questions and show ready banner
    const questionsSection = document.querySelector('.clarification-questions');
    const readyBanner = document.getElementById('readyBanner');
    const clarificationActions = document.querySelector('.clarification-actions');
    const actionsContainer = questionsSection.parentElement.querySelector('.step-footer');
    
    if (questionsSection) {
        // Show skip message
        questionsSection.innerHTML = `
            <div class="skip-message">
                <div class="skip-icon">→</div>
                <div class="skip-text">
                    <h3>Skipping Clarifying Questions</h3>
                    <p>The teammate will proceed with default assumptions and approaches.</p>
                </div>
                <button class="btn-secondary" onclick="undoSkip()">Back</button>
            </div>
        `;
    }
    
    if (readyBanner) {
        readyBanner.style.display = 'block';
    }
    
    if (clarificationActions) {
        clarificationActions.style.display = 'none';
    }
    
    if (actionsContainer) {
        actionsContainer.innerHTML = `
            <button class="btn-secondary" onclick="prevStep()">Previous</button>
            <div class="phase-indicator">Phase 2 of 4</div>
            <button class="btn-primary" onclick="nextStep()">Next → Execution</button>
        `;
    }
}

function undoSkip() {
    // Undo skip and restore questions
    populateClarifyingQuestions();
}

// Enhanced helper method - extract clarifying answers if provided
function getClarificationAnswers() {
    const answerInputs = document.querySelectorAll('.answer-input');
    const answers = {};

    answerInputs.forEach((input, index) => {
        const value = input.value.trim();
        if (value) {
            answers[index] = value;
        }
    });

    return answers;
}

// ============================================================================
// STEP 3: EXECUTION
// ============================================================================

let executionState = {
    workPlan: [],
    clarifyingAnswers: {},
    mcpServers: [],
    currentStepIndex: -1,
    completedSteps: 0,
    totalSteps: 0,
    isRunning: false,
    results: []
};

// Initialize Step 3 with work plan data
async function initializeStep3() {
    console.log('🚀 Initializing Step 3: Execution');

    // Try to load saved execution results first
    if (currentTeammateId) {
        const teammate =await teammateDB.get(currentTeammateId);
        if (teammate.executionResults && teammate.executionResults.length > 0) {
            console.log('📦 Loading saved execution results from Firebase');

            // Restore execution state
            executionState.workPlan = teammate.workPlan || [];
            executionState.clarifyingAnswers = teammate.clarifyingAnswers || {};
            executionState.results = teammate.executionResults || [];
            executionState.totalSteps = teammate.workPlan?.length || 0;
            executionState.completedSteps = teammate.executionResults?.length || 0;

            // Mark all completed steps
            executionState.workPlan.forEach((step, index) => {
                if (index < executionState.completedSteps) {
                    step.status = 'completed';
                }
            });

            // Update UI with saved data
            updateExecutionProgress();

            // Restore logs
            const logSection = document.querySelector('#step3 .log-section');
            if (logSection) {
                const existingLogs = logSection.querySelectorAll('.log-entry');
                existingLogs.forEach(log => log.remove());
            }

            executionState.results.forEach((result, index) => {
                addLogEntry({
                    type: 'success',
                    title: `Step ${index + 1}: ${result.title}`,
                    message: result.summary,
                    status: 'completed'
                });
            });

            console.log('✅ Loaded', executionState.results.length, 'saved results');
            return;
        }
    }

    // Get work plan from Step 2
    const workPlanSteps = document.querySelectorAll('#step2 .workplan-step');
    executionState.workPlan = Array.from(workPlanSteps).map(stepElement => {
        return {
            title: stepElement.querySelector('.step-input')?.value || '',
            description: stepElement.querySelector('.step-textarea')?.value || '',
            tools: Array.from(stepElement.querySelectorAll('.tool-badge') || [])
                .map(badge => badge.textContent.trim()),
            status: 'pending'
        };
    });

    // Get clarifying answers from Step 2
    const questions = document.querySelectorAll('#step2 .question-card');
    questions.forEach((questionCard, index) => {
        const questionText = questionCard.querySelector('.question-text')?.textContent || '';
        const answerText = questionCard.querySelector('.answer-input')?.value || '';
        if (answerText) {
            executionState.clarifyingAnswers[questionText] = answerText;
        }
    });

    executionState.totalSteps = executionState.workPlan.length;
    executionState.completedSteps = 0;

    // Update UI
    updateExecutionProgress();

    // Clear old logs
    const logSection = document.querySelector('#step3 .log-section');
    if (logSection) {
        const existingLogs = logSection.querySelectorAll('.log-entry');
        existingLogs.forEach(log => log.remove());
    }

    // Save clarifying answers and status to Firebase when entering Step 3
    if (currentTeammateId) {
        try {
            await teammateDB.update(currentTeammateId, {
                clarifyingAnswers: executionState.clarifyingAnswers,
                currentStep: 3,
                status: 'planning' // About to start execution
            });
            console.log('💾 Saved clarifying answers to Firebase');
        } catch (error) {
            console.error('❌ Error saving clarifying answers:', error);
        }
    }

    console.log('✅ Step 3 initialized with', executionState.totalSteps, 'steps');
    console.log('📋 Work Plan:', executionState.workPlan);
    console.log('❓ Clarifying Answers:', executionState.clarifyingAnswers);
}

// Start execution when button is clicked
window.startExecution = async function() {
    if (executionState.isRunning) {
        console.log('⚠️ Execution already running');
        return;
    }

    console.log('▶️ Starting backend-orchestrated execution...');
    console.log('📦 JavaScript version: 1762226725098 - Backend execution enabled');

    // Prepare execution data
    executionState.mcpServers = selectedTeammateMCPs || executionState.mcpServers || [];
    executionState.isRunning = true;
    executionState.currentStepIndex = -1;
    executionState.results = [];

    // Update teammate status to 'executing' when starting
    if (currentTeammateId) {
        try {
            await teammateDB.update(currentTeammateId, {
                status: 'executing',
                executionStartedAt: new Date().toISOString()
            });
            console.log('💾 Updated teammate status to executing');
        } catch (error) {
            console.error('❌ Error updating teammate status:', error);
        }
    }

    // Get teammate context
    const teammate = currentTeammateId ? await teammateDB.get(currentTeammateId) : null;
    const objective = teammate?.objective || document.querySelector('#step1 .form-input')?.value || '';
    const description = teammate?.description || document.querySelector('#step1 .form-input[placeholder*="description"]')?.value || '';

    // Build base context
    const contextParts = [
        `TEAMMATEOBJECTIVE: ${objective}`,
        description ? `TASK DESCRIPTION: ${description}` : ''
    ];

    // Add project context if available (async from Firebase)
    const projectContext = await getProjectContextAsync();
    if (projectContext) {
        contextParts.push(projectContext);
        console.log('📋 Including project context in execution');
    }

    // Add clarifying answers if any
    if (Object.keys(executionState.clarifyingAnswers).length > 0) {
        contextParts.push('\nCLARIFYING INFORMATION:');
        Object.entries(executionState.clarifyingAnswers).forEach(([question, answer]) => {
            contextParts.push(`Q: ${question}`);
            contextParts.push(`A: ${answer}`);
        });
    }

    const baseContext = contextParts.filter(Boolean).join('\n');

    try {
        // Call backend to start execution in background
        console.log('🚀 Calling backend execute-all endpoint...');

        const response = await fetch(`${API_BASE}/api/agents/${currentTeammateId}/execute-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                workPlan: executionState.workPlan,
                mcpServers: executionState.mcpServers,
                context: {
                    baseContext,
                    objective,
                    description,
                    clarifyingAnswers: executionState.clarifyingAnswers
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to start execution');
        }

        const data = await response.json();
        console.log('✅ Backend execution started:', data);

        addLogEntry({
            type: 'info',
            title: 'Execution Started',
            message: `Running ${data.totalSteps} steps in the background. You can safely close this tab - execution will continue on the server.`,
            status: 'running'
        });

    } catch (error) {
        console.error('❌ Error starting backend execution:', error);

        executionState.isRunning = false;

        addLogEntry({
            type: 'error',
            title: 'Execution Failed to Start',
            message: error.message,
            status: 'failed'
        });

        alert(`Failed to start execution: ${error.message}`);

        // Update teammate status back to draft
        if (currentTeammateId) {
            try {
                await teammateDB.update(currentTeammateId, {
                    status: 'draft'
                });
            } catch (updateError) {
                console.error('Error updating teammate status:', updateError);
            }
        }
    }
}

// Execute a single step using AI
async function executeStep(stepIndex) {
    const step = executionState.workPlan[stepIndex];
    console.log(`📍 Executing Step ${stepIndex + 1}:`, step.title);

    // Mark step as running
    step.status = 'running';
    updateExecutionProgress();

    // Add log entry for step start
    addLogEntry({
        type: 'info',
        title: `Step ${stepIndex + 1}: ${step.title}`,
        message: 'Starting execution...',
        status: 'running'
    });

    try {
        // Get teammate context
        const teammate =currentTeammateId ? await teammateDB.get(currentTeammateId) : null;
        const objective = teammate?.objective || document.querySelector('#step1 .form-input')?.value || '';
        const description = teammate?.description || document.querySelector('#step1 .form-input[placeholder*="description"]')?.value || '';

        // Build context for AI
        const contextParts = [
            `TEAMMATEOBJECTIVE: ${objective}`,
            description ? `TASK DESCRIPTION: ${description}` : '',
            `\nCURRENT STEP (${stepIndex + 1}/${executionState.totalSteps}):`,
            `Title: ${step.title}`,
            `Description: ${step.description}`,
            step.tools.length > 0 ? `Tools Available: ${step.tools.join(', ')}` : ''
        ];

        // Add clarifying answers if any
        if (Object.keys(executionState.clarifyingAnswers).length > 0) {
            contextParts.push('\nCLARIFYING INFORMATION:');
            Object.entries(executionState.clarifyingAnswers).forEach(([question, answer]) => {
                contextParts.push(`Q: ${question}`);
                contextParts.push(`A: ${answer}`);
            });
        }

        // Add previous step results as context
        if (executionState.results.length > 0) {
            contextParts.push('\nPREVIOUS STEP RESULTS:');
            executionState.results.forEach((result, idx) => {
                contextParts.push(`Step ${idx + 1}: ${result.summary}`);
            });
        }

        const context = contextParts.filter(Boolean).join('\n');

        // Log MCP servers being used
        if (executionState.mcpServers && executionState.mcpServers.length > 0) {
            const mcpNames = executionState.mcpServers.map(m => m.label || m.name).join(', ');
            addLogEntry({
                type: 'info',
                title: `Step ${stepIndex + 1}: MCP Servers Available`,
                message: `Using MCP servers: ${mcpNames}`,
                status: 'info'
            });
        }

        // Check if this is an Excel generation request
        const hasExcelTool = step.tools && step.tools.some(tool => {
            const toolLower = tool.toLowerCase();
            return toolLower.includes('excel') ||
                   toolLower.includes('📊') ||
                   tool === 'excel-generation';
        });
        const isExcelRequest = hasExcelTool ||
                               objective.toLowerCase().includes('excel') ||
                               description.toLowerCase().includes('excel') ||
                               objective.toLowerCase().includes('spreadsheet') ||
                               description.toLowerCase().includes('spreadsheet') ||
                               step.title.toLowerCase().includes('excel');

        console.log('🔍 Excel Detection:', {
            hasExcelTool,
            isExcelRequest,
            stepTools: step.tools,
            objective,
            description: description?.substring(0, 100)
        });

        // Use Excel-specific endpoint if detected
        const endpoint = isExcelRequest ? '/api/agents/execute-with-excel' : '/api/agents/execute-step';

        console.log(`📡 Calling endpoint: ${endpoint}`);

        // Prepare request body based on endpoint
        const requestBody = isExcelRequest ? {
            agentId: currentTeammateId,
            stepIndex: stepIndex,
            userPrompt: step.description,
            objective: objective,
            description: description
        } : {
            stepIndex: stepIndex,
            stepTitle: step.title,
            stepDescription: step.description,
            tools: step.tools,
            context: context,
            mcpServers: executionState.mcpServers || []
        };

        console.log('📦 Request body:', requestBody);

        // Call backend to execute the step
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Failed to execute step');
        }

        const data = await response.json();
        console.log(`✅ Step ${stepIndex + 1} completed:`, data);
        console.log('📥 Full response data:', JSON.stringify(data, null, 2));

        // Check for Excel file
        if (data.downloadUrl) {
            console.log('📊 Excel file generated:', data.filename);
            console.log('📥 Download URL:', data.downloadUrl);
            console.log('✅ Download will be available in Step 4!');
        } else {
            console.log('ℹ️ No downloadUrl in response');
        }

        // Mark step as completed
        step.status = 'completed';
        executionState.completedSteps++;

        // Store result
        executionState.results.push({
            stepIndex: stepIndex,
            title: step.title,
            summary: data.summary || data.result || data.message || 'Step completed successfully',
            details: data.details || data.result || '',
            artifacts: data.artifacts || [],
            nextSteps: data.nextSteps || [],
            downloadUrl: data.downloadUrl || null,
            filename: data.filename || null,
            timestamp: new Date().toISOString(),
            reported: false,
            reportedAt: null
        });

        // Update UI
        updateExecutionProgress();

        // Update log entry
        addLogEntry({
            type: 'success',
            title: `Step ${stepIndex + 1}: ${step.title}`,
            message: data.summary || 'Step completed successfully',
            status: 'completed'
        });

        // Save to Firebase after each step
        await saveExecutionProgress();

        // Small delay between steps for better UX
        await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
        console.error(`❌ Error executing Step ${stepIndex + 1}:`, error);

        step.status = 'failed';
        updateExecutionProgress();

        addLogEntry({
            type: 'error',
            title: `Step ${stepIndex + 1}: ${step.title}`,
            message: `Error: ${error.message}`,
            status: 'failed'
        });

        // Ask user if they want to continue
        const shouldContinue = confirm(`Step ${stepIndex + 1} failed: ${error.message}\n\nContinue with remaining steps?`);
        if (!shouldContinue) {
            executionState.isRunning = false;
            throw error;
        }
    }
}

// Save execution progress to Firebase
async function saveExecutionProgress() {
    if (!currentTeammateId) {
        console.warn('⚠️ No teammate ID, skipping Firebase save');
        return;
    }

    try {
        console.log('💾 Saving execution progress to Firebase...');

        await teammateDB.update(currentTeammateId, {
            workPlan: executionState.workPlan,
            clarifyingAnswers: executionState.clarifyingAnswers,
            executionResults: executionState.results,
            mcpServers: executionState.mcpServers,
            executionCompleted: executionState.completedSteps === executionState.totalSteps,
            lastExecutionUpdate: new Date().toISOString(),
            status: executionState.completedSteps === executionState.totalSteps ? 'completed' : 'executing',
            currentStep: executionState.completedSteps === executionState.totalSteps ? 4 : 3
        });

        console.log('✅ Execution progress saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving execution progress:', error);
        // Don't throw - we don't want to stop execution if save fails
    }
}

// Update execution progress UI
function updateExecutionProgress() {
    const totalSteps = executionState.totalSteps;
    const completedSteps = executionState.completedSteps;
    const runningSteps = executionState.workPlan.filter(s => s.status === 'running').length;
    const pendingSteps = totalSteps - completedSteps - runningSteps;

    // Update progress bar
    const progressFill = document.querySelector('#step3 .progress-fill');
    const progressText = document.querySelector('#step3 .progress-text');
    if (progressFill && progressText) {
        const percentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
        progressFill.style.width = percentage + '%';
        progressText.textContent = `${completedSteps} of ${totalSteps} tasks completed`;
    }

    // Update status cards
    const completedCard = document.querySelector('#step3 .status-card.completed .status-value');
    const runningCard = document.querySelector('#step3 .status-card.running .status-value');
    const pendingCard = document.querySelector('#step3 .status-card.pending .status-value');

    if (completedCard) completedCard.textContent = completedSteps;
    if (runningCard) runningCard.textContent = runningSteps;
    if (pendingCard) pendingCard.textContent = pendingSteps;
}

// Add log entry to execution log
function addLogEntry({ type, title, message, status }) {
    const logSection = document.querySelector('#step3 .log-section');
    if (!logSection) return;

    // Find or create container for log entries
    let logContainer = logSection.querySelector('.log-entries');
    if (!logContainer) {
        // Remove the h3 temporarily
        const h3 = logSection.querySelector('h3');
        logSection.innerHTML = '';
        if (h3) logSection.appendChild(h3);

        logContainer = document.createElement('div');
        logContainer.className = 'log-entries';
        logSection.appendChild(logContainer);
    }

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${status || type}`;

    const icon = status === 'completed' ? '✓' :
                 status === 'running' ? '⟳' :
                 status === 'failed' ? '✗' : 'ℹ';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

    logEntry.innerHTML = `
        <div class="log-icon">${icon}</div>
        <div class="log-content">
            <div class="log-title">${title}</div>
            <div class="log-message">${message}</div>
        </div>
        <div class="log-time">${timeStr}</div>
    `;

    logContainer.appendChild(logEntry);

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Synthesize all execution results using AI
async function synthesizeResults() {
    try {
        console.log('🔍 Synthesizing all execution results...');

        const teammate =currentTeammateId ? await teammateDB.get(currentTeammateId) : null;
        const objective = teammate?.objective || document.querySelector('#step1 .form-input')?.value || '';
        const description = teammate?.description || document.querySelector('#step1 .form-input[placeholder*="description"]')?.value || '';

        // Get project context (async from Firebase)
        const projectContext = await getProjectContextAsync();
        if (projectContext) {
            console.log('📋 Including project context in synthesis');
        }

        // Build results context from all step results
        const resultsContext = executionState.results.map((result, idx) => {
            return `STEP ${idx + 1}: ${result.title}
Summary: ${result.summary}
Details: ${typeof result.details === 'string' ? result.details : JSON.stringify(result.details)}
`;
        }).join('\n\n');

        const response = await fetch(`${API_BASE}/api/agents/synthesize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                objective: objective,
                description: description,
                projectContext: projectContext,
                clarifyingAnswers: executionState.clarifyingAnswers || {},
                results: executionState.results,
                resultsContext: resultsContext,
                mcpServers: executionState.mcpServers || []
            })
        });

        if (!response.ok) {
            throw new Error('Failed to synthesize results');
        }

        const data = await response.json();
        console.log('✅ Synthesis completed:', data.synthesis);

        // Store synthesis in execution state
        executionState.synthesis = data.synthesis;

        // Save to Firebase
        if (currentTeammateId) {
            await teammateDB.update(currentTeammateId, {
                synthesis: data.synthesis,
                synthesisCompletedAt: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('❌ Error synthesizing results:', error);
        // Continue anyway - we can still show individual step results
    }
}

// Populate Step 4 with execution results
async function populateStep4() {
    console.log('📊 ========== POPULATE STEP 4 START ==========');
    console.log('📊 Populating Step 4 with results');
    console.log('📊 currentTeammateId:', currentTeammateId);
    console.log('📊 Execution State:', executionState);
    console.log('📊 Results count:', executionState.results?.length || 0);

    // Fetch holistic insights from the global insights API
    let holisticInsights = [];
    try {
        console.log(`🌐 [populateStep4] Fetching insights from ${API_BASE}/api/insights`);
        const response = await fetch(`${API_BASE}/api/insights`);
        const data = await response.json();
        console.log(`📊 [populateStep4] Fetched ${data.insights?.length || 0} total insights from API`);
        console.log(`📊 [populateStep4] Current agent ID (currentTeammateId): ${currentTeammateId}`);
        console.log(`📊 [populateStep4] All insights agentIds:`, data.insights?.map(i => ({id: i.agentId, name: i.agentName, text: i.text?.substring(0, 50)})));

        // Filter insights for this specific agent
        holisticInsights = (data.insights || []).filter(insight => {
            const matches = insight.agentId === currentTeammateId;
            if (matches) {
                console.log(`✅ [populateStep4] Match found: ${insight.text?.substring(0, 100)}`);
            }
            return matches;
        });
        console.log(`📊 [populateStep4] Filtered to ${holisticInsights.length} holistic insights for agent ${currentTeammateId}`);
        if (holisticInsights.length > 0) {
            console.log(`📊 [populateStep4] Holistic insights:`, holisticInsights);
        } else {
            console.warn(`⚠️ [populateStep4] NO holistic insights found for agentId: ${currentTeammateId}`);
            console.warn(`⚠️ [populateStep4] Will fall back to executionState.synthesis data`);
        }
    } catch (error) {
        console.error('❌ [populateStep4] Error fetching holistic insights:', error);
    }

    // Display synthesized results - Simple 2-section layout
    const summaryText = document.querySelector('#step4 .summary-text');
    if (summaryText && (holisticInsights.length > 0 || executionState.results.length > 0)) {
        // Section 1: Key Insights - Use holistic insights from API if available
        let insightsHtml = '';

        if (holisticInsights.length > 0) {
            // Display holistic insights from the global insights API
            insightsHtml = holisticInsights.map((insight, idx) => {
                const insightText = insight.text || '';
                const reported = insight.reported || false;
                const reportBtnLabel = reported ? 'Reported ✓' : 'Report to Central Orchestrator';
                const reportBtnDisabled = reported ? 'disabled' : '';
                const reportBtnClass = reported ? 'btn-report-orchestrator reported' : 'btn-report-orchestrator';

                return `
                    <div class="insight-item ${reported ? 'insight-reported' : ''}" data-insight-id="${idx}">
                        <div class="insight-number">${idx + 1}</div>
                        <div class="insight-content-wrapper">
                            <div class="insight-text" contenteditable="false">${insightText}</div>
                            <div class="insight-actions">
                                <button class="${reportBtnClass}" onclick="reportToOrchestrator(${idx})" ${reportBtnDisabled}>
                                    ${reportBtnLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else if (executionState.synthesis && executionState.synthesis.keyFindings && executionState.synthesis.keyFindings.length > 0) {
            // Fallback: Display synthesized key findings from old data
            insightsHtml = executionState.synthesis.keyFindings.map((finding, idx) => {
                const reported = finding.reported || false;
                const reportBtnLabel = reported ? 'Reported ✓' : 'Report to Central Orchestrator';
                const reportBtnDisabled = reported ? 'disabled' : '';
                const reportBtnClass = reported ? 'btn-report-orchestrator reported' : 'btn-report-orchestrator';

                // Clean up title and description - remove leading dashes/bullets
                let cleanTitle = (finding.title || '').replace(/^[\-\•\*]\s*/, '').trim();
                let cleanDescription = (finding.description || '').replace(/^[\-\•\*]\s*/, '').trim();
                let cleanEvidence = finding.evidence ? (finding.evidence || '').replace(/^[\-\•\*]\s*/, '').trim() : '';

                // Parse markdown download links and convert to HTML buttons
                const markdownLinkRegex = /\[Download ([^\]]+)\]\(([^)]+)\)/gi;
                let downloadButtons = [];
                let match;

                // Check title, description, and evidence for download links
                const fullText = `${cleanTitle} ${cleanDescription} ${cleanEvidence}`;

                console.log(`🔍 [Synthesis] Checking finding ${idx} for download links:`, fullText.substring(0, 200));

                while ((match = markdownLinkRegex.exec(fullText)) !== null) {
                    const filename = match[1];
                    let url = match[2];

                    // Remove sandbox: prefix if present
                    url = url.replace(/^sandbox:/, '');

                    // Build full URL
                    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

                    console.log(`✅ [Synthesis] Found download link: ${filename} -> ${fullUrl}`);

                    downloadButtons.push({
                        filename: filename,
                        url: fullUrl
                    });
                }

                // Remove markdown links from text
                cleanTitle = cleanTitle.replace(markdownLinkRegex, '').trim();
                cleanDescription = cleanDescription.replace(markdownLinkRegex, '').trim();
                cleanEvidence = cleanEvidence.replace(markdownLinkRegex, '').trim();

                // Check if this finding has downloadUrl directly (from synthesis merge)
                console.log(`📦 [Synthesis] Finding ${idx}:`, {
                    hasFindingDownloadUrl: !!finding.downloadUrl,
                    findingDownloadUrl: finding.downloadUrl,
                    findingFilename: finding.filename
                });

                if (finding.downloadUrl) {
                    const fullDownloadUrl = finding.downloadUrl.startsWith('http') ?
                        finding.downloadUrl : `${API_BASE}${finding.downloadUrl}`;
                    downloadButtons.push({
                        filename: finding.filename || 'Excel File',
                        url: fullDownloadUrl
                    });
                    console.log(`✅ [Synthesis] Added download from finding: ${finding.filename}`);
                }

                // Also check corresponding result object as backup
                const correspondingResult = executionState.results[idx];
                if (correspondingResult?.downloadUrl && !finding.downloadUrl) {
                    const fullDownloadUrl = correspondingResult.downloadUrl.startsWith('http') ?
                        correspondingResult.downloadUrl : `${API_BASE}${correspondingResult.downloadUrl}`;
                    downloadButtons.push({
                        filename: correspondingResult.filename || 'Excel File',
                        url: fullDownloadUrl
                    });
                    console.log(`✅ [Synthesis] Added download from result: ${correspondingResult.filename}`);
                }

                const downloadButtonsHtml = downloadButtons.map(btn => `
                    <a href="${btn.url}" download="${btn.filename}" class="btn-download-excel" title="Download Excel File">
                        <span>📊</span> Download ${btn.filename}
                    </a>
                `).join('');

                if (downloadButtons.length > 0) {
                    console.log(`📊 [Synthesis] Rendering ${downloadButtons.length} download button(s) for finding ${idx}`);
                }

                return `
                    <div class="insight-item ${reported ? 'insight-reported' : ''}" data-insight-id="${idx}">
                        <div class="insight-number">${idx + 1}</div>
                        <div class="insight-content-wrapper">
                            <div class="insight-text" contenteditable="false">
                                <strong>${cleanTitle}</strong><br/>
                                ${cleanDescription}
                                ${cleanEvidence ? `<br/><em style="color: var(--text-secondary); font-size: 0.9em;">Evidence: ${cleanEvidence}</em>` : ''}
                            </div>
                            ${downloadButtonsHtml}
                            <div class="insight-actions">
                                <button class="btn-insight-edit" onclick="editInsight(${idx})" title="Edit">
                                    <span>✎</span>
                                </button>
                                <button class="btn-insight-delete" onclick="deleteInsight(${idx})" title="Delete">
                                    <span>×</span>
                                </button>
                                <button class="${reportBtnClass}" onclick="reportToOrchestrator(${idx})" ${reportBtnDisabled}>
                                    ${reportBtnLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Fallback: Display individual step summaries
            insightsHtml = executionState.results.map((result, idx) => {
                // DEBUG: Log the full result object structure
                console.log(`📦 Full result object ${idx}:`, {
                    hasDownloadUrl: !!result.downloadUrl,
                    downloadUrl: result.downloadUrl,
                    filename: result.filename,
                    hasSummary: !!result.summary,
                    summaryType: typeof result.summary,
                    allKeys: Object.keys(result)
                });

                let summary = result.summary ?
                    (typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary))
                    : 'No summary available';

                // Parse markdown download links in summary and convert to HTML buttons
                const markdownLinkRegex = /\[Download ([^\]]+)\]\(([^)]+)\)/gi;
                let downloadButtons = [];
                let match;

                console.log(`🔍 Checking summary for download links in result ${idx}:`, summary.substring(0, 200));

                while ((match = markdownLinkRegex.exec(summary)) !== null) {
                    const filename = match[1];
                    let url = match[2];

                    // Remove sandbox: prefix if present
                    url = url.replace(/^sandbox:/, '');

                    // Build full URL
                    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

                    console.log(`✅ Found download link: ${filename} -> ${fullUrl}`);

                    downloadButtons.push({
                        filename: filename,
                        url: fullUrl
                    });
                }

                // Remove markdown links from summary text
                summary = summary.replace(markdownLinkRegex, '').trim();

                const reported = result.reported || false;
                const reportBtnLabel = reported ? 'Reported ✓' : 'Report to Central Orchestrator';
                const reportBtnDisabled = reported ? 'disabled' : '';
                const reportBtnClass = reported ? 'btn-report-orchestrator reported' : 'btn-report-orchestrator';

                // Check if there's a download URL from result object
                const fullDownloadUrl = result.downloadUrl ?
                    (result.downloadUrl.startsWith('http') ? result.downloadUrl : `${API_BASE}${result.downloadUrl}`)
                    : null;

                if (fullDownloadUrl) {
                    downloadButtons.push({
                        filename: result.filename || 'Excel File',
                        url: fullDownloadUrl
                    });
                }

                const downloadButtonsHtml = downloadButtons.map(btn => `
                    <a href="${btn.url}" download="${btn.filename}" class="btn-download-excel" title="Download Excel File">
                        <span>📊</span> Download ${btn.filename}
                    </a>
                `).join('');

                // Log if download button is being rendered
                if (downloadButtons.length > 0) {
                    console.log(`📊 Rendering ${downloadButtons.length} download button(s) for result ${idx}`);
                }

                return `
                    <div class="insight-item ${reported ? 'insight-reported' : ''}" data-insight-id="${idx}">
                        <div class="insight-number">${idx + 1}</div>
                        <div class="insight-content-wrapper">
                            <div class="insight-text" contenteditable="false">${summary}</div>
                            ${downloadButtonsHtml}
                            <div class="insight-actions">
                                <button class="btn-insight-edit" onclick="editInsight(${idx})" title="Edit">
                                    <span>✎</span>
                                </button>
                                <button class="btn-insight-delete" onclick="deleteInsight(${idx})" title="Delete">
                                    <span>×</span>
                                </button>
                                <button class="${reportBtnClass}" onclick="reportToOrchestrator(${idx})" ${reportBtnDisabled}>
                                    ${reportBtnLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Section 2: Details - Show JSON output
        const detailsHtml = executionState.results.map((result, idx) => {
            const title = result.title ? String(result.title) : 'Step ' + (idx + 1);

            // Format details as pretty JSON
            let jsonOutput = '';
            if (result.details) {
                try {
                    const detailsObj = typeof result.details === 'string'
                        ? JSON.parse(result.details)
                        : result.details;
                    jsonOutput = JSON.stringify(detailsObj, null, 2);
                } catch (e) {
                    jsonOutput = typeof result.details === 'string'
                        ? result.details
                        : JSON.stringify(result.details, null, 2);
                }
            }

            return `
                <div class="details-section">
                    <div class="details-header">
                        <span class="step-badge">Step ${idx + 1}</span>
                        <span class="step-title">${title}</span>
                    </div>
                    ${jsonOutput ? `
                        <pre class="json-output"><code>${jsonOutput}</code></pre>
                    ` : '<p class="no-data">No details available</p>'}
                </div>
            `;
        }).join('');

        // Check if there are any Excel files to download
        const excelFiles = executionState.results.filter(r => r.downloadUrl);
        const excelFilesHtml = excelFiles.length > 0 ? `
            <section class="files-section" style="margin-bottom: 24px;">
                <h2 class="section-title">📊 Generated Files</h2>
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                    ${excelFiles.map((file, idx) => {
                        const fullUrl = file.downloadUrl.startsWith('http') ? file.downloadUrl : `${API_BASE}${file.downloadUrl}`;
                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: white; border-radius: 6px; border: 1px solid #d1fae5;">
                                <div>
                                    <div style="font-weight: 600; color: #166534; margin-bottom: 4px;">${file.filename || 'Excel File'}</div>
                                    <div style="font-size: 13px; color: #6b7280;">${file.title || 'Step ' + (file.stepIndex + 1)}</div>
                                </div>
                                <a href="${fullUrl}" download="${file.filename}" class="btn-download-excel">
                                    <span>📊</span> Download
                                </a>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        ` : '';

        summaryText.innerHTML = `
            <div class="synthesize-container">
                ${excelFilesHtml}

                <!-- Key Insights Section -->
                <section class="insights-section">
                    <h2 class="section-title">Key Insights</h2>
                    <div class="insights-list">
                        ${insightsHtml}
                    </div>
                </section>

                <!-- Details Section -->
                <section class="details-full-section">
                    <h2 class="section-title">Details</h2>
                    ${detailsHtml}
                </section>
            </div>
        `;
    }

    // Save execution results to Firebase
    if (currentTeammateId) {
        try {
            await teammateDB.update(currentTeammateId, {
                synthesisData: {
                    results: executionState.results,
                    completedAt: new Date().toISOString()
                },
                status: 'completed'
            });
            console.log('✅ Execution results saved to Firebase');
        } catch (error) {
            console.error('❌ Error saving results:', error);
        }
    }
}

// Insight management functions
window.editInsight = function(insightId) {
    const insightItem = document.querySelector(`.insight-item[data-insight-id="${insightId}"]`);
    if (!insightItem) return;

    const textEl = insightItem.querySelector('.insight-text');
    const editBtn = insightItem.querySelector('.btn-insight-edit');

    if (textEl.getAttribute('contenteditable') === 'true') {
        // Save mode
        textEl.setAttribute('contenteditable', 'false');
        textEl.classList.remove('editing');
        editBtn.innerHTML = '<span>✎</span>';
        editBtn.title = 'Edit';

        // Update the execution state with new text
        if (executionState.synthesis && executionState.synthesis.keyFindings && executionState.synthesis.keyFindings[insightId]) {
            // Update synthesis finding
            const newText = textEl.textContent.trim();
            const lines = newText.split('\n');
            executionState.synthesis.keyFindings[insightId].title = lines[0];
            executionState.synthesis.keyFindings[insightId].description = lines.slice(1).join('\n');
            console.log(`✅ Updated synthesized finding ${insightId}`);
        } else if (executionState.results[insightId]) {
            // Update step result
            executionState.results[insightId].summary = textEl.textContent;
            console.log(`✅ Updated insight ${insightId}`);
        }
    } else {
        // Edit mode
        textEl.setAttribute('contenteditable', 'true');
        textEl.classList.add('editing');
        textEl.focus();
        editBtn.innerHTML = '<span>✓</span>';
        editBtn.title = 'Save';
    }
};

window.deleteInsight = function(insightId) {
    if (!confirm('Are you sure you want to delete this insight?')) {
        return;
    }

    const insightItem = document.querySelector(`.insight-item[data-insight-id="${insightId}"]`);
    if (insightItem) {
        insightItem.remove();
        console.log(`🗑️ Deleted insight ${insightId}`);
    }
};

window.reportToOrchestrator = async function(insightId) {
    const insightItem = document.querySelector(`.insight-item[data-insight-id="${insightId}"]`);
    if (!insightItem) return;

    const textEl = insightItem.querySelector('.insight-text');
    const insightText = textEl.textContent;
    const reportBtn = insightItem.querySelector('.btn-report-orchestrator');

    if (!insightText || reportBtn?.disabled) return;

    console.log('📤 Reporting to Central Orchestrator:', insightText);

    try {
        if (reportBtn) {
            reportBtn.disabled = true;
            reportBtn.textContent = 'Reporting...';
        }

        let teammateName = 'Agent';
        let teammateType = '';

        if (currentTeammateId) {
            const teammateRecord = await teammateDB.get(currentTeammateId);
            teammateName = teammateRecord?.name || teammateRecord?.objective || teammateName;
            teammateType = teammateRecord?.type || '';
        }

        // Check if this is a synthesized finding or a step result
        const isSynthesized = executionState.synthesis && executionState.synthesis.keyFindings && executionState.synthesis.keyFindings[insightId];
        const finding = isSynthesized ? executionState.synthesis.keyFindings[insightId] : null;
        const result = executionState.results[insightId] || {};

        const payload = {
            text: insightText.trim(),
            agentId: currentTeammateId || 'unknown',
            agentName: teammateName,
            teammateType,
            stepTitle: isSynthesized ? finding.title : (result.title || `Step ${insightId + 1}`),
            stepIndex: result.stepIndex ?? insightId,
            phase: 4,
            isSynthesized: isSynthesized,
            timestamp: new Date().toISOString()
        };

        const response = await fetch(`${API_BASE}/api/insights`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to report insight');
        }

        const data = await response.json();

        // Check if it was a duplicate
        if (data.duplicate) {
            console.log('ℹ️ Insight was already recorded (duplicate)');
            if (reportBtn) {
                reportBtn.textContent = 'Already Recorded ✓';
                reportBtn.classList.add('reported');
                reportBtn.disabled = true;
            }
            insightItem.classList.add('insight-reported');
            // Show a non-intrusive message
            return;
        }

        const reportedAt = data?.insight?.reportedAt || data?.insight?.timestamp || new Date().toISOString();

        // Update execution state
        if (isSynthesized && finding) {
            // Mark synthesized finding as reported
            finding.reported = true;
            finding.reportedAt = reportedAt;
        } else if (executionState.results[insightId]) {
            // Mark step result as reported
            executionState.results[insightId].reported = true;
            executionState.results[insightId].reportedAt = reportedAt;
        }

        if (reportBtn) {
            reportBtn.textContent = 'Reported ✓';
            reportBtn.classList.add('reported');
        }
        insightItem.classList.add('insight-reported');

        await saveExecutionProgress();

        console.log('✅ Insight reported successfully');
    } catch (error) {
        console.error('❌ Error reporting insight:', error);
        if (reportBtn) {
            reportBtn.disabled = false;
            reportBtn.textContent = 'Report to Central Orchestrator';
        }
        alert(`Failed to report insight: ${error.message}`);
    }
};

// Note: Execution results are displayed directly in Step 4
// Simple 2-section layout: Key Insights + Details (JSON)
// Execution is now started automatically from Step 2 via startExecutionFromStep2()

// Verify all global functions are available
console.log("✅ Global functions check:");
console.log("  - createAgent:", typeof window.createAgent);
console.log("  - nextStep:", typeof window.nextStep);
console.log("  - prevStep:", typeof window.prevStep);
console.log("  - skipClarifications:", typeof window.skipClarifications);
console.log("  - startExecutionFromStep2:", typeof window.startExecutionFromStep2);
console.log("All agent-create.js functions loaded successfully!");
