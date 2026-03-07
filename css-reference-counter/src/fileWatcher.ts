import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';
import { UsageScanner } from './usageScanner';

/**
 * Watches for file changes and incrementally updates the cache.
 * Handles saves, creates, and deletes.
 */
export class FileWatcher implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    /** CSS language IDs */
    private static readonly CSS_LANGUAGES = new Set(['css', 'scss']);

    constructor(private cacheManager: CacheManager) {
        // Watch for document saves
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.onDocumentSaved(document);
            })
        );

        // Watch for file creation
        this.disposables.push(
            vscode.workspace.onDidCreateFiles((event) => {
                this.onFilesCreated(event.files);
            })
        );

        // Watch for file deletion
        this.disposables.push(
            vscode.workspace.onDidDeleteFiles((event) => {
                for (const file of event.files) {
                    this.cacheManager.removeFile(file);
                }
            })
        );

        // Watch for file renames
        this.disposables.push(
            vscode.workspace.onDidRenameFiles((event) => {
                for (const { oldUri, newUri } of event.files) {
                    this.cacheManager.removeFile(oldUri);
                    this.processUri(newUri);
                }
            })
        );

        // Also update on text document changes (for live updates while typing)
        // Using a debounce to avoid excessive re-scanning
        let debounceTimer: NodeJS.Timeout | undefined;
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                // Skip events with no content changes (e.g. file opened, not edited)
                if (event.contentChanges.length === 0) { return; }
                if (debounceTimer) { clearTimeout(debounceTimer); }
                debounceTimer = setTimeout(() => {
                    this.onDocumentChanged(event.document);
                }, 500); // 500ms debounce
            })
        );
    }

    private onDocumentSaved(document: vscode.TextDocument): void {
        // Skip during background scan — it handles everything
        if (this.cacheManager.isScanning) { return; }

        if (FileWatcher.CSS_LANGUAGES.has(document.languageId)) {
            this.cacheManager.updateCssFile(document);
        } else if (UsageScanner.isConsumerFile(document)) {
            this.cacheManager.updateConsumerFile(document);
        }
    }

    private onDocumentChanged(document: vscode.TextDocument): void {
        // Skip during background scan — it handles everything
        if (this.cacheManager.isScanning) { return; }

        if (FileWatcher.CSS_LANGUAGES.has(document.languageId)) {
            this.cacheManager.updateCssFile(document);
        } else if (UsageScanner.isConsumerFile(document)) {
            this.cacheManager.updateConsumerFile(document);
        }
    }

    private async onFilesCreated(files: readonly vscode.Uri[]): Promise<void> {
        for (const file of files) {
            await this.processUri(file);
        }
    }

    private async processUri(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            if (FileWatcher.CSS_LANGUAGES.has(document.languageId)) {
                this.cacheManager.updateCssFile(document);
            } else if (UsageScanner.isConsumerFile(document)) {
                this.cacheManager.updateConsumerFile(document);
            }
        } catch (e) {
            // File might not be openable
        }
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
