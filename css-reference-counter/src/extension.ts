import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';
import { BackgroundScanner } from './backgroundScanner';
import { FileWatcher } from './fileWatcher';
import { CssCodeLensProvider } from './codeLensProvider';
import { CssDefinitionProvider } from './definitionProvider';
import { CssReferenceProvider } from './referenceProvider';
import { CssSidebarProvider } from './sidebarProvider';

let fileWatcher: FileWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('CSS Reference Counter is now active!');

    // 1. Initialize the cache
    const cacheManager = new CacheManager();

    // 2. Initialize persistent cache (workspace-specific storage)
    cacheManager.initPersistence(context.storageUri);

    // 3. Start the background scanner (delta scan — only changed files)
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

    // 8. Register the sidebar view
    const sidebarProvider = new CssSidebarProvider(cacheManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('cssReferenceCounter.sidebar', sidebarProvider)
    );

    // 9. Register add exclude pattern command
    context.subscriptions.push(
        vscode.commands.registerCommand('cssReferenceCounter.addExcludePattern', async () => {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter a glob pattern to exclude from scanning',
                placeHolder: '**/my-folder/**',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Pattern cannot be empty';
                    }
                    return null;
                }
            });
            if (!input) { return; }

            const config = vscode.workspace.getConfiguration('cssReferenceCounter');
            const patterns = config.get<string[]>('excludePatterns', []);
            const pattern = input.trim();

            if (patterns.includes(pattern)) {
                vscode.window.showInformationMessage(`Pattern "${pattern}" is already excluded.`);
                return;
            }

            patterns.push(pattern);
            await config.update('excludePatterns', patterns, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Added "${pattern}" to exclude patterns. Rescan to apply.`);
        })
    );

    // 10. Register remove exclude pattern command
    context.subscriptions.push(
        vscode.commands.registerCommand('cssReferenceCounter.removeExcludePattern', async (pattern: string) => {
            const confirm = await vscode.window.showWarningMessage(
                `Remove "${pattern}"? Large folders may cause a long rescan.`,
                'Remove'
            );
            if (confirm !== 'Remove') { return; }

            const config = vscode.workspace.getConfiguration('cssReferenceCounter');
            const patterns = config.get<string[]>('excludePatterns', []);
            const updated = patterns.filter(p => p !== pattern);
            await config.update('excludePatterns', updated, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Removed "${pattern}". Rescan to apply changes.`);
        })
    );

    console.log('CSS Reference Counter: All providers registered.');
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
