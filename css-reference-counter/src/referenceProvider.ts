import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';

/**
 * Reference provider for CSS selectors.
 * Enables "Find All References" from CSS files to show all usages.
 */
export class CssReferenceProvider implements vscode.ReferenceProvider {

    constructor(private cacheManager: CacheManager) { }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): vscode.Location[] | undefined {
        const line = document.lineAt(position.line).text;

        // Try to find a class selector at the cursor position
        const classMatch = this.findSelectorAtPosition(line, position.character, '.');
        if (classMatch) {
            const locations = this.cacheManager.getUsageLocations('.' + classMatch);
            return locations.map(loc => new vscode.Location(loc.file, loc.range));
        }

        // Try to find an id selector at the cursor position
        const idMatch = this.findSelectorAtPosition(line, position.character, '#');
        if (idMatch) {
            const locations = this.cacheManager.getUsageLocations('#' + idMatch);
            return locations.map(loc => new vscode.Location(loc.file, loc.range));
        }

        return undefined;
    }

    /**
     * Find a CSS selector name at the cursor position.
     * Looks for .className or #idName patterns.
     */
    private findSelectorAtPosition(line: string, column: number, prefix: '.' | '#'): string | null {
        // Search backwards from cursor to find the prefix
        let start = column;
        while (start > 0 && /[a-zA-Z0-9_-]/.test(line[start - 1])) {
            start--;
        }

        // Check if the character before the name is the prefix
        if (start > 0 && line[start - 1] === prefix) {
            // Find the end of the name
            let end = column;
            while (end < line.length && /[a-zA-Z0-9_-]/.test(line[end])) {
                end++;
            }
            const name = line.substring(start, end);
            if (name) {
                return name;
            }
        }

        return null;
    }
}
