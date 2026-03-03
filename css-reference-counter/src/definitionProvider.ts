import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';

/**
 * Definition provider that enables Ctrl+Click from class/id usage in HTML/JSX
 * to the corresponding CSS declaration.
 */
export class CssDefinitionProvider implements vscode.DefinitionProvider {

    constructor(private cacheManager: CacheManager) { }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.Definition | undefined {
        const scanner = this.cacheManager.getUsageScanner();
        const info = scanner.getClassNameAtPosition(document, position);

        if (!info) {
            return undefined;
        }

        // Look up the CSS declaration for this class/id
        const declarations = this.cacheManager.findAllDeclarations(info.name, info.type);

        if (declarations.length === 0) {
            return undefined;
        }

        // Return all matching locations (VS Code will show a picker if multiple)
        return declarations.map(decl => new vscode.Location(decl.file, decl.range));
    }
}
