import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';
import { RawFileScanner } from './rawFileScanner';

/**
 * Performs a workspace scan on extension activation.
 * Supports delta scanning — only re-scans files modified since the last cached scan.
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

    /**
     * Smart scan: loads cache first, then only scans files that changed.
     * Falls back to full scan if no cache exists.
     */
    async scanWorkspace(): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'CSS Reference Counter',
                cancellable: true
            },
            async (progress, token) => {
                this.cacheManager.setScanning(true);

                // Try to load cached data first
                progress.report({ message: 'Loading cache...' });
                const hasCachedData = await this.cacheManager.loadFromCache();
                console.log(`CSS Reference Counter: Cache loaded = ${hasCachedData}, timestamps = ${this.cacheManager.getFileTimestamps().size}`);

                const config = vscode.workspace.getConfiguration('cssReferenceCounter');
                const excludePatterns = config.get<string[]>('excludePatterns', [
                    '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**',
                    '**/target/**', '**/out/**', '**/vendor/**', '**/bower_components/**',
                    '**/.next/**', '**/.nuxt/**', '**/coverage/**', '**/__pycache__/**',
                    '**/.venv/**', '**/*.min.js', '**/*.min.css', '**/.svelte-kit/**',
                    '**/.angular/**', '**/.cache/**', '**/tmp/**', '**/public/assets/**'
                ]);

                const excludeGlob = '{' + excludePatterns.join(',') + '}';
                const cachedTimestamps = this.cacheManager.getFileTimestamps();

                // ── Step 1: CSS/SCSS files ─────────────────────────────
                if (token.isCancellationRequested) { return; }
                progress.report({ message: 'Finding CSS files...' });

                const cssFiles = await vscode.workspace.findFiles('**/*.{css,scss}', excludeGlob, 5000);
                let cssScanned = 0;
                let cssSkipped = 0;

                // Track which files still exist (to clean up deleted files from cache)
                const currentCssFiles = new Set<string>();

                for (const file of cssFiles) {
                    if (token.isCancellationRequested) { return this.cancelled(); }
                    const fileKey = file.toString();
                    currentCssFiles.add(fileKey);

                    try {
                        const stat = await vscode.workspace.fs.stat(file);
                        if (stat.size > BackgroundScanner.MAX_FILE_SIZE) { continue; }

                        const mtime = stat.mtime;
                        const cachedMtime = cachedTimestamps.get(fileKey);

                        // Skip if file hasn't changed since last scan
                        if (hasCachedData && cachedMtime !== undefined && cachedMtime >= mtime) {
                            cssSkipped++;
                            continue;
                        }

                        // File is new or modified — scan it
                        const doc = await vscode.workspace.openTextDocument(file);
                        this.cacheManager.updateCssFileBatch(doc);
                        this.cacheManager.setFileTimestamp(fileKey, mtime);
                        cssScanned++;
                    } catch { /* skip */ }

                    if ((cssScanned + cssSkipped) % 20 === 0) {
                        progress.report({ message: `CSS files: ${cssScanned + cssSkipped}/${cssFiles.length}${cssSkipped > 0 ? ` (${cssSkipped} cached)` : ''}` });
                    }
                }

                // Remove deleted CSS files from cache
                if (hasCachedData) {
                    for (const cachedFile of this.cacheManager.getCssFilesMap().keys()) {
                        if (!currentCssFiles.has(cachedFile)) {
                            this.cacheManager.getCssFilesMap().delete(cachedFile);
                            cachedTimestamps.delete(cachedFile);
                        }
                    }
                }

                // ── Step 2: Consumer files (raw read) ──────────────────
                if (token.isCancellationRequested) { return this.cancelled(); }
                progress.report({ message: 'Finding usage files...' });

                const includedTypes = config.get<string[]>('includedFileTypes', [
                    'html', 'htm', 'jsx', 'tsx', 'vue', 'svelte', 'js', 'ts'
                ]);
                const extGlob = '**/*.{' + includedTypes.join(',') + '}';

                const consumerFiles = await vscode.workspace.findFiles(
                    extGlob, excludeGlob, BackgroundScanner.MAX_CONSUMER_FILES
                );

                const totalConsumer = consumerFiles.length;
                let consumerScanned = 0;
                let consumerSkipped = 0;

                // Track which consumer files still exist
                const currentConsumerFiles = new Set<string>();

                // Process in batches of 200 using raw reads
                const batchSize = 200;
                for (let i = 0; i < consumerFiles.length; i += batchSize) {
                    if (token.isCancellationRequested) { return this.cancelled(); }

                    const batch = consumerFiles.slice(i, i + batchSize);
                    await Promise.all(
                        batch.map(async (file) => {
                            const fileKey = file.toString();
                            currentConsumerFiles.add(fileKey);

                            try {
                                const stat = await vscode.workspace.fs.stat(file);
                                if (stat.size > BackgroundScanner.MAX_FILE_SIZE) { return; }

                                const mtime = stat.mtime;
                                const cachedMtime = cachedTimestamps.get(fileKey);

                                // Skip if file hasn't changed since last scan
                                if (hasCachedData && cachedMtime !== undefined && cachedMtime >= mtime) {
                                    consumerSkipped++;
                                    return;
                                }

                                // File is new or modified — scan it
                                const rawBytes = await vscode.workspace.fs.readFile(file);
                                const text = new TextDecoder('utf-8').decode(rawBytes);
                                const usages = this.rawScanner.scanRawText(text, file);
                                this.cacheManager.updateConsumerFileRaw(file, usages);
                                this.cacheManager.setFileTimestamp(fileKey, mtime);
                                consumerScanned++;
                            } catch { /* skip */ }
                        })
                    );

                    const processed = Math.min(i + batchSize, totalConsumer);
                    progress.report({
                        message: `Usage files: ${processed}/${totalConsumer}${consumerSkipped > 0 ? ` (${consumerSkipped} cached)` : ''}`
                    });
                }

                // Remove deleted consumer files from cache
                if (hasCachedData) {
                    for (const cachedFile of this.cacheManager.getConsumerFilesMap().keys()) {
                        if (!currentConsumerFiles.has(cachedFile)) {
                            this.cacheManager.getConsumerFilesMap().delete(cachedFile);
                            cachedTimestamps.delete(cachedFile);
                        }
                    }
                }

                // Rebuild aggregates and persist
                this.cacheManager.batchUpdateDone();

                const totalSkipped = cssSkipped + consumerSkipped;
                const totalScanned = cssScanned + consumerScanned;
                const cacheMsg = totalSkipped > 0
                    ? ` (${totalSkipped} from cache, ${totalScanned} rescanned)`
                    : '';

                vscode.window.setStatusBarMessage(
                    `$(check) CSS Reference Counter: ${cssFiles.length} CSS + ${totalConsumer} usage files${cacheMsg}`, 5000
                );
                console.log(`CSS Reference Counter: Scan complete. CSS: ${cssScanned} scanned, ${cssSkipped} cached. Consumer: ${consumerScanned} scanned, ${consumerSkipped} cached.`);

                this.cacheManager.setScanning(false);
            }
        );
    }

    private cancelled(): void {
        this.cacheManager.setScanning(false);
        vscode.window.setStatusBarMessage('$(x) CSS Reference Counter: Scan cancelled', 3000);
    }
}
