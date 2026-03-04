import * as vscode from 'vscode';
import { UsageLocation } from './types';

/**
 * Lightweight scanner that works on raw file content strings.
 * Used by the background scanner to avoid the overhead of opening TextDocuments.
 */
export class RawFileScanner {

    /**
     * Scan raw file text for CSS class/id usages.
     * Returns a map of selector (e.g. ".foo") → list of usage locations.
     */
    scanRawText(text: string, fileUri: vscode.Uri): Map<string, UsageLocation[]> {
        const usages = new Map<string, UsageLocation[]>();
        const lineOffsets = this.buildLineOffsets(text);

        // 1. class="foo bar" or class='foo bar'
        this.scanPattern(text, /\bclass\s*=\s*["']([^"']+)["']/g, fileUri, lineOffsets, usages, 'class-multi', 'class');

        // 2. className="foo" or className={'foo'} or className={`foo`}
        this.scanPattern(text, /\bclassName\s*=\s*(?:["']([^"']+)["']|\{["'`]([^"'`]+)["'`]\})/g, fileUri, lineOffsets, usages, 'class-multi', 'class');

        // 3. id="foo"
        this.scanPattern(text, /\bid\s*=\s*["']([^"']+)["']/g, fileUri, lineOffsets, usages, 'single', 'id');

        // 4. classList.add('foo') etc.
        this.scanPattern(text, /classList\.\w+\(\s*["']([^"']+)["']/g, fileUri, lineOffsets, usages, 'single', 'class');

        // 5. querySelector('.foo')
        this.scanPattern(text, /querySelector(?:All)?\(\s*["']\.([a-zA-Z_-][a-zA-Z0-9_-]*)["']\s*\)/g, fileUri, lineOffsets, usages, 'single', 'class');

        // 6. getElementById('foo')
        this.scanPattern(text, /getElementById\(\s*["']([^"']+)["']\s*\)/g, fileUri, lineOffsets, usages, 'single', 'id');

        return usages;
    }

    private scanPattern(
        text: string,
        regex: RegExp,
        fileUri: vscode.Uri,
        lineOffsets: number[],
        usages: Map<string, UsageLocation[]>,
        mode: 'single' | 'class-multi',
        type: 'class' | 'id'
    ): void {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const value = match[1] || match[2];
            if (!value) { continue; }

            // Skip if this is actually a className match (not class)
            // e.g. className="foo" should only be caught by the className regex
            if (mode === 'class-multi' && type === 'class') {
                const before = text.substring(Math.max(0, match.index - 4), match.index);
                if (before.endsWith('Name') || before.endsWith('name')) { continue; }
            }

            if (mode === 'class-multi') {
                // Split space-separated classes
                const names = value.split(/\s+/).filter(n => n.length > 0);
                for (const name of names) {
                    const key = type === 'class' ? '.' + name : '#' + name;
                    const offset = match.index + match[0].indexOf(value);
                    const pos = this.offsetToPosition(offset, lineOffsets);
                    this.addUsage(usages, key, fileUri, pos);
                }
            } else {
                const key = type === 'class' ? '.' + value : '#' + value;
                const offset = match.index + match[0].indexOf(value);
                const pos = this.offsetToPosition(offset, lineOffsets);
                this.addUsage(usages, key, fileUri, pos);
            }
        }
    }

    private addUsage(
        usages: Map<string, UsageLocation[]>,
        key: string,
        fileUri: vscode.Uri,
        pos: vscode.Position
    ): void {
        if (!usages.has(key)) {
            usages.set(key, []);
        }
        usages.get(key)!.push({
            file: fileUri,
            line: pos.line,
            column: pos.character,
            range: new vscode.Range(pos, pos)
        });
    }

    private buildLineOffsets(text: string): number[] {
        const offsets = [0];
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                offsets.push(i + 1);
            }
        }
        return offsets;
    }

    private offsetToPosition(offset: number, lineOffsets: number[]): vscode.Position {
        let line = 0;
        for (let i = 1; i < lineOffsets.length; i++) {
            if (lineOffsets[i] > offset) { break; }
            line = i;
        }
        return new vscode.Position(line, offset - lineOffsets[line]);
    }
}
