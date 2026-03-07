import * as vscode from 'vscode';
import { SelectorDeclaration, UsageLocation, FileCacheEntry } from './types';
import { CssParser } from './cssParser';
import { UsageScanner } from './usageScanner';
import { PersistentCache } from './persistentCache';

/**
 * In-memory cache for CSS declarations and their usages.
 * Provides fast lookups for CodeLens counts and navigation.
 */
export class CacheManager {
    /** CSS declarations per file */
    private cssFiles = new Map<string, SelectorDeclaration[]>();

    /** Usages per consumer file: filePath → Map<selector, UsageLocation[]> */
    private consumerFiles = new Map<string, Map<string, UsageLocation[]>>();

    /** Aggregated usage counts: selector → total count */
    private usageCounts = new Map<string, number>();

    /** Aggregated usage locations: selector → all usage locations */
    private usageLocations = new Map<string, UsageLocation[]>();

    private cssParser = new CssParser();
    private usageScanner = new UsageScanner();
    private persistentCache: PersistentCache | undefined;

    /** Tracks file modification timestamps for delta scanning */
    private fileTimestamps = new Map<string, number>();

    /** Whether a background scan is in progress */
    private _isScanning = false;

    private _onDidChange = new vscode.EventEmitter<void>();
    /** Fires when the cache is updated */
    readonly onDidChange = this._onDidChange.event;

    private _onDidChangeScanState = new vscode.EventEmitter<boolean>();
    /** Fires when scanning state changes (true = scanning, false = done) */
    readonly onDidChangeScanState = this._onDidChangeScanState.event;

    /** Whether a background scan is currently in progress */
    get isScanning(): boolean {
        return this._isScanning;
    }

    /** Set the scanning state */
    setScanning(value: boolean): void {
        this._isScanning = value;
        this._onDidChangeScanState.fire(value);
        if (!value) {
            // When scan completes, refresh CodeLens
            this._onDidChange.fire();
        }
    }

    /**
     * Parse and cache a CSS/SCSS document.
     */
    updateCssFile(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const declarations = this.cssParser.parseDocument(document);
        this.cssFiles.set(key, declarations);
        this.rebuildAggregates();
        this._onDidChange.fire();
    }

    /**
     * Scan and cache a consumer file (HTML, JSX, etc.).
     */
    updateConsumerFile(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const usages = this.usageScanner.scanDocument(document);
        this.consumerFiles.set(key, usages);
        this.rebuildAggregates();
        this._onDidChange.fire();
    }

    /**
     * Parse and cache a CSS/SCSS document without rebuilding aggregates.
     * Used during background scan — call batchUpdateDone() after all files.
     */
    updateCssFileBatch(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const declarations = this.cssParser.parseDocument(document);
        this.cssFiles.set(key, declarations);
    }

    /**
     * Update cache with pre-scanned raw usage data (from BackgroundScanner).
     * Does NOT rebuild aggregates — call batchUpdateDone() after bulk inserts.
     */
    updateConsumerFileRaw(uri: vscode.Uri, usages: Map<string, UsageLocation[]>): void {
        this.consumerFiles.set(uri.toString(), usages);
    }

    /**
     * Call after a batch of updateConsumerFileRaw() calls to rebuild indexes.
     */
    batchUpdateDone(): void {
        this.rebuildAggregates();
        this._onDidChange.fire();
        // Persist cache to disk after a full scan (fire-and-catch)
        this.saveCache().catch(err => {
            console.warn('CSS Reference Counter: Failed to persist cache:', err);
        });
    }

    /**
     * Remove a file from the cache.
     */
    removeFile(uri: vscode.Uri): void {
        const key = uri.toString();
        this.cssFiles.delete(key);
        this.consumerFiles.delete(key);
        this.rebuildAggregates();
        this._onDidChange.fire();
    }

    /**
     * Get the usage count for a specific selector.
     */
    getUsageCount(selector: string): number {
        return this.usageCounts.get(selector) || 0;
    }

    /**
     * Get all usage locations for a specific selector.
     */
    getUsageLocations(selector: string): UsageLocation[] {
        return this.usageLocations.get(selector) || [];
    }

    /**
     * Get all CSS declarations across all files.
     */
    getAllDeclarations(): SelectorDeclaration[] {
        const all: SelectorDeclaration[] = [];
        for (const declarations of this.cssFiles.values()) {
            all.push(...declarations);
        }
        return all;
    }

    /**
     * Get CSS declarations for a specific file.
     */
    getDeclarationsForFile(uri: vscode.Uri): SelectorDeclaration[] {
        return this.cssFiles.get(uri.toString()) || [];
    }

    /**
     * Find the declaration location for a selector name.
     * Returns the first matching declaration.
     */
    findDeclaration(selectorName: string, type: 'class' | 'id'): SelectorDeclaration | undefined {
        const selector = type === 'class' ? '.' + selectorName : '#' + selectorName;
        for (const declarations of this.cssFiles.values()) {
            const found = declarations.find(d => d.selector === selector);
            if (found) { return found; }
        }
        return undefined;
    }

    /**
     * Find all declarations for a selector name (could be in multiple files).
     */
    findAllDeclarations(selectorName: string, type: 'class' | 'id'): SelectorDeclaration[] {
        const selector = type === 'class' ? '.' + selectorName : '#' + selectorName;
        const results: SelectorDeclaration[] = [];
        for (const declarations of this.cssFiles.values()) {
            results.push(...declarations.filter(d => d.selector === selector));
        }
        return results;
    }

    /**
     * Get the usage scanner instance (for position-based lookups).
     */
    getUsageScanner(): UsageScanner {
        return this.usageScanner;
    }

    // ─── Persistence support ──────────────────────────────────────────

    /** Initialize persistence with a workspace storage URI */
    initPersistence(storageUri: vscode.Uri | undefined): void {
        this.persistentCache = new PersistentCache(storageUri);
    }

    /** Get the file timestamps map (for delta scanning) */
    getFileTimestamps(): Map<string, number> {
        return this.fileTimestamps;
    }

    /** Set a file's modification timestamp */
    setFileTimestamp(fileUri: string, mtime: number): void {
        this.fileTimestamps.set(fileUri, mtime);
    }

    /** Get read-only access to internal CSS files map (for persistence) */
    getCssFilesMap(): Map<string, SelectorDeclaration[]> {
        return this.cssFiles;
    }

    /** Get read-only access to internal consumer files map (for persistence) */
    getConsumerFilesMap(): Map<string, Map<string, UsageLocation[]>> {
        return this.consumerFiles;
    }

    /**
     * Load cached data from disk. Returns true if cache was loaded successfully.
     */
    async loadFromCache(): Promise<boolean> {
        if (!this.persistentCache) { return false; }

        const cached = await this.persistentCache.load();
        if (!cached) { return false; }

        this.cssFiles = cached.cssFiles;
        this.consumerFiles = cached.consumerFiles;
        this.fileTimestamps = cached.fileTimestamps;
        this.rebuildAggregates();
        this._onDidChange.fire();
        return true;
    }

    /**
     * Save current cache to disk.
     */
    async saveCache(): Promise<void> {
        if (!this.persistentCache) { return; }
        await this.persistentCache.save(this.cssFiles, this.consumerFiles, this.fileTimestamps);
    }

    /**
     * Rebuild the aggregated counts and locations from all consumer files.
     */
    private rebuildAggregates(): void {
        this.usageCounts.clear();
        this.usageLocations.clear();

        for (const fileUsages of this.consumerFiles.values()) {
            for (const [selector, locations] of fileUsages) {
                const currentCount = this.usageCounts.get(selector) || 0;
                this.usageCounts.set(selector, currentCount + locations.length);

                const currentLocations = this.usageLocations.get(selector) || [];
                currentLocations.push(...locations);
                this.usageLocations.set(selector, currentLocations);
            }
        }
    }
}
