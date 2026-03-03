import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';
import { RawFileScanner } from './rawFileScanner';

/**
 * Performs a full workspace scan on extension activation.
 * Uses raw file reads for speed — avoids opening TextDocuments.
 * Cancellable and capped at a configurable file limit.
 */
export class BackgroundScanner {

    /** Max file size to scan (256 KB) — skip large/minified files */
    private static readonly MAX_FILE_SIZE = 256 * 1024;

    /** Max number of consumer files to scan */
    private static readonly MAX_CONSUMER_FILES = 10000;

    private rawScanner = new RawFileScanner();

    constructor(private cacheManager: CacheManager) { }

    async scanWorkspace(): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'CSS Reference Counter',
                cancellable: true
            },
            async (progress, token) => {
                const config = vscode.workspace.getConfiguration('cssReferenceCounter');
                const excludePatterns = config.get<string[]>('excludePatterns', [
                    '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**',
                    '**/vendor/**', '**/bower_components/**', '**/.next/**', '**/.nuxt/**',
                    '**/coverage/**', '**/__pycache__/**', '**/out/**'
                ]);

                const excludeGlob = '{' + excludePatterns.join(',') + '}';

                // ── Step 1: CSS/SCSS files ─────────────────────────────
                if (token.isCancellationRequested) { return; }
                progress.report({ message: 'Finding CSS files...' });

                const cssFiles = await vscode.workspace.findFiles('**/*.{css,scss}', excludeGlob, 5000);
                let processed = 0;

                for (const file of cssFiles) {
                    if (token.isCancellationRequested) { return this.cancelled(); }
                    try {
                        const stat = await vscode.workspace.fs.stat(file);
                        if (stat.size > BackgroundScanner.MAX_FILE_SIZE) { continue; }

                        // For CSS files we still need openTextDocument since CssParser uses it
                        const doc = await vscode.workspace.openTextDocument(file);
                        this.cacheManager.updateCssFile(doc);
                    } catch { /* skip */ }
                    processed++;
                    if (processed % 20 === 0) {
                        progress.report({ message: `CSS files: ${processed}/${cssFiles.length}` });
                    }
                }

                // ── Step 2: Consumer files (raw read) ──────────────────
                if (token.isCancellationRequested) { return this.cancelled(); }
                progress.report({ message: 'Finding usage files...' });

                const includedTypes = config.get<string[]>('includedFileTypes', [
                    'html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'
                ]);
                const extGlob = '**/*.{' + includedTypes.join(',') + '}';

                const consumerFiles = await vscode.workspace.findFiles(
                    extGlob, excludeGlob, BackgroundScanner.MAX_CONSUMER_FILES
                );

                const totalConsumer = consumerFiles.length;
                processed = 0;

                // Process in batches of 200 using raw reads
                const batchSize = 200;
                for (let i = 0; i < consumerFiles.length; i += batchSize) {
                    if (token.isCancellationRequested) { return this.cancelled(); }

                    const batch = consumerFiles.slice(i, i + batchSize);
                    await Promise.all(
                        batch.map(async (file) => {
                            try {
                                const stat = await vscode.workspace.fs.stat(file);
                                if (stat.size > BackgroundScanner.MAX_FILE_SIZE) { return; }

                                // Read raw bytes — MUCH faster than openTextDocument
                                const rawBytes = await vscode.workspace.fs.readFile(file);
                                const text = Buffer.from(rawBytes).toString('utf-8');
                                const usages = this.rawScanner.scanRawText(text, file);
                                this.cacheManager.updateConsumerFileRaw(file, usages);
                            } catch { /* skip */ }
                        })
                    );

                    processed = Math.min(i + batchSize, totalConsumer);
                    progress.report({
                        message: `Usage files: ${processed}/${totalConsumer}`
                    });
                }

                // Rebuild aggregates once after all files are processed
                this.cacheManager.batchUpdateDone();

                vscode.window.setStatusBarMessage(
                    `$(check) CSS Reference Counter: Scanned ${cssFiles.length} CSS + ${totalConsumer} usage files`, 5000
                );
            }
        );
    }

    private cancelled(): void {
        vscode.window.setStatusBarMessage('$(x) CSS Reference Counter: Scan cancelled', 3000);
    }
}
