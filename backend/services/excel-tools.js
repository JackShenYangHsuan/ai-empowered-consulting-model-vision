/**
 * Excel Tools Service
 *
 * Provides OpenAI function calling tool for Excel generation.
 * Uses exceljs library to create downloadable Excel files.
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Tool definition for OpenAI Function Calling
const excelTools = [
    {
        type: "function",
        function: {
            name: "generate_excel",
            description: "Generates an Excel file with multiple sheets, data, formulas, and formatting. Use this to create financial models, data analysis templates, reports, or any structured Excel document.",
            parameters: {
                type: "object",
                properties: {
                    sheets: {
                        type: "array",
                        description: "Array of sheet definitions. Each sheet can contain headers, data rows, and formulas.",
                        items: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "Name of the sheet (e.g., 'Assumptions', 'P&L', 'Cash Flow')"
                                },
                                headers: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Column headers"
                                },
                                rows: {
                                    type: "array",
                                    description: "Data rows. Each row is an array of values matching the headers.",
                                    items: {
                                        type: "array",
                                        items: {
                                            oneOf: [
                                                { type: "string" },
                                                { type: "number" },
                                                { type: "boolean" },
                                                { type: "null" }
                                            ]
                                        }
                                    }
                                },
                                formulas: {
                                    type: "array",
                                    description: "Excel formulas to apply to specific cells (e.g., SUM, AVERAGE, etc.)",
                                    items: {
                                        type: "object",
                                        properties: {
                                            cell: {
                                                type: "string",
                                                description: "Cell reference in A1 notation (e.g., 'C2', 'D5')"
                                            },
                                            formula: {
                                                type: "string",
                                                description: "Excel formula (e.g., '=A2+B2', '=SUM(C2:C10)')"
                                            }
                                        },
                                        required: ["cell", "formula"]
                                    }
                                },
                                columnWidths: {
                                    type: "array",
                                    description: "Optional: Width for each column in characters",
                                    items: { type: "number" }
                                }
                            },
                            required: ["name", "headers", "rows"]
                        }
                    },
                    filename: {
                        type: "string",
                        description: "Name for the Excel file (will automatically add .xlsx extension if missing)"
                    }
                },
                required: ["sheets", "filename"]
            }
        }
    }
];

/**
 * Execute Excel file generation
 * @param {Object} args - Arguments from OpenAI function call
 * @returns {Promise<Object>} Result with filename and download URL
 */
async function executeExcelGeneration(args) {
    try {
        console.log('📊 Generating Excel file:', args.filename);

        const workbook = new ExcelJS.Workbook();

        // Set workbook properties
        workbook.creator = 'Command Center AI';
        workbook.created = new Date();

        // Create each sheet
        for (const sheetDef of args.sheets) {
            console.log(`  → Creating sheet: ${sheetDef.name}`);
            const worksheet = workbook.addWorksheet(sheetDef.name);

            // Add headers with formatting
            const headerRow = worksheet.addRow(sheetDef.headers);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2563EB' } // Blue header
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

            // Add data rows
            for (const row of sheetDef.rows) {
                worksheet.addRow(row);
            }

            // Apply formulas
            if (sheetDef.formulas) {
                for (const formula of sheetDef.formulas) {
                    const cell = worksheet.getCell(formula.cell);
                    cell.value = { formula: formula.formula };
                    cell.numFmt = '#,##0.00'; // Number formatting
                }
            }

            // Set column widths
            if (sheetDef.columnWidths && sheetDef.columnWidths.length > 0) {
                worksheet.columns.forEach((column, index) => {
                    if (sheetDef.columnWidths[index]) {
                        column.width = sheetDef.columnWidths[index];
                    }
                });
            } else {
                // Auto-fit columns if no widths specified
                worksheet.columns.forEach(column => {
                    column.width = 15;
                });
            }

            // Add borders to all cells with data
            worksheet.eachRow((row, rowNumber) => {
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });
        }

        // Ensure filename has .xlsx extension
        let filename = args.filename;
        if (!filename.endsWith('.xlsx')) {
            filename += '.xlsx';
        }

        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, '../temp/excel');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const uniqueFilename = filename.replace('.xlsx', `-${timestamp}.xlsx`);
        const filePath = path.join(tempDir, uniqueFilename);

        // Save the workbook
        await workbook.xlsx.writeFile(filePath);

        console.log(`✅ Excel file created: ${uniqueFilename}`);

        return {
            success: true,
            filename: uniqueFilename,
            downloadUrl: `/api/excel/download/${uniqueFilename}`,
            message: `Excel file '${filename}' created successfully with ${args.sheets.length} sheet(s)`
        };

    } catch (error) {
        console.error('❌ Error generating Excel file:', error);
        return {
            success: false,
            error: error.message,
            message: `Failed to create Excel file: ${error.message}`
        };
    }
}

/**
 * Clean up old Excel files (older than 1 hour)
 */
function cleanupOldFiles() {
    const tempDir = path.join(__dirname, '../temp/excel');
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    files.forEach(file => {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > oneHour) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Cleaned up old Excel file: ${file}`);
        }
    });
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

module.exports = {
    excelTools,
    executeExcelGeneration,
    cleanupOldFiles
};
