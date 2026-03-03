import * as vscode from 'vscode';
import { SelectorDeclaration } from './types';

/**
 * Parses CSS/SCSS files to extract selector declarations.
 * Uses regex-based parsing for speed — no heavy dependencies.
 */
export class CssParser {

    /**
     * Parse a CSS/SCSS document and return all selector declarations.
     */
    parseDocument(document: vscode.TextDocument): SelectorDeclaration[] {
        const text = document.getText();
        const declarations: SelectorDeclaration[] = [];

        // Remove block comments to avoid false matches
        const cleanedText = this.removeComments(text);

        // Build a line offset map from the ORIGINAL text so positions stay correct
        const lineOffsets = this.buildLineOffsets(text);

        // Match CSS rule blocks: selector(s) { ... }
        // This regex captures everything before a '{' as the selector group
        const ruleRegex = /([^{}@/]+?)\s*\{/g;
        let match: RegExpExecArray | null;

        while ((match = ruleRegex.exec(cleanedText)) !== null) {
            const selectorGroup = match[1].trim();
            if (!selectorGroup || selectorGroup.startsWith('@') || selectorGroup.startsWith('//')) {
                continue;
            }

            // Split comma-separated selectors: ".foo, .bar { }" → [".foo", ".bar"]
            const selectors = selectorGroup.split(',');

            for (const rawSelector of selectors) {
                const trimmed = rawSelector.trim();
                if (!trimmed) { continue; }

                // Extract individual class/id/element selectors from compound selectors
                const extracted = this.extractSelectors(trimmed);
                const selectorStartInFile = match.index + match[1].indexOf(rawSelector.trimStart());

                for (const sel of extracted) {
                    const pos = this.offsetToPosition(selectorStartInFile, lineOffsets);
                    const endPos = new vscode.Position(pos.line, pos.character + trimmed.length);

                    declarations.push({
                        selector: sel.selector,
                        name: sel.name,
                        type: sel.type,
                        file: document.uri,
                        line: pos.line,
                        column: pos.character,
                        range: new vscode.Range(pos, endPos)
                    });
                }
            }
        }

        return declarations;
    }

    /**
     * Extract class, id, and element selectors from a compound selector string.
     * e.g. ".card-header > .title" → [{ selector: ".card-header", name: "card-header", type: "class" }, ...]
     */
    private extractSelectors(compound: string): Array<{ selector: string; name: string; type: 'class' | 'id' | 'element' }> {
        const results: Array<{ selector: string; name: string; type: 'class' | 'id' | 'element' }> = [];
        const seen = new Set<string>();

        // Match class selectors: .foo-bar, .foo_bar, .foo123
        const classRegex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
        let m: RegExpExecArray | null;
        while ((m = classRegex.exec(compound)) !== null) {
            if (!seen.has('.' + m[1])) {
                seen.add('.' + m[1]);
                results.push({ selector: '.' + m[1], name: m[1], type: 'class' });
            }
        }

        // Match id selectors: #foo
        const idRegex = /#([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
        while ((m = idRegex.exec(compound)) !== null) {
            if (!seen.has('#' + m[1])) {
                seen.add('#' + m[1]);
                results.push({ selector: '#' + m[1], name: m[1], type: 'id' });
            }
        }

        return results;
    }

    /**
     * Remove CSS block comments and single-line comments.
     */
    private removeComments(text: string): string {
        // Remove block comments /* ... */
        let result = text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
            // Replace with same number of newlines to preserve line numbers
            return match.replace(/[^\n]/g, ' ');
        });
        // Remove single-line comments // ... (SCSS)
        result = result.replace(/\/\/.*$/gm, (match) => {
            return ' '.repeat(match.length);
        });
        return result;
    }

    /**
     * Build line offset array for converting character offsets to line/column.
     */
    private buildLineOffsets(text: string): number[] {
        const offsets: number[] = [0];
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                offsets.push(i + 1);
            }
        }
        return offsets;
    }

    /**
     * Convert a character offset to a VS Code Position (line, column).
     */
    private offsetToPosition(offset: number, lineOffsets: number[]): vscode.Position {
        let line = 0;
        for (let i = 1; i < lineOffsets.length; i++) {
            if (lineOffsets[i] > offset) {
                break;
            }
            line = i;
        }
        const column = offset - lineOffsets[line];
        return new vscode.Position(line, column);
    }
}
