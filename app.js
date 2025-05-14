document.addEventListener('DOMContentLoaded', () => {
    // --- Selectors ---
    const tabContainer = document.querySelector('.tab-bar');
    const editorContainer = document.getElementById('editor-container');
    const editorArea = document.querySelector('.editor-area');
    const lineColStatus = document.getElementById('line-col-status');
    const languageStatus = document.getElementById('language-status');
    const sidebar = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const sidebarFileList = document.querySelector('.file-list');
    const fileInput = document.getElementById('file-input');

    // --- Menu Item Selectors ---
    const menuNewFile = document.getElementById('menu-new-file');
    const menuOpenFile = document.getElementById('menu-open-file');
    const menuSaveFile = document.getElementById('menu-save-file');
    const menuFind = document.getElementById('menu-find');
    const menuReplace = document.getElementById('menu-replace');
    const menuToggleComment = document.getElementById('menu-toggle-comment');
    const menuToggleTheme = document.getElementById('menu-toggle-theme'); // New View menu item

    let editor;
    let openTabs = {};
    let nextTabIdCounter = 1;
    let untitledFileCounter = 1;
    let activeTabId = null;

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    // --- Local Storage Constants with Prefix ---
    const LS_PREFIX = 'webEditor_v1_';
    const LS_OPEN_TABS = `${LS_PREFIX}openTabs`;
    const LS_ACTIVE_TAB = `${LS_PREFIX}activeTab`;
    const LS_NEXT_TAB_ID_COUNTER = `${LS_PREFIX}nextTabIdCounter`;
    const LS_UNTITLED_COUNTER = `${LS_PREFIX}untitledCounter`;
    const LS_SIDEBAR_WIDTH = `${LS_PREFIX}sidebarWidth`;
    const LS_THEME = `${LS_PREFIX}theme`; // For storing theme preference

    const darkCmTheme = 'material-darker';
    const lightCmTheme = 'default'; // CodeMirror's default light theme

    // --- Update Shortcut Text ---
    function updateShortcutText() {
        const modKeyText = isMac ? '⌘' : 'Ctrl'; // Using symbols for Mac
        const altKeyText = isMac ? '⌥' : 'Alt';

        document.querySelectorAll('.shortcut').forEach(span => {
            let text = span.textContent || "";
            // General replacements
            text = text.replace(/Ctrl\+/g, `${modKeyText}+`);
            text = text.replace(/Cmd\+/g, `${modKeyText}+`); // In case Cmd was hardcoded by mistake
            text = text.replace(/Alt\+/g, `${altKeyText}+`);
            text = text.replace(/Opt\+/g, `${altKeyText}+`);
            span.textContent = text;
        });

        // Specific overrides if general replacement isn't enough
        const menuReplaceItem = document.getElementById('menu-replace');
        if (menuReplaceItem) {
            const shortcutSpan = menuReplaceItem.querySelector('.shortcut');
            if (shortcutSpan) { // Ctrl+H (Win) vs Cmd+Opt+F (Mac)
                shortcutSpan.textContent = isMac ? `(${modKeyText}${altKeyText}F)` : `(${modKeyText}+H)`;
            }
        }
        const menuToggleCommentItem = document.getElementById('menu-toggle-comment');
        if (menuToggleCommentItem) {
             const shortcutSpan = menuToggleCommentItem.querySelector('.shortcut');
             if(shortcutSpan) { // Ctrl+/ (Win) vs Cmd+/ (Mac)
                shortcutSpan.textContent = `(${modKeyText}+/)`;
             }
        }
    }


    // --- Theme Management ---
    function applyTheme(theme) { // theme can be 'light' or 'dark'
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (editor) editor.setOption('theme', lightCmTheme);
        } else { // Default to dark
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
        calculateMaxSidebarWidth(); // Recalculate on resize attempt
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
    function saveStateToLocalStorage() {
        const tabsToSave = {};
        for (const id in openTabs) {
            if (openTabs.hasOwnProperty(id)) {
                let contentToSave = openTabs[id].content;
                if (id === activeTabId && editor && openTabs[activeTabId]) {
                    contentToSave = editor.getValue();
                }
                tabsToSave[id] = {
                    id: openTabs[id].id,
                    filename: openTabs[id].filename,
                    filetype: openTabs[id].filetype,
                    content: contentToSave,
                    isDirty: openTabs[id].isDirty,
                    isFromLocalFile: openTabs[id].isFromLocalFile,
                    isUntitled: openTabs[id].isUntitled
                };
            }
        }
        localStorage.setItem(LS_OPEN_TABS, JSON.stringify(tabsToSave));
        activeTabId ? localStorage.setItem(LS_ACTIVE_TAB, activeTabId) : localStorage.removeItem(LS_ACTIVE_TAB);
        localStorage.setItem(LS_NEXT_TAB_ID_COUNTER, nextTabIdCounter.toString());
        localStorage.setItem(LS_UNTITLED_COUNTER, untitledFileCounter.toString());
    }

    function loadStateFromLocalStorage() {
        const savedTabs = localStorage.getItem(LS_OPEN_TABS);
        const savedActiveTab = localStorage.getItem(LS_ACTIVE_TAB);
        const savedNextTabIdCounter = localStorage.getItem(LS_NEXT_TAB_ID_COUNTER);
        const savedUntitledCounter = localStorage.getItem(LS_UNTITLED_COUNTER);

        if (savedTabs) {
            try {
                const parsedTabs = JSON.parse(savedTabs);
                if (typeof parsedTabs !== 'object' || parsedTabs === null) throw new Error("Invalid tab data structure in local storage.");

                openTabs = parsedTabs;
                activeTabId = savedActiveTab || null;

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

                for (const id in openTabs) {
                    if (openTabs.hasOwnProperty(id)) {
                        openTabs[id].isDirty = !!openTabs[id].isDirty;
                        openTabs[id].isFromLocalFile = !!openTabs[id].isFromLocalFile;
                        openTabs[id].isUntitled = !!openTabs[id].isUntitled;
                    }
                }
                return Object.keys(openTabs).length > 0;
            } catch (e) {
                console.error("Error parsing local storage state. Clearing app-specific data.", e);
                localStorage.removeItem(LS_OPEN_TABS);
                localStorage.removeItem(LS_ACTIVE_TAB);
                localStorage.removeItem(LS_NEXT_TAB_ID_COUNTER);
                localStorage.removeItem(LS_UNTITLED_COUNTER);
                localStorage.removeItem(LS_SIDEBAR_WIDTH);
                openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1;
                return false;
            }
        }
        return false;
    }

    // --- Initialize Editor ---
    if (editorContainer) {
        try {
            const initialGlobalTheme = localStorage.getItem(LS_THEME) || 'dark';
            const initialCmTheme = initialGlobalTheme === 'light' ? lightCmTheme : darkCmTheme;

            editor = CodeMirror(editorContainer, {
                value: "",
                mode: "text/plain",
                theme: initialCmTheme, // Set initial CM theme based on global theme
                lineNumbers: true,
                autoCloseBrackets: true,
                autoCloseTags: true,
                styleActiveLine: true,
                lineWrapping: true,
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
                extraKeys: {
                    "Ctrl-Space": "autocomplete", "Cmd-Space": "autocomplete",
                    "Ctrl-/": "toggleComment", "Cmd-/": "toggleComment",
                    "Ctrl-F": "findPersistent",
                    "Cmd-F": "findPersistent",
                    "Ctrl-H": "replace",
                    "Cmd-Alt-F": "replace"
                },
                hintOptions: { completeSingle: false },
                highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true }
            });
            console.log("CodeMirror editor initialized successfully with theme:", initialCmTheme);

            // Apply global theme to body after editor is set up
            applyTheme(initialGlobalTheme);


            editor.on("cursorActivity", updateStatusBar);
            editor.on("change", (cmInstance, changeObj) => {
                if (activeTabId && openTabs[activeTabId] && changeObj.origin !== 'setValue') {
                    if (!openTabs[activeTabId].isDirty) {
                        openTabs[activeTabId].isDirty = true;
                        renderTabs();
                    }
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
    function getMimeType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "text/plain";
        let ext = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (ext) {
            case "js": case "javascript": return "text/javascript";
            case "json": return "application/json";
            case "html": return "text/html";
            case "css": return "text/css";
            case "xml": return "application/xml";
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
            case "txt": case "text": return "Text";
            default: return "Text";
        }
    }

    // --- UI Rendering Functions ---
    function renderSidebarFileList() {
        if (!sidebarFileList) return;
        sidebarFileList.innerHTML = '';
        const sortedTabs = Object.values(openTabs).sort((a, b) => (a.filename || "").localeCompare(b.filename || ""));

        if (sortedTabs.length === 0) {
            // CSS :empty pseudo-class handles "No files open"
        } else {
            sortedTabs.forEach(tabData => {
                const li = document.createElement('li');
                li.className = 'file-item';
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', tabData.id === activeTabId);
                if (tabData.id === activeTabId) {
                    li.classList.add('active');
                }
                li.textContent = tabData.filename;
                li.dataset.tabId = tabData.id;
                li.title = tabData.filename;
                li.addEventListener('click', () => switchToTab(tabData.id));
                sidebarFileList.appendChild(li);
            });
        }
    }

    function renderTabs() {
        if (!tabContainer) return;
        tabContainer.innerHTML = '';
        let hasActiveTab = false;
        const sortedTabIds = Object.keys(openTabs).sort((a, b) => (openTabs[a].filename || "").localeCompare(openTabs[b].filename || ""));

        sortedTabIds.forEach(id => {
            if (openTabs.hasOwnProperty(id)) {
                const tabData = openTabs[id];
                const tabDiv = document.createElement('div');
                tabDiv.className = 'tab';
                tabDiv.setAttribute('role', 'tab');
                tabDiv.setAttribute('aria-selected', id === activeTabId);
                tabDiv.setAttribute('aria-controls', 'editor-container');

                if (id === activeTabId) {
                    tabDiv.classList.add('active');
                    hasActiveTab = true;
                }
                tabDiv.dataset.tabId = id;

                const filenameSpan = document.createElement('span');
                filenameSpan.className = 'tab-filename';
                filenameSpan.textContent = tabData.filename;
                filenameSpan.title = tabData.filename;
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
                closeBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); closeTab(id); }
                });
                tabDiv.appendChild(closeBtn);
                tabContainer.appendChild(tabDiv);
            }
        });
        updateEditorAreaIndicator(hasActiveTab);
        renderSidebarFileList();
        saveStateToLocalStorage();
    }

    function updateEditorAreaIndicator(hasActiveTab) {
        if (!editorArea) return;
        editorArea.classList.toggle('active-tab-indicator', hasActiveTab);
    }

    // --- Core File/Tab Operations ---
    function createNewUntitledFile() {
        const filename = `untitled-${untitledFileCounter++}.txt`;
        openNewTab(filename, getDisplayFileType(filename), "", false, null, false, true);
    }

    function promptRenameTab(tabId) {
        if (!openTabs[tabId]) { console.error("Attempted to rename non-existent tab:", tabId); return; }
        const currentFilename = openTabs[tabId].filename;
        const newFilename = prompt("Enter new filename:", currentFilename);

        if (newFilename && newFilename.trim() !== "" && newFilename.trim() !== currentFilename) {
            const trimmedNewFilename = newFilename.trim();
            const isDuplicate = Object.values(openTabs).some(t => t.id !== tabId && t.filename === trimmedNewFilename);
            if (isDuplicate) {
                alert(`A file named "${trimmedNewFilename}" is already open. Please choose a different name.`);
                return;
            }
            openTabs[tabId].filename = trimmedNewFilename;
            openTabs[tabId].filetype = getDisplayFileType(trimmedNewFilename);
            openTabs[tabId].isDirty = true;
            openTabs[tabId].isUntitled = false;
            renderTabs();
            if (tabId === activeTabId) {
                if (languageStatus) languageStatus.textContent = openTabs[tabId].filetype;
                if (editor) editor.setOption("mode", getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename));
            }
        }
    }

    function openNewTab(filename, filetype, content = '', isDirty = false, existingId = null, isFromLocalFile = false, isUntitled = false) {
        const newId = existingId || `tab-${nextTabIdCounter++}`;
        openTabs[newId] = { id: newId, filename, filetype, content, isDirty, isFromLocalFile, isUntitled };
        switchToTab(newId);
        return newId;
    }

    function switchToTab(tabId) {
        if (activeTabId === tabId && openTabs[tabId]) return;

        if (activeTabId && openTabs[activeTabId] && editor) {
            openTabs[activeTabId].content = editor.getValue();
        }

        if (!openTabs[tabId]) {
            console.warn(`Attempted to switch to non-existent tabId: ${tabId}.`);
            const remainingTabIds = Object.keys(openTabs);
            if (remainingTabIds.length > 0) {
                activeTabId = Object.values(openTabs).sort((a,b)=>(a.filename||"").localeCompare(b.filename||""))[0].id;
            } else {
                activeTabId = null;
            }
        } else {
            activeTabId = tabId;
        }

        if (activeTabId && openTabs[activeTabId] && editor) {
            editor.setValue(openTabs[activeTabId].content);
            editor.setOption("mode", getMimeType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename));
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

        const activeSidebarItem = sidebarFileList && sidebarFileList.querySelector(`.file-item.active`);
        if (activeSidebarItem && typeof activeSidebarItem.scrollIntoView === 'function') {
            activeSidebarItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    function closeTab(tabIdToClose) {
        if (!openTabs[tabIdToClose]) return;
        if (openTabs[tabIdToClose].isDirty && !confirm(`File "${openTabs[tabIdToClose].filename}" has unsaved changes. Close anyway?`)) {
            return;
        }

        delete openTabs[tabIdToClose];

        if (activeTabId === tabIdToClose) {
            activeTabId = null;
            const remainingTabIds = Object.keys(openTabs);
            if (remainingTabIds.length > 0) {
                const nextActiveTab = Object.values(openTabs).sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))[0];
                switchToTab(nextActiveTab.id);
            } else {
                if (editor) {
                    editor.setValue("");
                    editor.setOption("mode", "text/plain");
                    editor.clearHistory();
                }
                if (languageStatus) languageStatus.textContent = "Text";
                renderTabs();
                updateStatusBar();
            }
        } else {
            renderTabs();
        }
    }

    // --- Event Listeners for Tab Bar ---
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const clickedTabElement = e.target.closest('.tab');
            if (clickedTabElement && clickedTabElement.dataset.tabId && activeTabId !== clickedTabElement.dataset.tabId) {
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
    if (menuOpenFile) menuOpenFile.addEventListener('click', () => fileInput.click());
    if (menuSaveFile) menuSaveFile.addEventListener('click', () => {
        if (!activeTabId || !openTabs[activeTabId]) {
            alert("No active file to save!");
            return;
        }
        const tabData = openTabs[activeTabId];

        if (tabData.isUntitled || (tabData.filename && tabData.filename.startsWith("untitled-"))) {
            const newName = prompt("Save as:", tabData.filename);
            if (newName && newName.trim() !== "") {
                const trimmedNewName = newName.trim();
                const isDuplicate = Object.values(openTabs).some(t => t.id !== activeTabId && t.filename === trimmedNewName);
                if (isDuplicate) {
                    alert(`A file named "${trimmedNewName}" is already open in another tab.`);
                    return;
                }
                tabData.filename = trimmedNewName;
                tabData.filetype = getDisplayFileType(trimmedNewName);
                tabData.isUntitled = false;
            } else {
                return;
            }
        }

        const content = editor.getValue();
        const filename = tabData.filename;
        const blob = new Blob([content], { type: getMimeType(tabData.filetype || filename) });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        openTabs[activeTabId].isDirty = false;
        openTabs[activeTabId].content = content;
        if (languageStatus && openTabs[activeTabId]) languageStatus.textContent = openTabs[activeTabId].filetype;
        renderTabs();
        console.log(`File "${filename}" saved successfully.`);
    });

    if (menuFind) menuFind.addEventListener('click', () => {
        if (editor && typeof editor.execCommand === 'function') {
            editor.focus();
            editor.execCommand("findPersistent");
        } else { console.error("Find from menu: Editor or findPersistent command not available."); }
    });
    if (menuReplace) menuReplace.addEventListener('click', () => {
        if (editor && typeof editor.execCommand === 'function') {
            editor.focus();
            editor.execCommand("replace");
        } else { console.error("Replace from menu: Editor or replace command not available."); }
    });
    if (menuToggleComment) menuToggleComment.addEventListener('click', () => {
        if (editor && typeof editor.execCommand === 'function') {
            editor.focus(); editor.execCommand("toggleComment");
        } else { console.error("ToggleComment from menu: Editor or command not available."); }
    });

    if (menuToggleTheme) {
        menuToggleTheme.addEventListener('click', () => {
            const currentGlobalTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
            applyTheme(currentGlobalTheme === 'light' ? 'dark' : 'light');
        });
    }


    // --- File Input Handling ---
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const content = ev.target.result;
                    const filename = file.name;
                    const filetype = getDisplayFileType(filename);

                    const existingTab = Object.values(openTabs).find(tab => tab.filename === filename && tab.isFromLocalFile);
                    if (existingTab) {
                        if (confirm(`"${filename}" is already open. Reload it? (Current unsaved changes in that tab will be lost)`)) {
                            openTabs[existingTab.id].content = content;
                            openTabs[existingTab.id].isDirty = false;
                            openTabs[existingTab.id].filetype = filetype;
                             if (activeTabId === existingTab.id && editor) {
                                editor.setValue(content);
                                editor.setOption("mode", getMimeType(filetype));
                                editor.clearHistory();
                            }
                            switchToTab(existingTab.id);
                        }
                    } else {
                        openNewTab(filename, filetype, content, false, null, true, false);
                    }
                    fileInput.value = null;
                };
                reader.onerror = (err) => {
                    console.error("Error reading file:", err);
                    alert(`An error occurred while reading the file: ${file.name}`);
                };
                reader.readAsText(file);
            }
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
                return;
            }

            const isCurrentlyExpanded = this.getAttribute('aria-expanded') === 'true';

            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(otherItem => {
                if (otherItem !== this) {
                    otherItem.classList.remove('active');
                    otherItem.setAttribute('aria-expanded', 'false');
                }
            });

            this.classList.toggle('active', !isCurrentlyExpanded);
            this.setAttribute('aria-expanded', !isCurrentlyExpanded);
            event.stopPropagation();
        });
    });

    document.addEventListener('click', function(event) {
        if (!event.target.closest('.menu-item[role="button"]')) {
            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(item => {
                item.classList.remove('active');
                item.setAttribute('aria-expanded', 'false');
            });
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            let activeMenu = null;
            document.querySelectorAll('.menu-item[aria-expanded="true"]').forEach(item => {
                item.classList.remove('active');
                item.setAttribute('aria-expanded', 'false');
                activeMenu = item;
            });
            if (activeMenu) {
                 const menuButtonSpan = activeMenu.querySelector('span');
                 if (menuButtonSpan && typeof menuButtonSpan.focus === 'function') menuButtonSpan.focus();
                 else if (typeof activeMenu.focus === 'function') activeMenu.focus();

            }
        }
    });

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', function(e) {
        const currentModKey = isMac ? e.metaKey : e.ctrlKey; // Renamed to avoid conflict

        const activeElement = document.activeElement;
        const inCodeMirrorDialog = activeElement && activeElement.closest('.CodeMirror-dialog');
        const inCodeMirrorItself = editor && editor.hasFocus();
        const inMenu = activeElement && activeElement.closest('.menu-item, .dropdown-menu');

        if (inCodeMirrorDialog && (e.key === 'Enter' || e.key === 'Escape')) return;
        if (inMenu && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(e.key)) return;

        if (currentModKey && e.key.toLowerCase() === 's') {
            e.preventDefault(); if (menuSaveFile) menuSaveFile.click();
        } else if (currentModKey && e.key.toLowerCase() === 'n') {
            e.preventDefault(); if (menuNewFile) menuNewFile.click();
        } else if (currentModKey && e.key.toLowerCase() === 'o') {
            e.preventDefault(); if (menuOpenFile) menuOpenFile.click();
        } else if (currentModKey && e.key.toLowerCase() === 'w') {
            if (!inCodeMirrorDialog || (activeElement && activeElement.tagName !== 'INPUT')) {
                e.preventDefault();
                if (activeTabId) closeTab(activeTabId);
            }
        } else if (e.key === 'F2') {
            if (!inCodeMirrorDialog && !inCodeMirrorItself && activeTabId) {
                e.preventDefault();
                promptRenameTab(activeTabId);
            }
        }
    });

    // --- Graceful Unload ---
    window.addEventListener('beforeunload', (event) => {
        if (activeTabId && openTabs[activeTabId] && editor && openTabs[activeTabId].isDirty) {
            openTabs[activeTabId].content = editor.getValue();
        }
        saveStateToLocalStorage();

        let hasUnsavedChanges = Object.values(openTabs).some(tab => tab.isDirty);
        if (hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // --- Initial Load ---
    updateShortcutText(); // Update shortcuts based on OS
    loadSidebarWidth();   // Load sidebar width first

    const stateLoaded = loadStateFromLocalStorage(); // Load tab states

    // Editor initialization is now above, using saved theme.
    // Apply global theme to body (if not already done by editor init logic)
    const savedTheme = localStorage.getItem(LS_THEME) || 'dark';
    if (!document.body.classList.contains('light-theme') && savedTheme === 'light') {
        applyTheme('light');
    } else if (document.body.classList.contains('light-theme') && savedTheme === 'dark') {
        applyTheme('dark');
    }


    if (stateLoaded && Object.keys(openTabs).length > 0) {
        renderTabs(); // Render tabs from loaded state
        let tabToActivate = activeTabId;
        if (!tabToActivate || !openTabs[tabToActivate]) {
            const sortedTabs = Object.values(openTabs).sort((a, b) => (a.filename || "").localeCompare(b.filename || ""));
            tabToActivate = sortedTabs.length > 0 ? sortedTabs[0].id : null;
        }
        if (tabToActivate) {
            switchToTab(tabToActivate);
        } else { // No valid active tab found, but tabs exist
            activeTabId = null; // Ensure no active tab is set
            if (Object.keys(openTabs).length === 0) { // if truly no tabs after all checks
                 createNewUntitledFile();
            } else if (editor) { // If tabs exist but no active one, clear editor but don't create new
                 editor.setValue("");
                 editor.setOption("mode", "text/plain");
                 if (languageStatus) languageStatus.textContent = "Text";
                 updateStatusBar();
            }
        }
    } else { // No state loaded or no tabs in state
        openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1;
        createNewUntitledFile();
    }

    calculateMaxSidebarWidth(); // Set initial max width based on window size
});