document.addEventListener('DOMContentLoaded', () => {
    // --- Selectors ---
    const tabContainer = document.querySelector('.tab-bar');
    const editorContainer = document.getElementById('editor-container');
    const editorArea = document.querySelector('.editor-area');
    const lineColStatus = document.getElementById('line-col-status');
    const languageStatus = document.getElementById('language-status');
    const sidebar = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const projectExplorerContainer = document.getElementById('project-explorer-container');
    const fileInput = document.getElementById('file-input');

    // --- Menu Item Selectors ---
    const menuNewFile = document.getElementById('menu-new-file');
    const menuOpenFileSingle = document.getElementById('menu-open-file-single');
    const menuOpenFolder = document.getElementById('menu-open-folder');
    const menuSaveFile = document.getElementById('menu-save-file');
    const menuFind = document.getElementById('menu-find');
    const menuReplace = document.getElementById('menu-replace');
    const menuToggleComment = document.getElementById('menu-toggle-comment');
    const menuToggleTheme = document.getElementById('menu-toggle-theme');
    const menuCommandPaletteTrigger = document.getElementById('menu-command-palette-trigger'); // New

    // --- Command Palette Selectors ---
    const commandPaletteOverlay = document.getElementById('command-palette-overlay');
    const commandPaletteEl = document.getElementById('command-palette');
    const commandPaletteInput = document.getElementById('command-palette-input');
    const commandPaletteList = document.getElementById('command-palette-list');

    let editor;
    let openTabs = {};
    let projectFilesTree = {};
    let expandedFolders = new Set();

    let nextTabIdCounter = 1;
    let untitledFileCounter = 1;
    let activeTabId = null;
    let previouslyFocusedElement = null; // For restoring focus after palette closes

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    // --- Local Storage Constants with Prefix ---
    const LS_PREFIX = 'webEditor_v2.4_'; // Incremented version for command palette
    const LS_OPEN_TABS = `${LS_PREFIX}openTabs`;
    const LS_ACTIVE_TAB = `${LS_PREFIX}activeTab`;
    const LS_NEXT_TAB_ID_COUNTER = `${LS_PREFIX}nextTabIdCounter`;
    const LS_UNTITLED_COUNTER = `${LS_PREFIX}untitledCounter`;
    const LS_SIDEBAR_WIDTH = `${LS_PREFIX}sidebarWidth`;
    const LS_THEME = `${LS_PREFIX}theme`;
    const LS_EXPANDED_FOLDERS = `${LS_PREFIX}expandedFolders`;

    const darkCmTheme = 'material-darker';
    const lightCmTheme = 'default';


    // --- Command Definitions ---
    const commands = [
        {
            id: 'newFile',
            name: 'File: New File',
            action: () => menuNewFile.click(), // Trigger existing menu item's logic
            shortcut: isMac ? '⌘N' : 'Ctrl+N'
        },
        {
            id: 'openFile',
            name: 'File: Open File...',
            action: () => menuOpenFileSingle.click(),
            shortcut: isMac ? '⇧⌘O' : 'Ctrl+Shift+O'
        },
        {
            id: 'openFolder',
            name: 'File: Open Folder...',
            action: () => menuOpenFolder.click(),
            shortcut: isMac ? '⌘O' : 'Ctrl+O'
        },
        {
            id: 'saveFile',
            name: 'File: Save File',
            action: () => menuSaveFile.click(),
            shortcut: isMac ? '⌘S' : 'Ctrl+S',
            condition: () => activeTabId && openTabs[activeTabId] // Only show if a tab is active
        },
        {
            id: 'closeTab',
            name: 'File: Close Current Tab',
            action: () => { if (activeTabId) closeTab(activeTabId); },
            shortcut: isMac ? '⌘W' : 'Ctrl+W',
            condition: () => activeTabId && openTabs[activeTabId]
        },
        {
            id: 'renameTab',
            name: 'File: Rename Current Tab...',
            action: () => { if (activeTabId) promptRenameTab(activeTabId); },
            shortcut: 'F2',
            condition: () => activeTabId && openTabs[activeTabId]
        },
        {
            id: 'find',
            name: 'Edit: Find...',
            action: () => { if (editor) { editor.focus(); editor.execCommand("findPersistent"); }},
            shortcut: isMac ? '⌘F' : 'Ctrl+F'
        },
        {
            id: 'replace',
            name: 'Edit: Replace...',
            action: () => { if (editor) { editor.focus(); editor.execCommand("replace"); }},
            shortcut: isMac ? '⌥⌘F' : 'Ctrl+H'
        },
        {
            id: 'toggleComment',
            name: 'Edit: Toggle Comment',
            action: () => { if (editor) { editor.focus(); editor.execCommand("toggleComment"); }},
            shortcut: isMac ? '⌘/' : 'Ctrl+/'
        },
        {
            id: 'toggleTheme',
            name: 'View: Toggle Dark/Light Theme',
            action: () => menuToggleTheme.click()
        },
        // Add more commands here, e.g., for settings, specific editor actions, etc.
    ];
    let filteredCommands = [];
    let selectedCommandIndex = -1;


    // --- Update Shortcut Text ---
    function updateShortcutText() {
        const modKeyText = isMac ? '⌘' : 'Ctrl';
        const altKeyText = isMac ? '⌥' : 'Alt'; // Option key on Mac
        const shiftKeyText = 'Shift'; // '⇧' is also an option for Mac

        document.querySelectorAll('.shortcut').forEach(span => {
            let text = span.textContent || "";
            text = text.replace(/Ctrl\+Shift\+/g, `${modKeyText}+${shiftKeyText}+`);
            text = text.replace(/Cmd\+Shift\+/g, `${modKeyText}+${shiftKeyText}+`);
            text = text.replace(/Ctrl\+/g, `${modKeyText}+`);
            text = text.replace(/Cmd\+/g, `${modKeyText}+`);
            text = text.replace(/Alt\+/g, `${altKeyText}+`);
            text = text.replace(/Opt\+/g, `${altKeyText}+`); // For Cmd+Opt+F
            span.textContent = text;
        });

        // Specific updates for menu items if their text is hardcoded differently
        const menuReplaceItem = document.getElementById('menu-replace');
        if (menuReplaceItem) {
            const shortcutSpan = menuReplaceItem.querySelector('.shortcut');
            if (shortcutSpan) {
                shortcutSpan.textContent = isMac ? `(${modKeyText}${altKeyText}F)` : `(${modKeyText}+H)`;
            }
        }
        const menuToggleCommentItem = document.getElementById('menu-toggle-comment');
        if (menuToggleCommentItem) {
             const shortcutSpan = menuToggleCommentItem.querySelector('.shortcut');
             if(shortcutSpan) {
                shortcutSpan.textContent = `(${modKeyText}+/)`;
             }
        }
        // Update Command Palette trigger shortcut in menu
        const menuCommandPaletteTriggerItem = document.getElementById('menu-command-palette-trigger');
        if (menuCommandPaletteTriggerItem) {
            const shortcutSpan = menuCommandPaletteTriggerItem.querySelector('.shortcut');
            if (shortcutSpan) {
                 shortcutSpan.textContent = isMac ? `(${modKeyText}⇧P)` : `(${modKeyText}+Shift+P)`;
            }
        }
    }


    // --- Theme Management ---
    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (editor) editor.setOption('theme', lightCmTheme);
        } else {
            document.body.classList.remove('light-theme');
            if (editor) editor.setOption('theme', darkCmTheme);
        }
        localStorage.setItem(LS_THEME, theme);
    }

    // --- Sidebar Resizing Logic ---
    const DEFAULT_SIDEBAR_WIDTH = 250;
    const MIN_SIDEBAR_WIDTH = 150;
    let MAX_SIDEBAR_WIDTH = Math.min(500, window.innerWidth > 400 ? window.innerWidth - 200 : 250);

    function calculateMaxSidebarWidth() {
        MAX_SIDEBAR_WIDTH = Math.min(500, window.innerWidth > 400 ? window.innerWidth - 200 : 250);
    }
    window.addEventListener('resize', calculateMaxSidebarWidth);

    function setSidebarWidth(width) {
        calculateMaxSidebarWidth();
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, MAX_SIDEBAR_WIDTH));
        if (sidebar) sidebar.style.width = `${newWidth}px`;
        if (editor) editor.refresh(); // Refresh CodeMirror after sidebar resize
    }

    function loadSidebarWidth() {
        const savedWidth = localStorage.getItem(LS_SIDEBAR_WIDTH);
        setSidebarWidth(savedWidth ? parseInt(savedWidth, 10) : DEFAULT_SIDEBAR_WIDTH);
    }

    if (sidebarResizer && sidebar) {
        let isResizing = false;
        let startX, startWidth;
        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
            document.body.style.userSelect = 'none'; // Prevent text selection during resize
            document.body.style.pointerEvents = 'none'; // Prevent interaction with other elements during resize
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        function handleMouseMove(e) {
            if (!isResizing) return;
            setSidebarWidth(startWidth + (e.clientX - startX));
        }
        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = ''; // Re-enable text selection
            document.body.style.pointerEvents = '';
            if (sidebar) localStorage.setItem(LS_SIDEBAR_WIDTH, sidebar.style.width);
        }
    }

    // --- Local Storage Functions ---
    function saveEditorStateToLocalStorage() {
        const tabsToSave = {};
        for (const id in openTabs) {
            if (openTabs.hasOwnProperty(id)) {
                let contentToSave = openTabs[id].content;
                if (id === activeTabId && editor && openTabs[activeTabId]) {
                    contentToSave = editor.getValue();
                    openTabs[id].content = contentToSave;
                }
                tabsToSave[id] = { ...openTabs[id] };
                delete tabsToSave[id].fileObject;
            }
        }
        localStorage.setItem(LS_OPEN_TABS, JSON.stringify(tabsToSave));
        activeTabId ? localStorage.setItem(LS_ACTIVE_TAB, activeTabId) : localStorage.removeItem(LS_ACTIVE_TAB);
        localStorage.setItem(LS_NEXT_TAB_ID_COUNTER, nextTabIdCounter.toString());
        localStorage.setItem(LS_UNTITLED_COUNTER, untitledFileCounter.toString());
        localStorage.setItem(LS_EXPANDED_FOLDERS, JSON.stringify(Array.from(expandedFolders)));
    }

    function loadEditorStateFromLocalStorage() {
        const savedTabs = localStorage.getItem(LS_OPEN_TABS);
        const savedActiveTab = localStorage.getItem(LS_ACTIVE_TAB);
        const savedNextTabIdCounter = localStorage.getItem(LS_NEXT_TAB_ID_COUNTER);
        const savedUntitledCounter = localStorage.getItem(LS_UNTITLED_COUNTER);
        const savedExpandedFolders = localStorage.getItem(LS_EXPANDED_FOLDERS);

        let stateLoaded = false;
        if (savedTabs) {
            try {
                const parsedTabs = JSON.parse(savedTabs);
                if (typeof parsedTabs !== 'object' || parsedTabs === null) throw new Error("Invalid tab data.");
                openTabs = parsedTabs;
                stateLoaded = true;

                nextTabIdCounter = parseInt(savedNextTabIdCounter, 10);
                if (isNaN(nextTabIdCounter) || nextTabIdCounter < 1) {
                    nextTabIdCounter = 1;
                    Object.keys(openTabs).forEach(k => {
                        const n = parseInt(k.replace('tab-', ''), 10);
                        if (!isNaN(n) && n >= nextTabIdCounter) nextTabIdCounter = n + 1;
                    });
                }

                untitledFileCounter = parseInt(savedUntitledCounter, 10);
                if (isNaN(untitledFileCounter) || untitledFileCounter < 1) {
                    untitledFileCounter = 1;
                     Object.values(openTabs).forEach(t => {
                        if (t.filename && t.filename.startsWith("untitled-")) {
                            const n = parseInt(t.filename.replace("untitled-", "").split('.')[0], 10);
                            if (!isNaN(n) && n >= untitledFileCounter) untitledFileCounter = n + 1;
                        }
                    });
                }
                activeTabId = savedActiveTab || null;
                if (savedExpandedFolders) expandedFolders = new Set(JSON.parse(savedExpandedFolders));

            } catch (e) {
                console.error("Error parsing editor state from LocalStorage:", e);
                Object.keys(localStorage).forEach(key => { if (key.startsWith(LS_PREFIX)) localStorage.removeItem(key); });
                openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1; expandedFolders = new Set();
                stateLoaded = false;
            }
        }
        return stateLoaded;
    }


    // --- Initialize Editor ---
    if (editorContainer) {
        try {
            const initialGlobalTheme = localStorage.getItem(LS_THEME) || 'dark';
            const initialCmTheme = initialGlobalTheme === 'light' ? lightCmTheme : darkCmTheme;

            editor = CodeMirror(editorContainer, {
                value: "",
                mode: "text/plain",
                theme: initialCmTheme,
                lineNumbers: true,
                autoCloseBrackets: true,
                autoCloseTags: true,
                styleActiveLine: true,
                lineWrapping: true,
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
                lint: true,
                extraKeys: {
                    "Ctrl-Space": "autocomplete", "Cmd-Space": "autocomplete",
                    "Ctrl-/": "toggleComment", "Cmd-/": "toggleComment",
                    "Ctrl-F": "findPersistent", "Cmd-F": "findPersistent",
                    "Ctrl-H": "replace", "Cmd-Alt-F": "replace"
                },
                hintOptions: { completeSingle: false },
                highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true }
            });
            applyTheme(initialGlobalTheme);

            editor.on("cursorActivity", updateStatusBar);
            editor.on("change", (cmInstance, changeObj) => {
                if (activeTabId && openTabs[activeTabId] && changeObj.origin !== 'setValue' && !openTabs[activeTabId].isDirty) {
                    openTabs[activeTabId].isDirty = true;
                    renderTabs();
                }
            });

            if (editor) {
                editor.on("paste", (cm, event) => {
                    setTimeout(() => {
                        const content = cm.getValue();
                        const detected = detectFileTypeByContent(content);
                        if (detected && detected.mode) {
                            cm.setOption("mode", detected.mode);
                            if (languageStatus) languageStatus.textContent = detected.label;
                            if (activeTabId && openTabs[activeTabId]) {
                                openTabs[activeTabId].filetype = detected.label;
                                // Consider if filename should be updated for untitled files based on detected type
                            }
                        }
                    }, 0);
                });
            }

        } catch (e) {
            console.error("Error during CodeMirror initialization:", e);
            editorContainer.textContent = "Failed to load code editor. Check console for errors.";
        }
    } else {
        console.error("Editor container (#editor-container) not found in the DOM!");
    }
const filetypeSelector = document.getElementById('filetype-selector');
if (filetypeSelector && editor) {
    // Change mode on dropdown selection
    filetypeSelector.addEventListener('change', function () {
        const selectedMode = filetypeSelector.value;
        editor.setOption('mode', selectedMode);
        // Update openTabs if tab exists
        if (activeTabId && openTabs[activeTabId]) {
            openTabs[activeTabId].filetype = filetypeSelector.options[filetypeSelector.selectedIndex].text;
        }
        // Update the status bar
        if (languageStatus) languageStatus.textContent = filetypeSelector.options[filetypeSelector.selectedIndex].text;
    });

    // Set dropdown when switching tab
    function updateFiletypeDropdownFromTab(tabId) {
        if (tabId && openTabs[tabId]) {
            let mode = getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename);
            filetypeSelector.value = mode;
        } else {
            filetypeSelector.value = "text/plain";
        }
    }

    // Patch your switchToTab to call the update function
    const origSwitchToTab = switchToTab;
    switchToTab = function(tabId) {
        origSwitchToTab(tabId);
        updateFiletypeDropdownFromTab(tabId);
    };

    // Also set the dropdown for the initial load
    updateFiletypeDropdownFromTab(activeTabId);
}

    // --- Helper Functions ---
    function getMimeType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "text/plain";
        let ext = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (ext) {
            case "js": case "javascript": return "text/javascript";
            case "json": return "application/json";
            case "html": return "text/html";
            case "css": return "text/css";
            case "xml": return "application/xml";
            case "md": case "markdown": return "text/markdown";
            case "py": return "text/x-python";
            case "java": return "text/x-java";
            case "c": case "cpp": case "h": return "text/x-c++src";
            case "txt": case "text": return "text/plain";
            default: return "text/plain";
        }
    }

    function getDisplayFileType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "Text";
        let ext = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (ext) {
            case "js": case "javascript": return "JavaScript";
            case "json": return "JSON";
            case "html": return "HTML";
            case "css": return "CSS";
            case "xml": return "XML";
            case "md": case "markdown": return "Markdown";
            case "py": return "Python";
            case "java": return "Java";
            case "c": case "cpp": case "h": return "C/C++";
            case "txt": case "text": return "Text";
            default: return "Text";
        }
    }

    function detectFileTypeByContent(content) {
        content = content.trim();
        // CSS check should be more specific and potentially earlier if JS var() conflicts
        if (/^\s*@import\s+|{|}\s*$|^\s*\.[a-zA-Z0-9_-]+\s*\{|^\s*#[a-zA-Z0-9_-]+\s*\{|^\s*[a-zA-Z0-9_-]+\s*\{|--[a-zA-Z0-9_-]+:/.test(content)) {
             return { mode: "text/css", label: "CSS" };
        }
        if (/^\s*<!DOCTYPE\s+html/i.test(content) || /<html[\s>]/i.test(content)) {
            return { mode: "text/html", label: "HTML" };
        }
        if (/^\s*\{[\s\S]*\}$/.test(content) && content.includes(':')) {
            try { JSON.parse(content); return { mode: "application/json", label: "JSON" }; } catch(e){}
        }
        // Refined JS check to be less greedy with `var`
        if (/^\s*\/\//.test(content) || /^\s*function\b|\b(const|let)\b\s+[a-zA-Z_$][\w$]*\s*=/.test(content) || /\b(document|window|console)\./.test(content)) {
            return { mode: "text/javascript", label: "JavaScript" };
        }
        if (/^\s*#include\b|int\s+main\s*\(/.test(content)) {
            return { mode: "text/x-c++src", label: "C/C++" };
        }
        if (/^\s*def\b|\bimport\b|\bprint\s*\(|^\s*#/m.test(content) && !content.includes("include")) { // Avoid conflict with C++ #include
            return { mode: "text/x-python", label: "Python" };
        }
        if (/^\s*<\?xml/.test(content)) {
            return { mode: "application/xml", label: "XML" };
        }
        if (/^\s*#\s+.+$|^\s*\*\s+.+$|^\s*---$|^\s*[*-] /.m.test(content)) {
            return { mode: "text/markdown", label: "Markdown" };
        }
        // Fallback JS check for simple `var x = ...` if other specific checks fail
        if (/\bvar\b\s+[a-zA-Z_$][\w$]*\s*=/.test(content)) {
             return { mode: "text/javascript", label: "JavaScript" };
        }
        return { mode: "text/plain", label: "Text" };
    }


    // --- Project Explorer Rendering ---
    function renderProjectExplorer() {
        if (!projectExplorerContainer) return;
        projectExplorerContainer.innerHTML = '';

        const createTreeElement = (item, path, parentUl, depth = 0) => {
            const li = document.createElement('li');
            li.className = `explorer-item type-${item.type}`;
            li.dataset.path = path;
            li.setAttribute('role', item.type === 'folder' ? 'treeitem' : 'option');
            li.setAttribute('aria-expanded', item.type === 'folder' ? expandedFolders.has(path) : 'false');
            if (item.type === 'folder' && expandedFolders.has(path)) li.classList.add('expanded');

            const label = document.createElement('div');
            label.className = 'explorer-item-label';
            label.tabIndex = 0;
            label.style.setProperty('--item-depth', depth);

            const arrow = document.createElement('span');
            arrow.className = 'explorer-item-arrow';
            label.appendChild(arrow);

            const icon = document.createElement('span');
            icon.className = 'explorer-item-icon';
            label.appendChild(icon);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'explorer-item-name';
            nameSpan.textContent = item.name;
            nameSpan.title = item.name;
            label.appendChild(nameSpan);
            li.appendChild(label);

            if (item.type === 'folder') {
                const childrenUl = document.createElement('ul');
                childrenUl.setAttribute('role', 'group');
                Object.keys(item.children).sort((a, b) => {
                    const childA = item.children[a]; const childB = item.children[b];
                    if (childA.type === 'folder' && childB.type === 'file') return -1;
                    if (childA.type === 'file' && childB.type === 'folder') return 1;
                    return a.localeCompare(b);
                }).forEach(childName => {
                    createTreeElement(item.children[childName], `${path}/${childName}`, childrenUl, depth + 1);
                });
                li.appendChild(childrenUl);
                label.addEventListener('click', () => toggleFolder(path, li));
                label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFolder(path, li); }});
            } else {
                label.addEventListener('click', () => openFileFromExplorer(item));
                label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFileFromExplorer(item); }});
            }
            parentUl.appendChild(li);
        };

        const rootUl = document.createElement('ul');
        rootUl.setAttribute('role', 'tree');
        Object.keys(projectFilesTree).sort((a,b) => {
            const itemA = projectFilesTree[a]; const itemB = projectFilesTree[b];
            if (itemA.type === 'folder' && itemB.type === 'file') return -1;
            if (itemA.type === 'file' && itemB.type === 'folder') return 1;
            return a.localeCompare(b);
        }).forEach(itemName => createTreeElement(projectFilesTree[itemName], itemName, rootUl, 0));
        projectExplorerContainer.appendChild(rootUl);
    }

    function toggleFolder(path, listItemElement) {
        if (expandedFolders.has(path)) expandedFolders.delete(path);
        else expandedFolders.add(path);
        listItemElement.classList.toggle('expanded');
        listItemElement.setAttribute('aria-expanded', expandedFolders.has(path));
        saveEditorStateToLocalStorage();
    }

    async function openFileFromExplorer(fileItem) {
        const filePath = fileItem.path;
        const existingTab = Object.values(openTabs).find(tab => tab.filePath === filePath);
        if (existingTab) switchToTab(existingTab.id);
        else if (fileItem.fileObject) {
            try {
                const content = await readFileContent(fileItem.fileObject);
                openNewTab(fileItem.name, getDisplayFileType(fileItem.name), content, false, null, true, false, filePath, fileItem.fileObject);
            } catch (err) { console.error("Err reading file from explorer:", err); alert(`Error reading: ${fileItem.name}`); }
        } else { console.warn("File object missing for:", filePath); alert(`Cannot open: ${fileItem.name}`); }
    }

    function readFileContent(fileObject) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsText(fileObject);
        });
    }

    // --- UI Rendering for Tabs ---
    function renderTabs() {
        if (!tabContainer) return;
        tabContainer.innerHTML = '';
        let hasActiveTab = false;
        const sortedTabIds = Object.keys(openTabs).sort((a, b) => (openTabs[a].filename || "").localeCompare(openTabs[b].filename || ""));

        sortedTabIds.forEach(id => {
            const tabData = openTabs[id];
            const tabDiv = document.createElement('div');
            tabDiv.className = 'tab';
            tabDiv.setAttribute('role', 'tab');
            tabDiv.setAttribute('aria-selected', id === activeTabId);
            if (id === activeTabId) { tabDiv.classList.add('active'); hasActiveTab = true; }
            tabDiv.dataset.tabId = id;

            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'tab-filename';
            filenameSpan.textContent = tabData.filename;
            filenameSpan.title = tabData.filePath || tabData.filename;
            filenameSpan.addEventListener('dblclick', () => promptRenameTab(id));
            tabDiv.appendChild(filenameSpan);

            if (tabData.isDirty) {
                const dirtyIndicator = document.createElement('span');
                dirtyIndicator.className = 'dirty-indicator';
                dirtyIndicator.setAttribute('aria-label', 'Unsaved changes');
                tabDiv.appendChild(dirtyIndicator);
            }

            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-tab';
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('role', 'button');
            closeBtn.setAttribute('aria-label', `Close tab ${tabData.filename}`);
            closeBtn.tabIndex = 0;
            closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
            closeBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); closeTab(id); }});
            tabDiv.appendChild(closeBtn);
            tabContainer.appendChild(tabDiv);
        });
        updateEditorAreaIndicator(hasActiveTab);

        if (projectExplorerContainer) {
             const currentActiveFileLabel = projectExplorerContainer.querySelector('.explorer-item-label.active-explorer-file');
             if (currentActiveFileLabel) currentActiveFileLabel.classList.remove('active-explorer-file');
             if (activeTabId && openTabs[activeTabId] && openTabs[activeTabId].filePath) {
                 try {
                    const newActiveFileLabel = projectExplorerContainer.querySelector(`.explorer-item[data-path="${CSS.escape(openTabs[activeTabId].filePath)}"] > .explorer-item-label`);
                    if (newActiveFileLabel) newActiveFileLabel.classList.add('active-explorer-file');
                 } catch (e) {
                    console.warn("CSS.escape error or invalid selector for active file path:", openTabs[activeTabId].filePath, e);
                 }
             }
        }
        saveEditorStateToLocalStorage();
    }

    function updateEditorAreaIndicator(hasActiveTab) {
        if(editorArea) editorArea.classList.toggle('active-tab-indicator', hasActiveTab);
    }

    // --- Core File/Tab Operations ---
    function createNewUntitledFile() {
        const filename = `untitled-${untitledFileCounter++}.txt`;
        openNewTab(filename, getDisplayFileType(filename), "", false, null, false, true, `untitled://${filename}`, null);
    }

    function promptRenameTab(tabId) {
        if (!openTabs[tabId]) { console.error("Attempted to rename non-existent tab:", tabId); return; }
        const currentFilename = openTabs[tabId].filename;
        const newFilename = prompt("Enter new filename:", currentFilename);

        if (newFilename && newFilename.trim() !== "" && newFilename.trim() !== currentFilename) {
            const trimmedNewFilename = newFilename.trim();
            const isDuplicateInTabs = Object.values(openTabs).some(t => t.id !== tabId && t.filename === trimmedNewFilename);
            if (isDuplicateInTabs && (openTabs[tabId].isUntitled || !openTabs[tabId].filePath?.startsWith('singlefile://'))) {
                alert(`A tab named "${trimmedNewFilename}" is already open or exists in the project. Please choose a different name.`);
                return;
            }
            openTabs[tabId].filename = trimmedNewFilename;
            openTabs[tabId].filetype = getDisplayFileType(trimmedNewFilename);
            openTabs[tabId].isDirty = true;
            if (openTabs[tabId].isUntitled) openTabs[tabId].isUntitled = false;

            renderTabs();
            if (tabId === activeTabId) {
                if (languageStatus) languageStatus.textContent = openTabs[tabId].filetype;
                if (editor) editor.setOption("mode", getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename));
            }
        }
    }

    function openNewTab(filename, filetype, content = '', isDirty = false, existingId = null, isFromLocalFile = false, isUntitled = false, filePath = null, fileObject = null) {
        const newId = existingId || `tab-${nextTabIdCounter++}`;
        openTabs[newId] = { id: newId, filename, filetype, content, isDirty, isFromLocalFile, isUntitled, filePath, fileObject };
        switchToTab(newId);
        return newId;
    }

    function switchToTab(tabId) {
        if (activeTabId === tabId && openTabs[tabId]) return;

        if (activeTabId && openTabs[activeTabId] && editor) {
            openTabs[activeTabId].content = editor.getValue();
        }
        activeTabId = tabId;

        if (activeTabId && openTabs[activeTabId] && editor) {
            editor.setValue(openTabs[activeTabId].content);
            const mimeType = getMimeType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename);
            editor.setOption("mode", mimeType);
            editor.clearHistory();
            editor.focus();
            if (languageStatus) languageStatus.textContent = getDisplayFileType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename);
        } else if (!activeTabId && editor) {
            editor.setValue("");
            editor.setOption("mode", "text/plain");
            editor.clearHistory();
            if (languageStatus) languageStatus.textContent = "Text";
        }
        renderTabs();
        updateStatusBar();
        const activeTabElement = tabContainer.querySelector(`.tab[data-tab-id="${activeTabId}"]`);
        if (activeTabElement) activeTabElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function closeTab(tabIdToClose) {
        if (!openTabs[tabIdToClose]) return;
        if (openTabs[tabIdToClose].isDirty && !confirm(`File "${openTabs[tabIdToClose].filename}" has unsaved changes. Close anyway?`)) {
            return;
        }

        const closedTabFilePath = openTabs[tabIdToClose].filePath;
        delete openTabs[tabIdToClose];

        if (activeTabId === tabIdToClose) {
            activeTabId = null;
            const remainingTabIds = Object.keys(openTabs);
            if (remainingTabIds.length > 0) {
                const sortedRemainingTabs = Object.values(openTabs).sort((a,b) => (a.filename||"").localeCompare(b.filename||""));
                switchToTab(sortedRemainingTabs[0].id);
            } else {
                if (editor) { editor.setValue(""); editor.setOption("mode", "text/plain"); editor.clearHistory(); }
                if (languageStatus) languageStatus.textContent = "Text";
                renderTabs(); updateStatusBar();
            }
        } else {
            renderTabs();
        }
        if (closedTabFilePath && projectExplorerContainer) {
             try {
                const explorerItemLabel = projectExplorerContainer.querySelector(`.explorer-item[data-path="${CSS.escape(closedTabFilePath)}"] > .explorer-item-label`);
                if (explorerItemLabel) explorerItemLabel.classList.remove('active-explorer-file');
             } catch(e) {
                console.warn("CSS.escape error or invalid selector for closed tab path:", closedTabFilePath, e);
             }
        }
    }

    // --- Event Listeners for Tab Bar ---
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const clickedTabElement = e.target.closest('.tab');
            if (clickedTabElement && clickedTabElement.dataset.tabId) {
                switchToTab(clickedTabElement.dataset.tabId);
            }
        });
    }

    // --- Status Bar Update ---
    function updateStatusBar() {
        if (!editor || !lineColStatus) return;
        const cur = editor.getCursor();
        lineColStatus.textContent = `Line: ${cur.line + 1}, Col: ${cur.ch + 1}`;
    }

    // --- Menu Item Event Listeners ---
    if (menuNewFile) menuNewFile.addEventListener('click', createNewUntitledFile);
    if (menuOpenFileSingle) {
        menuOpenFileSingle.addEventListener('click', () => {
            fileInput.webkitdirectory = false;
            fileInput.directory = false;
            fileInput.multiple = false;
            fileInput.dataset.openType = 'file';
            fileInput.click();
        });
    }
    if (menuOpenFolder) {
        menuOpenFolder.addEventListener('click', () => {
            fileInput.webkitdirectory = true;
            fileInput.directory = true;
            fileInput.multiple = true;
            fileInput.dataset.openType = 'folder';
            fileInput.click();
        });
    }
    if (menuSaveFile) menuSaveFile.addEventListener('click', () => {
        if (!activeTabId || !openTabs[activeTabId]) {
            // alert("No active file to save!"); // Consider less intrusive notification
            console.warn("Save action triggered with no active file.");
            return;
        }
        const tabData = openTabs[activeTabId];
        let filenameToSave = tabData.filename;

        if (tabData.isUntitled || (tabData.filename && tabData.filename.startsWith("untitled-")) || tabData.filePath?.startsWith("singlefile://")) {
            const newName = prompt("Save as:", tabData.filename);
            if (newName && newName.trim() !== "") {
                filenameToSave = newName.trim();
                openTabs[activeTabId].filename = filenameToSave;
                openTabs[activeTabId].filetype = getDisplayFileType(filenameToSave);
                openTabs[activeTabId].isUntitled = false;
                if(tabData.filePath?.startsWith("singlefile://")) {
                    openTabs[activeTabId].filePath = `singlefile://${filenameToSave}`;
                }
            } else {
                return;
            }
        }

        const content = editor.getValue();
        const blob = new Blob([content], { type: getMimeType(tabData.filetype || filenameToSave) });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filenameToSave;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        openTabs[activeTabId].isDirty = false;
        openTabs[activeTabId].content = content;
        if (languageStatus && openTabs[activeTabId]) languageStatus.textContent = openTabs[activeTabId].filetype;
        renderTabs();
        console.log(`File "${filenameToSave}" saved successfully.`);
    });
    if (menuFind) menuFind.addEventListener('click', () => { if (editor) { editor.focus(); editor.execCommand("findPersistent"); }});
    if (menuReplace) menuReplace.addEventListener('click', () => { if (editor) { editor.focus(); editor.execCommand("replace"); }});
    if (menuToggleComment) menuToggleComment.addEventListener('click', () => { if (editor) { editor.focus(); editor.execCommand("toggleComment"); }});
    if (menuToggleTheme) menuToggleTheme.addEventListener('click', () => {
        const currentGlobalTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        applyTheme(currentGlobalTheme === 'light' ? 'dark' : 'light');
    });
    if (menuCommandPaletteTrigger) menuCommandPaletteTrigger.addEventListener('click', openCommandPalette);


    // --- File Input Handling ---
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            const openType = e.target.dataset.openType;

            if (files.length > 0) {
                if (openType === 'folder') {
                    projectFilesTree = {};
                    openTabs = {};
                    activeTabId = null;
                    nextTabIdCounter = 1;
                    expandedFolders.clear();

                    for (const file of files) {
                        if (file.webkitRelativePath) {
                            const pathParts = file.webkitRelativePath.split('/').filter(p => p);
                            let currentLevel = projectFilesTree;
                            pathParts.forEach((part, index) => {
                                if (index === pathParts.length - 1) {
                                    currentLevel[part] = { name: part, type: 'file', path: file.webkitRelativePath, fileObject: file };
                                } else {
                                    if (!currentLevel[part]) {
                                        currentLevel[part] = { name: part, type: 'folder', path: pathParts.slice(0, index + 1).join('/'), children: {} };
                                    }
                                    currentLevel = currentLevel[part].children;
                                }
                            });
                        } else {
                             projectFilesTree[file.name] = { name: file.name, type: 'file', path: file.name, fileObject: file };
                        }
                    }
                    renderProjectExplorer();
                    if (editor) { editor.setValue(""); editor.setOption("mode", "text/plain"); if (languageStatus) languageStatus.textContent = "Text"; updateStatusBar(); }
                    renderTabs();
                } else if (openType === 'file') {
                    const file = files[0];
                    try {
                        const content = await readFileContent(file);
                        const filename = file.name;
                        const filetype = getDisplayFileType(filename);
                        openNewTab(filename, filetype, content, false, null, true, false, `singlefile://${filename}`, file);
                    } catch (err) {
                        console.error("Error reading single file:", err);
                        alert(`An error occurred while reading the file: ${file.name}`);
                    }
                }
            }
            fileInput.value = null;
            fileInput.removeAttribute('webkitdirectory');
            fileInput.removeAttribute('directory');
            fileInput.removeAttribute('multiple');
            delete fileInput.dataset.openType;
        });
    }

    // --- Dropdown Menu Toggle Logic & ARIA ---
    document.querySelectorAll('.menu-item[role="button"]').forEach(menuButton => {
        menuButton.addEventListener('click', function(event) {
            const dropdownItemClicked = event.target.closest('.dropdown-item[role="menuitem"]');
            if (dropdownItemClicked) {
                document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(activeItem => {
                    activeItem.classList.remove('active');
                    activeItem.setAttribute('aria-expanded', 'false');
                });
                // Allow the click on dropdown item to proceed (e.g. openCommandPalette)
                // return; // No, don't return here, let the item's own listener fire.
            }
            // If the click was on the menu button itself (not a dropdown item)
            if (event.target === this || event.target.parentElement === this) {
                const isCurrentlyExpanded = this.getAttribute('aria-expanded') === 'true';
                document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(otherItem => {
                    if (otherItem !== this) { otherItem.classList.remove('active'); otherItem.setAttribute('aria-expanded', 'false'); }
                });
                this.classList.toggle('active', !isCurrentlyExpanded);
                this.setAttribute('aria-expanded', String(!isCurrentlyExpanded));
                event.stopPropagation();
            }
        });
    });
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.menu-item[role="button"]')) {
            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(item => {
                item.classList.remove('active'); item.setAttribute('aria-expanded', 'false');
            });
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Close command palette first if open
            if (commandPaletteOverlay && commandPaletteOverlay.style.display !== 'none') {
                closeCommandPalette();
                return; // Prevent closing menu if palette was closed
            }
            // Then close menus
            let activeMenu = null;
            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(item => {
                item.classList.remove('active'); item.setAttribute('aria-expanded', 'false'); activeMenu = item;
            });
            if (activeMenu) {
                 const menuButtonSpan = activeMenu.querySelector('span');
                 if (menuButtonSpan && typeof menuButtonSpan.focus === 'function') menuButtonSpan.focus();
                 else if (typeof activeMenu.focus === 'function') activeMenu.focus();
            }
        }
    });

    // --- Command Palette Logic ---
    function openCommandPalette() {
        if (!commandPaletteOverlay || !commandPaletteInput || !commandPaletteList) return;
        previouslyFocusedElement = document.activeElement; // Store focus
        commandPaletteInput.value = ''; // Clear previous input
        renderCommandList(commands.filter(cmd => !cmd.condition || cmd.condition())); // Show all applicable commands
        commandPaletteOverlay.style.display = 'flex';
        commandPaletteInput.focus();
        commandPaletteInput.setAttribute('aria-expanded', 'true');
        selectedCommandIndex = -1; // Reset selection
    }

    function closeCommandPalette() {
        if (!commandPaletteOverlay || !commandPaletteInput) return;
        commandPaletteOverlay.style.display = 'none';
        commandPaletteInput.setAttribute('aria-expanded', 'false');
        if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
            previouslyFocusedElement.focus(); // Restore focus
        } else if (editor) {
            editor.focus(); // Fallback to editor
        }
    }

    function renderCommandList(commandsToRender) {
        if (!commandPaletteList) return;
        commandPaletteList.innerHTML = ''; // Clear current list
        filteredCommands = commandsToRender; // Store the currently displayed commands
        selectedCommandIndex = -1; // Reset selection

        if (commandsToRender.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No commands found.';
            li.style.justifyContent = 'center'; // Center the text
            li.style.cursor = 'default';
            commandPaletteList.appendChild(li);
            return;
        }

        commandsToRender.forEach((command, index) => {
            const li = document.createElement('li');
            li.dataset.commandId = command.id;
            li.setAttribute('role', 'option');
            li.tabIndex = -1; // Make items focusable programmatically

            const nameSpan = document.createElement('span');
            nameSpan.className = 'command-name';
            nameSpan.textContent = command.name;
            li.appendChild(nameSpan);

            if (command.shortcut) {
                const shortcutSpan = document.createElement('span');
                shortcutSpan.className = 'command-shortcut';
                shortcutSpan.textContent = command.shortcut;
                li.appendChild(shortcutSpan);
            }

            li.addEventListener('click', () => {
                executeCommand(command);
            });
            li.addEventListener('mouseenter', () => {
                updateSelectedCommand(index);
            });
            commandPaletteList.appendChild(li);
        });
        updateSelectedVisuals();
    }

    function updateSelectedCommand(newIndex) {
        selectedCommandIndex = newIndex;
        updateSelectedVisuals();
    }

    function updateSelectedVisuals() {
        const items = commandPaletteList.querySelectorAll('li');
        items.forEach((item, idx) => {
            if (idx === selectedCommandIndex) {
                item.classList.add('selected');
                item.setAttribute('aria-selected', 'true');
                item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // Keep selected item in view
            } else {
                item.classList.remove('selected');
                item.setAttribute('aria-selected', 'false');
            }
        });
    }


    function executeCommand(command) {
        if (command && typeof command.action === 'function') {
            command.action();
        }
        closeCommandPalette();
    }

    if (commandPaletteInput) {
        commandPaletteInput.addEventListener('input', () => {
            const searchTerm = commandPaletteInput.value.toLowerCase();
            const matchingCommands = commands.filter(command => {
                const conditionMet = !command.condition || command.condition();
                return conditionMet && command.name.toLowerCase().includes(searchTerm);
            });
            renderCommandList(matchingCommands);
        });

        commandPaletteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeCommandPalette();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (filteredCommands.length > 0) {
                    selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
                    updateSelectedVisuals();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (filteredCommands.length > 0) {
                    selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
                    updateSelectedVisuals();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) {
                    executeCommand(filteredCommands[selectedCommandIndex]);
                } else if (filteredCommands.length === 1) { // If only one result, Enter executes it
                    executeCommand(filteredCommands[0]);
                }
            }
        });
    }
    if (commandPaletteOverlay) {
        commandPaletteOverlay.addEventListener('click', (e) => {
            if (e.target === commandPaletteOverlay) { // Click on overlay itself, not children
                closeCommandPalette();
            }
        });
    }


    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', function(e) {
        const modKey = isMac ? e.metaKey : e.ctrlKey;
        const shiftKey = e.shiftKey;

        // Command Palette Shortcut
        if (modKey && shiftKey && e.key.toUpperCase() === 'P') {
            e.preventDefault();
            if (commandPaletteOverlay.style.display === 'none') {
                openCommandPalette();
            } else {
                closeCommandPalette();
            }
            return; // Prevent other shortcuts if palette is toggled
        }

        // If command palette is open, let its own handlers manage keys
        if (commandPaletteOverlay && commandPaletteOverlay.style.display !== 'none') {
            // Allow Escape to be handled by the palette's input listener or global Esc listener
            // Other keys like arrows/enter are handled by palette input
            return;
        }


        const activeElement = document.activeElement;
        const inCodeMirrorDialog = activeElement && activeElement.closest('.CodeMirror-dialog');
        const inMenu = activeElement && activeElement.closest('.menu-item, .dropdown-menu');
        const inExplorer = activeElement && activeElement.closest('.project-explorer');

        if (inCodeMirrorDialog && (e.key === 'Enter' || e.key === 'Escape')) return;
        if ((inMenu || inExplorer) && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(e.key)) return;

        if (modKey && !shiftKey && e.key.toLowerCase() === 's') {
            e.preventDefault(); if (menuSaveFile) menuSaveFile.click();
        } else if (modKey && !shiftKey && e.key.toLowerCase() === 'n') {
            e.preventDefault(); if (menuNewFile) menuNewFile.click();
        } else if (modKey && !shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault(); if (menuOpenFolder) menuOpenFolder.click();
        } else if (modKey && shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault(); if (menuOpenFileSingle) menuOpenFileSingle.click();
        } else if (modKey && e.key.toLowerCase() === 'w') {
            if (!inCodeMirrorDialog || (activeElement && activeElement.tagName !== 'INPUT')) {
                e.preventDefault(); if (activeTabId) closeTab(activeTabId);
            }
        } else if (e.key === 'F2') {
            if (!inCodeMirrorDialog && activeTabId) { e.preventDefault(); promptRenameTab(activeTabId); }
        }
    });

    // --- Graceful Unload ---
    window.addEventListener('beforeunload', (event) => {
        if (activeTabId && openTabs[activeTabId] && editor) {
            openTabs[activeTabId].content = editor.getValue();
        }
        saveEditorStateToLocalStorage();
        const hasUnsavedChanges = Object.values(openTabs).some(tab => tab.isDirty);
        if (hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // --- Initial Load ---
    updateShortcutText();
    loadSidebarWidth();
    const stateLoaded = loadEditorStateFromLocalStorage();

    const savedTheme = localStorage.getItem(LS_THEME) || 'dark';
    if (!document.body.classList.contains('light-theme') && savedTheme === 'light') applyTheme('light');
    else if (document.body.classList.contains('light-theme') && savedTheme === 'dark') applyTheme('dark');

    if (stateLoaded && Object.keys(openTabs).length > 0) {
        renderTabs();
        if (activeTabId && openTabs[activeTabId]) switchToTab(activeTabId);
        else if (Object.keys(openTabs).length > 0) {
            const firstTabId = Object.keys(openTabs).sort((a,b) => (openTabs[a].filename||"").localeCompare(openTabs[b].filename||""))[0];
            switchToTab(firstTabId);
        } else createNewUntitledFile();
    } else {
        openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1; expandedFolders = new Set();
        createNewUntitledFile();
    }
    renderProjectExplorer();
    calculateMaxSidebarWidth();
});
