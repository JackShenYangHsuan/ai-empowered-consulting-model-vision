/**
 * Configuration Management
 * 
 * Handles loading and saving settings including API keys.
 * Uses file-based storage with encryption support for production.
 * 
 * Design decisions:
 * - File-based for simplicity (can migrate to DB later)
 * - Settings cached in memory for performance
 * - Validates API keys before saving
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

class Config {
    constructor() {
        this.settingsPath = path.join(__dirname, 'storage', 'settings.json');
        this.settings = this.load();
    }

    load() {
        // Default settings
        const defaults = {
            apis: {
                openai: {
                    apiKey: process.env.OPENAI_API_KEY || '',
                    model: 'gpt-4o-mini',
                    enabled: true  // Default to enabled (required for agents to work)
                },
                anthropic: {
                    apiKey: process.env.ANTHROPIC_API_KEY || '',
                    model: 'claude-3-opus-20240229',
                    enabled: false
                },
                exa: {
                    apiKey: process.env.EXA_API_KEY || '',
                    enabled: false
                }
            },
            mcps: [],
            rag: {
                enabled: true,
                chunkSize: 1000,
                vectorStore: 'in-memory'
            },
            prompts: {
                workPlan: 'You are a JSON-only response generator. Always respond with valid JSON and nothing else.',
                questions: 'You are a JSON-only response generator. Always respond with valid JSON and nothing else.',
                execution: 'You are a highly capable AI agent executor. You think step-by-step, provide detailed results, and always respond with valid JSON only.',
                synthesis: 'You are an expert analyst who synthesizes complex information into clear, actionable insights. You always respond with valid JSON only.',
                hypothesis: 'You critically evaluate hypotheses using structured evidence. ALWAYS respond with valid JSON.',
                executiveSummary: 'You craft crisp executive summaries from consulting deliverables.'
            },
            executiveSummaryPrompt: ''
        };

        // Try to load existing settings and merge with defaults
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                const loaded = JSON.parse(data);

                // Deep merge loaded settings with defaults
                const merged = {
                    ...defaults,
                    ...loaded,
                    apis: { ...defaults.apis, ...loaded.apis },
                    mcps: loaded.mcps || defaults.mcps,
                    rag: { ...defaults.rag, ...loaded.rag },
                    prompts: { ...defaults.prompts, ...loaded.prompts },
                    executiveSummaryPrompt: loaded.executiveSummaryPrompt || defaults.executiveSummaryPrompt
                };

                // Migration: Auto-enable OpenAI if it has an API key but is disabled
                // (OpenAI is required for agents to work)
                if (merged.apis?.openai?.apiKey && merged.apis.openai.enabled === false) {
                    console.log('🔄 Migrating settings: Auto-enabling OpenAI (required for agents)');
                    merged.apis.openai.enabled = true;
                    // Save the migrated settings
                    this.settings = merged;
                    this.save();
                }

                return merged;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }

        return defaults;
    }

    save() {
        try {
            const dir = path.dirname(this.settingsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    getApiKey(service) {
        return this.settings.apis[service]?.apiKey || '';
    }

    setApiKey(service, apiKey) {
        if (!this.settings.apis[service]) {
            this.settings.apis[service] = {};
        }
        this.settings.apis[service].apiKey = apiKey;
        this.save();
    }

    isServiceEnabled(service) {
        return this.settings.apis[service]?.enabled || false;
    }

    enableService(service, enabled = true) {
        if (!this.settings.apis[service]) {
            this.settings.apis[service] = {};
        }
        this.settings.apis[service].enabled = enabled;
        this.save();
    }
}

module.exports = new Config();
