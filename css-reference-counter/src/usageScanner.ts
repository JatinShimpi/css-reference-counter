import * as vscode from 'vscode';
import { UsageLocation } from './types';

/**
 * Scans consumer files (HTML, JSX, TSX, Vue, Svelte, JS, TS)
 * for CSS class and id references.
 */
export class UsageScanner {

    /** Supported language IDs for consumer files */
    private static readonly CONSUMER_LANGUAGES = new Set([
        'html', 'javascriptreact', 'typescriptreact', 'vue', 'svelte',
        'javascript', 'typescript'
    ]);

    /**
     * Check if a document is a consumer file (not CSS/SCSS).
     */
    static isConsumerFile(document: vscode.TextDocument): boolean {
        return UsageScanner.CONSUMER_LANGUAGES.has(document.languageId);
    }

    /**
     * Check if a file extension is a consumer type.
     */
    static isConsumerExtension(ext: string): boolean {
        const consumerExts = new Set(['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte', 'js', 'ts']);
        return consumerExts.has(ext.toLowerCase());
    }

    /**
     * Scan a document and return all class/id usages found.
     * Returns a map of selector name → list of usage locations.
     */
    scanDocument(document: vscode.TextDocument): Map<string, UsageLocation[]> {
        const text = document.getText();
        const usages = new Map<string, UsageLocation[]>();

        // 1. HTML class="foo bar baz" and class='foo bar baz'
        this.scanHtmlClassAttribute(text, document, usages);

        // 2. JSX/TSX className="foo bar" and className={'foo bar'}
        this.scanJsxClassName(text, document, usages);

        // 3. HTML id="foo" and id='foo'
        this.scanHtmlIdAttribute(text, document, usages);

        // 4. classList.add('foo'), classList.toggle('bar'), classList.remove('baz')
        this.scanClassListMethods(text, document, usages);

        // 5. Vue :class="'foo'" and :class="{ foo: true }"
        this.scanVueClassBinding(text, document, usages);

        // 6. document.querySelector('.foo') / getElementById('bar')
        this.scanDomQueries(text, document, usages);

        return usages;
    }

    /**
     * Get the class name at a specific position in a document.
     * Returns the class name (without . or #) if the cursor is on one, else null.
     */
    getClassNameAtPosition(document: vscode.TextDocument, position: vscode.Position): { name: string; type: 'class' | 'id'; range: vscode.Range } | null {
        const line = document.lineAt(position.line).text;
        const offset = position.character;

        // Check if we're inside class="..." or className="..."
        const classAttrRegex = /(?:class|className)\s*=\s*["'{]([^"'}]+)["'}]/g;
        let match: RegExpExecArray | null;
        while ((match = classAttrRegex.exec(line)) !== null) {
            const valueStart = match.index + match[0].indexOf(match[1]);
            const valueEnd = valueStart + match[1].length;
            if (offset >= valueStart && offset <= valueEnd) {
                // Find the specific class at the cursor
                const classes = match[1].split(/\s+/);
                let currentOffset = valueStart;
                for (const cls of classes) {
                    if (!cls) { currentOffset++; continue; }
                    const clsStart = line.indexOf(cls, currentOffset);
                    const clsEnd = clsStart + cls.length;
                    if (offset >= clsStart && offset <= clsEnd) {
                        return {
                            name: cls,
                            type: 'class',
                            range: new vscode.Range(position.line, clsStart, position.line, clsEnd)
                        };
                    }
                    currentOffset = clsEnd;
                }
            }
        }

        // Check if we're inside id="..."
        const idAttrRegex = /id\s*=\s*["']([^"']+)["']/g;
        while ((match = idAttrRegex.exec(line)) !== null) {
            const valueStart = match.index + match[0].indexOf(match[1]);
            const valueEnd = valueStart + match[1].length;
            if (offset >= valueStart && offset <= valueEnd) {
                return {
                    name: match[1],
                    type: 'id',
                    range: new vscode.Range(position.line, valueStart, position.line, valueEnd)
                };
            }
        }

        return null;
    }

    // ─── Private scan methods ──────────────────────────────────────────

    private scanHtmlClassAttribute(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        // Match class="value" or class='value' (not className)
        const regex = /\bclass\s*=\s*["']([^"']+)["']/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            // Skip if preceded by "Name" (className)
            const before = text.substring(Math.max(0, match.index - 4), match.index);
            if (before.endsWith('Name') || before.endsWith('name')) { continue; }

            const classes = match[1].split(/\s+/);
            const valueStart = match.index + match[0].indexOf(match[1]);
            let searchFrom = valueStart;

            for (const cls of classes) {
                if (!cls) { continue; }
                const clsIdx = text.indexOf(cls, searchFrom);
                if (clsIdx === -1) { continue; }
                const pos = document.positionAt(clsIdx);
                const endPos = document.positionAt(clsIdx + cls.length);
                this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
                searchFrom = clsIdx + cls.length;
            }
        }
    }

    private scanJsxClassName(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        // Match className="value" or className={'value'} or className={`value`}
        const regex = /\bclassName\s*=\s*(?:["']([^"']+)["']|\{["'`]([^"'`]+)["'`]\})/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const value = match[1] || match[2];
            if (!value) { continue; }

            const classes = value.split(/\s+/);
            const fullMatch = match[0];
            const valueIdxInMatch = fullMatch.indexOf(value);
            const valueStart = match.index + valueIdxInMatch;
            let searchFrom = valueStart;

            for (const cls of classes) {
                if (!cls) { continue; }
                const clsIdx = text.indexOf(cls, searchFrom);
                if (clsIdx === -1) { continue; }
                const pos = document.positionAt(clsIdx);
                const endPos = document.positionAt(clsIdx + cls.length);
                this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
                searchFrom = clsIdx + cls.length;
            }
        }
    }

    private scanHtmlIdAttribute(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        const regex = /\bid\s*=\s*["']([^"']+)["']/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const id = match[1].trim();
            if (!id) { continue; }
            const valueStart = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(valueStart);
            const endPos = document.positionAt(valueStart + id.length);
            this.addUsage(usages, id, 'id', document.uri, pos, endPos);
        }
    }

    private scanClassListMethods(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        // classList.add('foo'), classList.remove('bar'), classList.toggle('baz'), classList.contains('qux')
        const regex = /classList\.\w+\(\s*["']([^"']+)["']/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const cls = match[1].trim();
            if (!cls) { continue; }
            const valueStart = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(valueStart);
            const endPos = document.positionAt(valueStart + cls.length);
            this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
        }
    }

    private scanVueClassBinding(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        // :class="'foo'" or :class="{ foo: condition }" or :class="['foo', 'bar']"
        const regex = /:class\s*=\s*"\{([^}]+)\}"/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            // Extract keys from object syntax { foo: true, bar: false }
            const objContent = match[1];
            const keyRegex = /\b([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:/g;
            let keyMatch: RegExpExecArray | null;
            while ((keyMatch = keyRegex.exec(objContent)) !== null) {
                const cls = keyMatch[1];
                const clsIdx = match.index + match[0].indexOf(objContent) + keyMatch.index;
                const pos = document.positionAt(clsIdx);
                const endPos = document.positionAt(clsIdx + cls.length);
                this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
            }
        }

        // :class="['foo', 'bar']" or :class="'foo'"
        const strRegex = /:class\s*=\s*"(?:\[)?['"]([^'"]+)['"](?:\])?"/g;
        while ((match = strRegex.exec(text)) !== null) {
            const cls = match[1].trim();
            if (!cls) { continue; }
            const valueStart = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(valueStart);
            const endPos = document.positionAt(valueStart + cls.length);
            this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
        }
    }

    private scanDomQueries(text: string, document: vscode.TextDocument, usages: Map<string, UsageLocation[]>): void {
        // document.querySelector('.foo') / querySelectorAll('.foo')
        const qsRegex = /querySelector(?:All)?\(\s*["']\.([a-zA-Z_-][a-zA-Z0-9_-]*)["']\s*\)/g;
        let match: RegExpExecArray | null;
        while ((match = qsRegex.exec(text)) !== null) {
            const cls = match[1];
            const valueStart = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(valueStart);
            const endPos = document.positionAt(valueStart + cls.length);
            this.addUsage(usages, cls, 'class', document.uri, pos, endPos);
        }

        // document.getElementById('foo')
        const idRegex = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
        while ((match = idRegex.exec(text)) !== null) {
            const id = match[1].trim();
            const valueStart = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(valueStart);
            const endPos = document.positionAt(valueStart + id.length);
            this.addUsage(usages, id, 'id', document.uri, pos, endPos);
        }
    }

    private addUsage(
        usages: Map<string, UsageLocation[]>,
        name: string,
        type: 'class' | 'id',
        file: vscode.Uri,
        pos: vscode.Position,
        endPos: vscode.Position
    ): void {
        // Store using the CSS selector format: .className or #idName
        const key = type === 'class' ? '.' + name : '#' + name;
        if (!usages.has(key)) {
            usages.set(key, []);
        }
        usages.get(key)!.push({
            file,
            line: pos.line,
            column: pos.character,
            range: new vscode.Range(pos, endPos)
        });
    }
}
