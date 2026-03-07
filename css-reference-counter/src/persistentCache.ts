import * as vscode from 'vscode';
import { SelectorDeclaration, UsageLocation } from './types';

/**
 * Serializable versions of our types (no vscode.Uri / vscode.Range).
 */
interface SerializedDeclaration {
    selector: string;
    name: string;
    type: 'class' | 'id' | 'element';
    file: string; // URI string
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

interface SerializedUsageLocation {
    file: string; // URI string
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

interface CacheData {
    version: number;
    savedAt: number;
    /** file URI string → modification time (ms) */
    fileTimestamps: Record<string, number>;
    /** CSS file URI string → declarations */
    cssFiles: Record<string, SerializedDeclaration[]>;
    /** Consumer file URI string → { selector → usage locations } */
    consumerFiles: Record<string, Record<string, SerializedUsageLocation[]>>;
}

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'css-ref-cache.json';

/**
 * Handles persisting and loading the scan cache to/from disk.
 * Uses VS Code's workspace-specific storage directory.
 */
export class PersistentCache {

    private cacheUri: vscode.Uri | undefined;

    constructor(private storageUri: vscode.Uri | undefined) {
        if (storageUri) {
            this.cacheUri = vscode.Uri.joinPath(storageUri, CACHE_FILENAME);
        }
    }

    /**
     * Save the current in-memory cache to disk.
     */
    async save(
        cssFiles: Map<string, SelectorDeclaration[]>,
        consumerFiles: Map<string, Map<string, UsageLocation[]>>,
        fileTimestamps: Map<string, number>
    ): Promise<void> {
        if (!this.cacheUri) { return; }

        try {
            // Ensure storage directory exists
            await vscode.workspace.fs.createDirectory(this.storageUri!);

            const data: CacheData = {
                version: CACHE_VERSION,
                savedAt: Date.now(),
                fileTimestamps: Object.fromEntries(fileTimestamps),
                cssFiles: {},
                consumerFiles: {}
            };

            // Serialize CSS declarations
            for (const [fileKey, declarations] of cssFiles) {
                data.cssFiles[fileKey] = declarations.map(d => ({
                    selector: d.selector,
                    name: d.name,
                    type: d.type,
                    file: d.file.toString(),
                    line: d.line,
                    column: d.column,
                    endLine: d.range.end.line,
                    endColumn: d.range.end.character
                }));
            }

            // Serialize consumer usages
            for (const [fileKey, usagesMap] of consumerFiles) {
                const serializedUsages: Record<string, SerializedUsageLocation[]> = {};
                for (const [selector, locations] of usagesMap) {
                    serializedUsages[selector] = locations.map(loc => ({
                        file: loc.file.toString(),
                        line: loc.line,
                        column: loc.column,
                        endLine: loc.range.end.line,
                        endColumn: loc.range.end.character
                    }));
                }
                data.consumerFiles[fileKey] = serializedUsages;
            }

            const json = JSON.stringify(data);
            await vscode.workspace.fs.writeFile(this.cacheUri, new TextEncoder().encode(json));
            console.log(`CSS Reference Counter: Cache saved (${cssFiles.size} CSS files, ${consumerFiles.size} consumer files, ${Math.round(json.length / 1024)} KB)`);
        } catch (err) {
            console.warn('CSS Reference Counter: Failed to save cache:', err);
        }
    }

    /**
     * Load cached data from disk.
     * Returns null if no cache exists or if the cache is invalid/outdated.
     */
    async load(): Promise<{
        cssFiles: Map<string, SelectorDeclaration[]>;
        consumerFiles: Map<string, Map<string, UsageLocation[]>>;
        fileTimestamps: Map<string, number>;
    } | null> {
        if (!this.cacheUri) { return null; }

        try {
            const raw = await vscode.workspace.fs.readFile(this.cacheUri);
            const data: CacheData = JSON.parse(new TextDecoder().decode(raw));

            // Version check
            if (data.version !== CACHE_VERSION) { return null; }

            // Deserialize CSS declarations
            const cssFiles = new Map<string, SelectorDeclaration[]>();
            for (const [fileKey, serialized] of Object.entries(data.cssFiles)) {
                cssFiles.set(fileKey, serialized.map(d => ({
                    selector: d.selector,
                    name: d.name,
                    type: d.type,
                    file: vscode.Uri.parse(d.file),
                    line: d.line,
                    column: d.column,
                    range: new vscode.Range(d.line, d.column, d.endLine, d.endColumn)
                })));
            }

            // Deserialize consumer usages
            const consumerFiles = new Map<string, Map<string, UsageLocation[]>>();
            for (const [fileKey, serializedUsages] of Object.entries(data.consumerFiles)) {
                const usagesMap = new Map<string, UsageLocation[]>();
                for (const [selector, locations] of Object.entries(serializedUsages)) {
                    usagesMap.set(selector, locations.map(loc => ({
                        file: vscode.Uri.parse(loc.file),
                        line: loc.line,
                        column: loc.column,
                        range: new vscode.Range(loc.line, loc.column, loc.endLine, loc.endColumn)
                    })));
                }
                consumerFiles.set(fileKey, usagesMap);
            }

            const fileTimestamps = new Map<string, number>(
                Object.entries(data.fileTimestamps).map(([k, v]) => [k, Number(v)])
            );

            console.log(`CSS Reference Counter: Cache loaded (${cssFiles.size} CSS files, ${consumerFiles.size} consumer files, ${fileTimestamps.size} timestamps)`);

            return { cssFiles, consumerFiles, fileTimestamps };
        } catch (err) {
            // Cache doesn't exist or is corrupted — start fresh
            console.log('CSS Reference Counter: No cache found, will do full scan.', err);
            return null;
        }
    }
}
