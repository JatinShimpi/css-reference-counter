import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';
import { BackgroundScanner } from './backgroundScanner';
import { FileWatcher } from './fileWatcher';
import { CssCodeLensProvider } from './codeLensProvider';
import { CssDefinitionProvider } from './definitionProvider';
import { CssReferenceProvider } from './referenceProvider';

let fileWatcher: FileWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('CSS Reference Counter is now active!');

    // 1. Initialize the cache
    const cacheManager = new CacheManager();

    // 2. Start the background scanner (full workspace scan)
    const backgroundScanner = new BackgroundScanner(cacheManager);
    backgroundScanner.scanWorkspace();

    // 3. Register the file watcher for incremental updates
    fileWatcher = new FileWatcher(cacheManager);
    context.subscriptions.push(fileWatcher);

    // 4. Register CodeLens provider for CSS/SCSS
    const codeLensProvider = new CssCodeLensProvider(cacheManager);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [
                { language: 'css', scheme: 'file' },
                { language: 'scss', scheme: 'file' }
            ],
            codeLensProvider
        )
    );

    // 5. Register Definition provider for consumer files (Ctrl+Click → CSS)
    const definitionProvider = new CssDefinitionProvider(cacheManager);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            [
                { language: 'html', scheme: 'file' },
                { language: 'javascriptreact', scheme: 'file' },
                { language: 'typescriptreact', scheme: 'file' },
                { language: 'vue', scheme: 'file' },
                { language: 'svelte', scheme: 'file' },
                { language: 'javascript', scheme: 'file' },
                { language: 'typescript', scheme: 'file' }
            ],
            definitionProvider
        )
    );

    // 6. Register Reference provider for CSS files (Find All References)
    const referenceProvider = new CssReferenceProvider(cacheManager);
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            [
                { language: 'css', scheme: 'file' },
                { language: 'scss', scheme: 'file' }
            ],
            referenceProvider
        )
    );

    // 7. Register a manual rescan command
    context.subscriptions.push(
        vscode.commands.registerCommand('cssReferenceCounter.rescan', () => {
            backgroundScanner.scanWorkspace();
        })
    );

    console.log('CSS Reference Counter: All providers registered.');
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
