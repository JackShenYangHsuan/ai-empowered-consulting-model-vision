/**
 * MCP Manager
 *
 * Manages Model Context Protocol servers (like Uber Eats)
 * Spawns Python subprocesses and communicates via stdio transport
 */

const { spawn } = require('child_process');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class MCPManager {
    constructor() {
        this.servers = new Map(); // serverName -> { process, client, tools }
        this.config = {
            uberEats: {
                name: 'uber_eats',
                pythonPath: path.join(__dirname, '../mcp-servers/uber-eats/venv/bin/python'),
                serverPath: path.join(__dirname, '../mcp-servers/uber-eats/server.py'),
                demoMode: true, // For demo, we only expose find_menu_options (not order_food)
            }
        };
    }

    /**
     * Start the Uber Eats MCP server
     */
    async startUberEatsServer() {
        const serverName = 'uber_eats';

        if (this.servers.has(serverName)) {
            console.log('[MCP] Uber Eats server already running');
            return { success: true, message: 'Server already running' };
        }

        try {
            const config = this.config.uberEats;

            console.log('[MCP] Starting Uber Eats MCP server...');
            console.log(`[MCP] Python: ${config.pythonPath}`);
            console.log(`[MCP] Server: ${config.serverPath}`);

            // Spawn Python process
            const serverProcess = spawn(config.pythonPath, [config.serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1', // Disable Python output buffering
                }
            });

            // Handle process errors
            serverProcess.on('error', (error) => {
                console.error('[MCP] Failed to start Uber Eats server:', error);
                this.servers.delete(serverName);
            });

            serverProcess.on('exit', (code, signal) => {
                console.log(`[MCP] Uber Eats server exited (code: ${code}, signal: ${signal})`);
                this.servers.delete(serverName);
            });

            // Log stderr for debugging
            serverProcess.stderr.on('data', (data) => {
                console.error(`[MCP] Uber Eats stderr: ${data.toString().trim()}`);
            });

            // Create MCP client
            const transport = new StdioClientTransport({
                command: config.pythonPath,
                args: [config.serverPath],
            });

            const client = new Client({
                name: 'command-center-backend',
                version: '1.0.0',
            }, {
                capabilities: {
                    tools: {},
                    resources: {},
                }
            });

            // Connect to the MCP server
            await client.connect(transport);
            console.log('[MCP] Connected to Uber Eats MCP server');

            // List available tools
            const toolsResult = await client.listTools();
            console.log('[MCP] Available tools:', toolsResult.tools.map(t => t.name));

            // In demo mode, filter out order_food tool
            let availableTools = toolsResult.tools;
            if (config.demoMode) {
                availableTools = toolsResult.tools.filter(tool => tool.name !== 'order_food');
                console.log('[MCP] Demo mode: order_food tool hidden');
                console.log('[MCP] Exposed tools:', availableTools.map(t => t.name));
            }

            // Store server info
            this.servers.set(serverName, {
                process: serverProcess,
                client,
                transport,
                tools: availableTools,
                config,
            });

            console.log('[MCP] ✅ Uber Eats server started successfully');

            return {
                success: true,
                tools: availableTools,
                message: 'Uber Eats MCP server started'
            };

        } catch (error) {
            console.error('[MCP] Error starting Uber Eats server:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop the Uber Eats MCP server
     */
    async stopUberEatsServer() {
        const serverName = 'uber_eats';

        if (!this.servers.has(serverName)) {
            return { success: true, message: 'Server not running' };
        }

        try {
            const server = this.servers.get(serverName);

            // Close MCP client connection
            await server.client.close();

            // Kill Python process
            server.process.kill('SIGTERM');

            // Clean up
            this.servers.delete(serverName);

            console.log('[MCP] Uber Eats server stopped');
            return { success: true, message: 'Server stopped' };

        } catch (error) {
            console.error('[MCP] Error stopping Uber Eats server:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get available tools from all running MCP servers
     */
    getAvailableTools() {
        const allTools = [];

        for (const [serverName, serverInfo] of this.servers) {
            for (const tool of serverInfo.tools) {
                allTools.push({
                    server: serverName,
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                });
            }
        }

        return allTools;
    }

    /**
     * Call a tool on an MCP server
     */
    async callTool(serverName, toolName, args) {
        if (!this.servers.has(serverName)) {
            throw new Error(`MCP server '${serverName}' is not running`);
        }

        const server = this.servers.get(serverName);

        try {
            console.log(`[MCP] Calling ${serverName}/${toolName} with args:`, args);

            const result = await server.client.callTool({
                name: toolName,
                arguments: args,
            });

            console.log(`[MCP] Tool result:`, result);
            return result;

        } catch (error) {
            console.error(`[MCP] Error calling ${serverName}/${toolName}:`, error);
            throw error;
        }
    }

    /**
     * Read a resource from an MCP server
     */
    async readResource(serverName, uri) {
        if (!this.servers.has(serverName)) {
            throw new Error(`MCP server '${serverName}' is not running`);
        }

        const server = this.servers.get(serverName);

        try {
            console.log(`[MCP] Reading resource from ${serverName}: ${uri}`);

            const result = await server.client.readResource({ uri });

            console.log(`[MCP] Resource result:`, result);
            return result;

        } catch (error) {
            console.error(`[MCP] Error reading resource ${uri}:`, error);
            throw error;
        }
    }

    /**
     * Get status of all MCP servers
     */
    getStatus() {
        const status = {};

        for (const [serverName, serverInfo] of this.servers) {
            status[serverName] = {
                running: true,
                tools: serverInfo.tools.map(t => t.name),
                demoMode: serverInfo.config.demoMode,
            };
        }

        return status;
    }

    /**
     * Check if a server is running
     */
    isRunning(serverName) {
        return this.servers.has(serverName);
    }
}

module.exports = MCPManager;
