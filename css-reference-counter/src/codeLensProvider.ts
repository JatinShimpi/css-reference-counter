import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';

/**
 * CodeLens provider that shows "implementations: N" above each CSS selector.
 */
export class CssCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(private cacheManager: CacheManager) {
        // Refresh CodeLenses when cache updates
        cacheManager.onDidChange(() => {
            this._onDidChangeCodeLenses.fire();
        });
        // Also refresh when scan state changes
        cacheManager.onDidChangeScanState(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
        // Hide counts while scanning — avoid misleading "0" flash
        if (this.cacheManager.isScanning) {
            return [];
        }

        const declarations = this.cacheManager.getDeclarationsForFile(document.uri);
        const lenses: vscode.CodeLens[] = [];

        // Group declarations by line to avoid duplicate lenses on the same line
        const lineMap = new Map<number, { selectors: string[]; range: vscode.Range }>();

        for (const decl of declarations) {
            const existing = lineMap.get(decl.line);
            if (existing) {
                if (!existing.selectors.includes(decl.selector)) {
                    existing.selectors.push(decl.selector);
                }
            } else {
                lineMap.set(decl.line, {
                    selectors: [decl.selector],
                    range: new vscode.Range(decl.line, 0, decl.line, 0)
                });
            }
        }

        for (const [_line, entry] of lineMap) {
            // Calculate total usages for all selectors on this line
            let totalUsages = 0;
            const allLocations: vscode.Location[] = [];

            for (const selector of entry.selectors) {
                const count = this.cacheManager.getUsageCount(selector);
                totalUsages += count;

                const locations = this.cacheManager.getUsageLocations(selector);
                for (const loc of locations) {
                    allLocations.push(new vscode.Location(loc.file, loc.range));
                }
            }

            const selectorLabel = entry.selectors.join(', ');

            const lens = new vscode.CodeLens(entry.range, {
                title: `$(references) implementations: ${totalUsages}`,
                tooltip: totalUsages === 0
                    ? `${selectorLabel} — No usages found. This CSS rule may be unused.`
                    : `${selectorLabel} — Used ${totalUsages} time${totalUsages !== 1 ? 's' : ''} across the project. Click to see all references.`,
                command: totalUsages > 0 ? 'editor.action.showReferences' : '',
                arguments: totalUsages > 0
                    ? [
                        vscode.Uri.parse(entry.range.start.line.toString()), // dummy, overridden below
                        entry.range.start,
                        allLocations
                    ]
                    : undefined
            });

            // Fix the URI for the showReferences command
            if (totalUsages > 0) {
                const document_uri = declarations[0]?.file;
                if (document_uri) {
                    lens.command!.arguments = [
                        document_uri,
                        entry.range.start,
                        allLocations
                    ];
                }
            }

            lenses.push(lens);
        }

        return lenses;
    }
}
