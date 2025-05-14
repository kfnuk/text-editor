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

    let editor;
    let openTabs = {};
    let projectFilesTree = {};
    let expandedFolders = new Set();

    let nextTabIdCounter = 1;
    let untitledFileCounter = 1;
    let activeTabId = null;

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    // --- Local Storage Constants with Prefix ---
    const LS_PREFIX = 'webEditor_v2.3_'; // Incremented version for linting feature
    const LS_OPEN_TABS = `${LS_PREFIX}openTabs`;
    const LS_ACTIVE_TAB = `${LS_PREFIX}activeTab`;
    const LS_NEXT_TAB_ID_COUNTER = `${LS_PREFIX}nextTabIdCounter`;
    const LS_UNTITLED_COUNTER = `${LS_PREFIX}untitledCounter`;
    const LS_SIDEBAR_WIDTH = `${LS_PREFIX}sidebarWidth`;
    const LS_THEME = `${LS_PREFIX}theme`;
    const LS_EXPANDED_FOLDERS = `${LS_PREFIX}expandedFolders`;

    const darkCmTheme = 'material-darker';
    const lightCmTheme = 'default';

    // --- Update Shortcut Text ---
    // ... (Function remains the same as previous version) ...
    function updateShortcutText() {
        const modKeyText = isMac ? '⌘' : 'Ctrl';
        const altKeyText = isMac ? '⌥' : 'Alt';
        const shiftKeyText = 'Shift';

        document.querySelectorAll('.shortcut').forEach(span => {
            let text = span.textContent || "";
            text = text.replace(/Ctrl\+Shift\+/g, `${modKeyText}+${shiftKeyText}+`);
            text = text.replace(/Cmd\+Shift\+/g, `${modKeyText}+${shiftKeyText}+`);
            text = text.replace(/Ctrl\+/g, `${modKeyText}+`);
            text = text.replace(/Cmd\+/g, `${modKeyText}+`);
            text = text.replace(/Alt\+/g, `${altKeyText}+`);
            text = text.replace(/Opt\+/g, `${altKeyText}+`);
            span.textContent = text;
        });

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
    }


    // --- Theme Management ---
    // ... (Function remains the same as previous version) ...
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
    // ... (Logic remains the same as previous version) ...
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
        if (editor) editor.refresh();
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
            document.body.style.userSelect = 'none';
            document.body.style.pointerEvents = 'none';
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
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
            if (sidebar) localStorage.setItem(LS_SIDEBAR_WIDTH, sidebar.style.width);
        }
    }

    // --- Local Storage Functions ---
    // ... (Functions remain the same as previous version) ...
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
                console.error("Error parsing LS: ", e);
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
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"], // Added lint markers gutter
                lint: true, // Enabled linting
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
        } catch (e) {
            console.error("Error during CodeMirror initialization:", e);
            editorContainer.textContent = "Failed to load code editor. Check console for errors.";
        }
    } else {
        console.error("Editor container (#editor-container) not found in the DOM!");
    }

    // --- Helper Functions ---
    // ... (getMimeType and getDisplayFileType remain the same) ...
    function getMimeType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "text/plain";
        let ext = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (ext) {
            case "js": case "javascript": return "text/javascript";
            case "json": return "application/json"; // For JSON linting if added
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

    // --- Project Explorer Rendering ---
    // ... (Function remains the same as previous version) ...
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

    // --- Toggle Folder in Explorer ---
    // ... (Function remains the same as previous version) ...
    function toggleFolder(path, listItemElement) {
        if (expandedFolders.has(path)) expandedFolders.delete(path);
        else expandedFolders.add(path);
        listItemElement.classList.toggle('expanded');
        listItemElement.setAttribute('aria-expanded', expandedFolders.has(path));
        saveEditorStateToLocalStorage();
    }

    // --- Open File from Explorer ---
    // ... (Function remains the same as previous version) ...
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

    // --- Read File Content ---
    // ... (Function remains the same as previous version) ...
    function readFileContent(fileObject) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsText(fileObject);
        });
    }

    // --- UI Rendering for Tabs ---
    // ... (Function remains the same as previous version, ensure CSS.escape for querySelector) ...
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


    // --- Update Editor Area Indicator ---
    // ... (Function remains the same as previous version) ...
    function updateEditorAreaIndicator(hasActiveTab) {
        if(editorArea) editorArea.classList.toggle('active-tab-indicator', hasActiveTab);
    }

    // --- Core File/Tab Operations ---
    // ... (createNewUntitledFile, promptRenameTab, openNewTab, switchToTab, closeTab remain the same) ...
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
        switchToTab(newId); // This will set the editor mode and trigger linting if the mode has a linter
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
            editor.setOption("mode", mimeType); // This will trigger a re-lint if mode changes
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
    // ... (Remains the same) ...
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const clickedTabElement = e.target.closest('.tab');
            if (clickedTabElement && clickedTabElement.dataset.tabId) {
                switchToTab(clickedTabElement.dataset.tabId);
            }
        });
    }

    // --- Status Bar Update ---
    // ... (Remains the same) ...
    function updateStatusBar() {
        if (!editor || !lineColStatus) return;
        const cur = editor.getCursor();
        lineColStatus.textContent = `Line: ${cur.line + 1}, Col: ${cur.ch + 1}`;
    }

    // --- Menu Item Event Listeners ---
    // ... (All menu item listeners remain the same, including file input setup) ...
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
            alert("No active file to save!");
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

    // --- File Input Handling ---
    // ... (Remains the same) ...
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
    // ... (Remains the same) ...
    document.querySelectorAll('.menu-item[role="button"]').forEach(menuButton => {
        menuButton.addEventListener('click', function(event) {
            const dropdownItemClicked = event.target.closest('.dropdown-item[role="menuitem"]');
            if (dropdownItemClicked) {
                document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(activeItem => {
                    activeItem.classList.remove('active');
                    activeItem.setAttribute('aria-expanded', 'false');
                });
                return;
            }
            const isCurrentlyExpanded = this.getAttribute('aria-expanded') === 'true';
            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(otherItem => {
                if (otherItem !== this) { otherItem.classList.remove('active'); otherItem.setAttribute('aria-expanded', 'false'); }
            });
            this.classList.toggle('active', !isCurrentlyExpanded);
            this.setAttribute('aria-expanded', String(!isCurrentlyExpanded));
            event.stopPropagation();
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

    // --- Keyboard Shortcuts ---
    // ... (Remains the same) ...
    document.addEventListener('keydown', function(e) {
        const modKey = isMac ? e.metaKey : e.ctrlKey;
        const shiftKey = e.shiftKey;

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
    // ... (Remains the same) ...
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
    // ... (Remains the same) ...
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