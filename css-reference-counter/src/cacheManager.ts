import * as vscode from 'vscode';
import { SelectorDeclaration, UsageLocation, FileCacheEntry } from './types';
import { CssParser } from './cssParser';
import { UsageScanner } from './usageScanner';

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

    private _onDidChange = new vscode.EventEmitter<void>();
    /** Fires when the cache is updated */
    readonly onDidChange = this._onDidChange.event;

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
