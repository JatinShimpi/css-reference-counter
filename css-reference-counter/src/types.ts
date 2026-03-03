import * as vscode from 'vscode';

/** Information about a CSS selector declaration */
export interface SelectorDeclaration {
    /** The selector string, e.g. ".card-header", "#main", "button" */
    selector: string;
    /** The raw selector name without prefix, e.g. "card-header", "main", "button" */
    name: string;
    /** Type of selector */
    type: 'class' | 'id' | 'element';
    /** File where the selector is declared */
    file: vscode.Uri;
    /** Line number (0-indexed) */
    line: number;
    /** Column number (0-indexed) */
    column: number;
    /** The full range of the selector rule block */
    range: vscode.Range;
}

/** A location where a CSS selector is used */
export interface UsageLocation {
    /** File where the selector is referenced */
    file: vscode.Uri;
    /** Line number (0-indexed) */
    line: number;
    /** Column number (0-indexed) */
    column: number;
    /** Range of the usage in the file */
    range: vscode.Range;
}

/** Cached data for a single file */
export interface FileCacheEntry {
    /** When this entry was last updated */
    lastModified: number;
    /** CSS declarations in this file (only for CSS/SCSS files) */
    declarations?: SelectorDeclaration[];
    /** Class/id usages found in this file (only for consumer files) */
    usages?: Map<string, UsageLocation[]>;
}
