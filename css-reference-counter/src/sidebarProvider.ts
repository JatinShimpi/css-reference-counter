import * as vscode from 'vscode';
import { CacheManager } from './cacheManager';

/**
 * Tree item representing an action, status, or exclude pattern in the sidebar.
 */
class CssRefTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'status' | 'stat' | 'action' | 'section' | 'excludePattern',
        options?: {
            description?: string;
            tooltip?: string;
            icon?: vscode.ThemeIcon;
            command?: vscode.Command;
            contextValue?: string;
        }
    ) {
        super(label, collapsibleState);
        if (options) {
            this.description = options.description;
            this.tooltip = options.tooltip;
            this.iconPath = options.icon;
            this.command = options.command;
            this.contextValue = options.contextValue;
        }
    }
}

/**
 * Sidebar tree data provider for CSS Reference Counter.
 * Shows scan status, stats, exclude patterns, and action buttons.
 */
export class CssSidebarProvider implements vscode.TreeDataProvider<CssRefTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CssRefTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Section headers (used as parents for children)
    private excludeSection = new CssRefTreeItem(
        'Excluded Folders',
        vscode.TreeItemCollapsibleState.Collapsed,
        'section',
        {
            icon: new vscode.ThemeIcon('folder-library'),
            tooltip: 'Folders and patterns excluded from scanning',
            contextValue: 'excludeSection'
        }
    );

    constructor(private cacheManager: CacheManager) {
        // Refresh the tree when scan state or cache changes
        cacheManager.onDidChangeScanState(() => {
            this._onDidChangeTreeData.fire();
        });
        cacheManager.onDidChange(() => {
            this._onDidChangeTreeData.fire();
        });

        // Refresh when settings change
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('cssReferenceCounter.excludePatterns')) {
                this._onDidChangeTreeData.fire();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CssRefTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CssRefTreeItem): CssRefTreeItem[] {
        // Children of the "Excluded Folders" section
        if (element === this.excludeSection) {
            return this.getExcludePatternItems();
        }

        // Root-level items
        if (!element) {
            return this.getRootItems();
        }

        return [];
    }

    private getRootItems(): CssRefTreeItem[] {
        const items: CssRefTreeItem[] = [];

        // Status item
        if (this.cacheManager.isScanning) {
            items.push(new CssRefTreeItem(
                'Scanning workspace...',
                vscode.TreeItemCollapsibleState.None,
                'status',
                {
                    icon: new vscode.ThemeIcon('sync~spin'),
                    description: 'Please wait',
                    tooltip: 'The extension is scanning your workspace for CSS references.'
                }
            ));
        } else {
            const declarations = this.cacheManager.getAllDeclarations();
            const cssFileCount = new Set(declarations.map(d => d.file.toString())).size;
            const totalSelectors = declarations.length;

            items.push(new CssRefTreeItem(
                'Status',
                vscode.TreeItemCollapsibleState.None,
                'status',
                {
                    icon: new vscode.ThemeIcon('check'),
                    description: 'Scan complete',
                    tooltip: `Found ${totalSelectors} CSS selectors across ${cssFileCount} files.`
                }
            ));

            items.push(new CssRefTreeItem(
                'CSS Files',
                vscode.TreeItemCollapsibleState.None,
                'stat',
                {
                    icon: new vscode.ThemeIcon('file-code'),
                    description: `${cssFileCount}`,
                    tooltip: `${cssFileCount} CSS/SCSS files indexed`
                }
            ));

            items.push(new CssRefTreeItem(
                'Selectors',
                vscode.TreeItemCollapsibleState.None,
                'stat',
                {
                    icon: new vscode.ThemeIcon('symbol-class'),
                    description: `${totalSelectors}`,
                    tooltip: `${totalSelectors} CSS selectors tracked`
                }
            ));
        }

        // Excluded Folders section
        items.push(this.excludeSection);

        // Rescan action
        items.push(new CssRefTreeItem(
            'Rescan Workspace',
            vscode.TreeItemCollapsibleState.None,
            'action',
            {
                icon: new vscode.ThemeIcon('refresh'),
                description: '',
                tooltip: 'Re-scan the entire workspace for CSS references',
                command: {
                    command: 'cssReferenceCounter.rescan',
                    title: 'Rescan Workspace'
                }
            }
        ));

        return items;
    }

    private getExcludePatternItems(): CssRefTreeItem[] {
        const config = vscode.workspace.getConfiguration('cssReferenceCounter');
        const patterns = config.get<string[]>('excludePatterns', []);
        const items: CssRefTreeItem[] = [];

        for (const pattern of patterns) {
            // Show a cleaner label by stripping leading **/
            const displayName = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
            items.push(new CssRefTreeItem(
                displayName,
                vscode.TreeItemCollapsibleState.None,
                'excludePattern',
                {
                    icon: new vscode.ThemeIcon('exclude'),
                    description: pattern !== displayName ? pattern : '',
                    tooltip: `Excluded pattern: ${pattern}\nClick to remove`,
                    contextValue: 'excludePatternItem',
                    command: {
                        command: 'cssReferenceCounter.removeExcludePattern',
                        title: 'Remove Pattern',
                        arguments: [pattern]
                    }
                }
            ));
        }

        // "Add pattern" item
        items.push(new CssRefTreeItem(
            'Add Exclude Pattern...',
            vscode.TreeItemCollapsibleState.None,
            'action',
            {
                icon: new vscode.ThemeIcon('add'),
                tooltip: 'Add a new folder or pattern to exclude from scanning',
                command: {
                    command: 'cssReferenceCounter.addExcludePattern',
                    title: 'Add Exclude Pattern'
                }
            }
        ));

        return items;
    }
}
