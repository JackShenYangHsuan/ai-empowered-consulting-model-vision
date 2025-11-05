/**
 * Uber Eats MCP Demo
 * Frontend logic for testing the MCP integration
 */

const API_BASE = 'http://localhost:3003';

// State
let serverRunning = false;
let searchRequestId = null;

// Add log entry
function addLog(message, type = 'info') {
    const logs = document.getElementById('logs');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
}

// Update UI state
function updateUI() {
    const statusIndicator = document.getElementById('statusIndicator');
    const serverStatus = document.getElementById('serverStatus');
    const startBtn = document.getElementById('startServerBtn');
    const stopBtn = document.getElementById('stopServerBtn');
    const searchBtn = document.getElementById('searchBtn');

    if (serverRunning) {
        statusIndicator.classList.add('running');
        serverStatus.textContent = 'Server is running ✅';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        searchBtn.disabled = false;
    } else {
        statusIndicator.classList.remove('running');
        serverStatus.textContent = 'Server not running';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        searchBtn.disabled = true;
    }
}

// Check server status
async function checkStatus() {
    try {
        addLog('Checking server status...', 'info');
        const response = await fetch(`${API_BASE}/api/mcp/status`);
        const data = await response.json();

        serverRunning = data.uber_eats?.running || false;

        if (serverRunning) {
            addLog('Server is running', 'success');
            const tools = data.uber_eats.tools.join(', ');
            addLog(`Available tools: ${tools}`, 'info');
        } else {
            addLog('Server is not running', 'info');
        }

        updateUI();
    } catch (error) {
        addLog(`Error checking status: ${error.message}`, 'error');
        serverRunning = false;
        updateUI();
    }
}

// Start MCP server
async function startServer() {
    try {
        addLog('Starting Uber Eats MCP server...', 'info');
        document.getElementById('startServerBtn').disabled = true;
        document.getElementById('startServerBtn').textContent = 'Starting...';

        const response = await fetch(`${API_BASE}/api/mcp/uber-eats/start`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            addLog('Server started successfully!', 'success');
            if (data.tools) {
                addLog(`Loaded tools: ${data.tools.map(t => t.name).join(', ')}`, 'info');
            }
            serverRunning = true;
        } else {
            addLog(`Failed to start server: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting server: ${error.message}`, 'error');
    } finally {
        document.getElementById('startServerBtn').textContent = 'Start Server';
        updateUI();
    }
}

// Stop MCP server
async function stopServer() {
    try {
        addLog('Stopping Uber Eats MCP server...', 'info');

        const response = await fetch(`${API_BASE}/api/mcp/uber-eats/stop`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            addLog('Server stopped successfully', 'success');
            serverRunning = false;
        } else {
            addLog(`Failed to stop server: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`Error stopping server: ${error.message}`, 'error');
    } finally {
        updateUI();
    }
}

// Search for restaurants
async function searchRestaurants() {
    const address = document.getElementById('address').value.trim();
    const foodCraving = document.getElementById('foodCraving').value.trim();

    if (!address || !foodCraving) {
        alert('Please enter both delivery address and food craving');
        return;
    }

    const resultsDiv = document.getElementById('searchResults');
    const searchBtn = document.getElementById('searchBtn');

    try {
        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';

        // Show loading state
        resultsDiv.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Searching for "${foodCraving}" near ${address}...</p>
                <p style="font-size: 12px; margin-top: 8px;">This may take up to 2 minutes</p>
            </div>
        `;

        addLog(`Searching for ${foodCraving} at ${address}`, 'info');

        // Call the MCP tool
        const response = await fetch(`${API_BASE}/api/mcp/uber-eats/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, foodCraving })
        });

        const data = await response.json();

        if (data.success) {
            searchRequestId = data.requestId;
            addLog(`Search initiated. Request ID: ${searchRequestId}`, 'success');
            addLog(data.message, 'info');

            // Poll for results after 2 minutes
            setTimeout(() => fetchSearchResults(), 120000);

            // Show waiting message
            resultsDiv.innerHTML = `
                <div class="success">
                    ✅ Search started successfully!<br>
                    <strong>Request ID:</strong> ${searchRequestId}<br>
                    Results will be fetched automatically in 2 minutes...
                </div>
            `;
        } else {
            addLog(`Search failed: ${data.error}`, 'error');
            resultsDiv.innerHTML = `<div class="error">❌ ${data.error}</div>`;
        }
    } catch (error) {
        addLog(`Error during search: ${error.message}`, 'error');
        resultsDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
    }
}

// Fetch search results
async function fetchSearchResults() {
    if (!searchRequestId) {
        addLog('No search request ID available', 'error');
        return;
    }

    const resultsDiv = document.getElementById('searchResults');

    try {
        addLog(`Fetching results for request ID: ${searchRequestId}`, 'info');

        resultsDiv.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Retrieving results...</p>
            </div>
        `;

        const response = await fetch(`${API_BASE}/api/mcp/uber-eats/results/${searchRequestId}`);
        const data = await response.json();

        if (data.success) {
            addLog('Results retrieved successfully!', 'success');
            displayResults(data.results);
        } else {
            addLog(`Failed to fetch results: ${data.error}`, 'error');
            resultsDiv.innerHTML = `<div class="error">❌ ${data.error}</div>`;
        }
    } catch (error) {
        addLog(`Error fetching results: ${error.message}`, 'error');
        resultsDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
    }
}

// Display restaurant results
function displayResults(results) {
    const resultsDiv = document.getElementById('searchResults');

    // Parse results if they're a string
    let parsedResults;
    if (typeof results === 'string') {
        // Try to extract structured data from the text
        addLog('Raw results: ' + results.substring(0, 200) + '...', 'info');

        resultsDiv.innerHTML = `
            <div class="success">
                <strong>Search Results:</strong><br>
                <pre style="white-space: pre-wrap; margin-top: 12px; font-size: 13px; line-height: 1.6;">${results}</pre>
            </div>
        `;
        return;
    }

    // If results are structured, display them as cards
    if (Array.isArray(parsedResults)) {
        const cardsHtml = parsedResults.map(restaurant => `
            <div class="restaurant-card">
                <div class="restaurant-name">${restaurant.name}</div>
                <div class="restaurant-info">
                    ${restaurant.rating ? `<span>⭐ ${restaurant.rating}</span>` : ''}
                    ${restaurant.price ? `<span>💰 ${restaurant.price}</span>` : ''}
                    ${restaurant.eta ? `<span>🕒 ${restaurant.eta}</span>` : ''}
                </div>
                ${restaurant.url ? `<a href="${restaurant.url}" target="_blank" class="restaurant-url">View on Uber Eats →</a>` : ''}
            </div>
        `).join('');

        resultsDiv.innerHTML = `<div class="results-grid">${cardsHtml}</div>`;
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    addLog('Demo page loaded', 'success');
    addLog('Click "Start Server" to begin testing', 'info');
    checkStatus();
});
